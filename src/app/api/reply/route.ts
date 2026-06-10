import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NETWORKING_SYSTEM_PROMPT } from '@/lib/system-prompt';
import {
  cleanDraft,
  getText,
  REPLY_RESPONSE_SCHEMA,
  wordCount,
} from '@/lib/ai-response';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  let body: { reply: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.reply?.trim()) {
    return NextResponse.json({ error: 'Reply text is required' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  const userMessage = body.context
    ? `Context about this person:\n${body.context}\n\nThey replied with:\n"${body.reply}"\n\nDraft the shortest natural response that handles the next step. Return only the requested structured output.`
    : `Someone replied to Avery's outreach with:\n"${body.reply}"\n\nDraft the shortest natural response that handles the next step. Return only the requested structured output.`;

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
