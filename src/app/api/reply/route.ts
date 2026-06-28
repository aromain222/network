import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NETWORKING_SYSTEM_PROMPT } from '@/lib/system-prompt';
import {
  cleanDraft,
  getText,
  REPLY_RESPONSE_SCHEMA,
} from '@/lib/ai-response';
import { getAllContacts, getGoogleTokens } from '@/lib/db';
import { getCalendarBusy } from '@/lib/google';
import {
  buildSchedulingProse,
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

function extractEmail(value: string): string {
  return value.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? '';
}

function asksForEmail(value: string, context = ''): boolean {
  const combined = `${value}\n${context}`;
  return Boolean(extractEmail(combined))
    || /\b(email me|send me an email|shoot me an email|reach out by email|follow up over email|draft as email|write an email)\b/i.test(combined);
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
  return buildSchedulingProse(firstName, slots, wantsET);
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

  const client = new Anthropic({ apiKey, maxRetries: 3 });
  const emailTo = extractEmail(`${latestInbound.text}\n${body.context || ''}`);
  const shouldDraftEmail = asksForEmail(latestInbound.text, body.context);

  const userMessage = shouldDraftEmail
    ? `Draft a follow-up email from Avery.

Context about this person:
${body.context || 'No extra context supplied.'}

Their latest reply was:
"${latestInbound.text}"

Detected email address: ${emailTo || 'none'}

Email rules:
- Return reply_type "follow-up email".
- subject should be short and specific. Prefer "Avery Romain - Amherst '27" unless a stronger shared hook is explicit.
- email_to should be the detected address if present, otherwise "".
- Body format:
  Hi [first name],

  Thanks for responding, really appreciate it.
  One short sentence on who Avery is and what he is exploring, tailored to the person.
  One short sentence on what he would like to learn from them.
  Would you have 20 minutes for a call sometime in the next few weeks?

  Best,
  Avery Romain
  Amherst College '27
- Keep the body under 110 words.
- Do not include a "Subject:" line inside reply because subject is a separate JSON field.
- No em dashes, no hype, no "pick your brain", no "hope this finds you well".
- Use only supplied facts.

Return only the requested structured output.`
    : body.context
      ? `Context about this person:\n${body.context}\n\nTheir latest reply was:\n"${latestInbound.text}"\n\nDraft the shortest natural response that handles the next step. Return subject and email_to as empty strings. Return only the requested structured output.`
      : `Someone's latest reply to Avery was:\n"${latestInbound.text}"\n\nDraft the shortest natural response that handles the next step. Return subject and email_to as empty strings. Return only the requested structured output.`;

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
    let msg: string;
    if (err instanceof Anthropic.APIConnectionTimeoutError) msg = "Reply drafting timed out — try again in a moment.";
    else if (err instanceof Anthropic.APIConnectionError) msg = "Couldn't reach Anthropic (network blip) — try again in a moment.";
    else if (err instanceof Anthropic.RateLimitError) msg = "Rate-limited — wait a few seconds and retry.";
    else if (err instanceof Anthropic.APIError) msg = `Anthropic returned ${err.status} — ${err.message}`;
    else msg = `API call failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const text = getText(response);

  try {
    const parsed = JSON.parse(text);
    const result = {
      reply: cleanDraft(parsed.reply),
      subject: cleanDraft(parsed.subject),
      email_to: cleanDraft(parsed.email_to) || emailTo,
      reply_type: parsed.reply_type ?? '',
      person: {
        name: parsed.person?.name ?? '',
        company: parsed.person?.company ?? '',
        role: parsed.person?.role ?? '',
      },
    };
    if (!result.reply?.trim()) {
      return NextResponse.json({ error: 'AI returned an empty reply' }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw: text }, { status: 502 });
  }
}
