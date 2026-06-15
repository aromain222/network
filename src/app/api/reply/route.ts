import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NETWORKING_SYSTEM_PROMPT } from '@/lib/system-prompt';
import {
  cleanDraft,
  getText,
  REPLY_RESPONSE_SCHEMA,
  wordCount,
} from '@/lib/ai-response';
import { getAllContacts, getGoogleTokens } from '@/lib/db';
import { getCalendarBusy } from '@/lib/google';
import {
  DEFAULT_PREFS,
  extractLatestInboundMessage,
  extractSchedulingHint,
  findSlots,
  stripProposedTimes,
  type Prefs,
} from '@/lib/scheduling';

function asksForAvailability(value: string): boolean {
  const normalized = value.replace(/[’‘]/g, "'");
  return /\b(what(?:'s| is)\s+your\s+schedule|what\s+does\s+your\s+schedule\s+look\s+like|what\s+times?\s+work|when\s+(?:are\s+you|would\s+you\s+be)\s+(?:free|available)|when\s+works|your\s+availability|send\s+(?:me\s+)?(?:some\s+)?times|free\s+to\s+(?:chat|talk|connect)|find\s+a\s+time|can\s+you\s+make|could\s+you\s+do)\b/i.test(normalized);
}

function extractSenderFirstName(value: string): string {
  const latest = extractLatestInboundMessage(value);
  if (latest.sender) return latest.sender.split(/\s+/)[0];
  const lines = value.split('\n').map(line => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    const header = line.match(/^([A-Z][A-Za-z'-]+)(?:\s+[A-Z][A-Za-z'-]+){0,3}$/);
    if (header && !/^(hey|hi|yes|thanks|definitely)$/i.test(header[1])) return header[1];
  }
  return 'there';
}

function schedulingReply(
  firstName: string,
  slots: { day: string; hour: number; minute: number }[],
  request: string,
): string {
  const wantsET = /\b(et|est|edt|eastern)\b/i.test(request);
  const choices = slots.map(slot => {
    if (!wantsET) return `- ${slot.day}`;
    const etHour = (slot.hour + 3) % 24;
    const period = etHour >= 12 ? 'PM' : 'AM';
    const displayHour = etHour > 12 ? etHour - 12 : etHour === 0 ? 12 : etHour;
    const minute = slot.minute ? `:${String(slot.minute).padStart(2, '0')}` : '';
    return `- ${slot.day} (${displayHour}${minute}${period} ET)`;
  }).join('\n');
  return `Hey ${firstName}, definitely! Here are a few times that work for me:\n${choices}\nLet me know if any of those work for you.`;
}

export async function POST(req: NextRequest) {
  let body: {
    reply: string;
    context?: string;
    prefs?: Prefs;
    overrides?: Record<string, { date: string; time: string } | 'removed'>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.reply?.trim()) {
    return NextResponse.json({ error: 'Reply text is required' }, { status: 400 });
  }

  const latestInbound = extractLatestInboundMessage(body.reply);
  if (asksForAvailability(latestInbound.text)) {
    const calendarConnected = Boolean(getGoogleTokens());
    const externalBusy = calendarConnected ? await getCalendarBusy(30) : [];
    const slots = findSlots(
      getAllContacts(),
      { ...DEFAULT_PREFS, ...body.prefs },
      `${stripProposedTimes(body.context || '')} ${extractSchedulingHint(body.reply)}`,
      3,
      body.overrides || {},
      externalBusy,
    );
    if (slots.length === 0) {
      return NextResponse.json({
        error: calendarConnected
          ? 'No available times were found within your scheduling preferences'
          : 'Google Calendar is not connected and no local availability was found',
      }, { status: 409 });
    }
    return NextResponse.json({
      reply: schedulingReply(extractSenderFirstName(body.reply), slots, latestInbound.text),
      reply_type: 'availability',
      person: { name: '', company: '', role: '' },
      available_slots: slots,
      calendar_checked: true,
      calendar_connected: calendarConnected,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  const client = new Anthropic({ apiKey });

  const userMessage = body.context
    ? `Context about this person:\n${body.context}\n\nTheir latest reply was:\n"${latestInbound.text}"\n\nDraft the shortest natural response that handles the next step. Return only the requested structured output.`
    : `Someone's latest reply to Avery was:\n"${latestInbound.text}"\n\nDraft the shortest natural response that handles the next step. Return only the requested structured output.`;

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 450,
      system: NETWORKING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: REPLY_RESPONSE_SCHEMA },
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `API call failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 502 },
    );
  }

  const text = getText(response);

  try {
    const parsed = JSON.parse(text);
    const result = {
      reply: cleanDraft(parsed.reply),
      reply_type: parsed.reply_type ?? '',
      person: {
        name: parsed.person?.name ?? '',
        company: parsed.person?.company ?? '',
        role: parsed.person?.role ?? '',
      },
    };
    const maxWords = result.reply_type === 'follow-up email' ? 90 : 45;
    if (!result.reply || wordCount(result.reply) > maxWords) {
      return NextResponse.json({ error: 'AI returned a reply outside the required length' }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw: text }, { status: 502 });
  }
}
