import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NETWORKING_SYSTEM_PROMPT } from '@/lib/system-prompt';
import {
  cleanDraft,
  getText,
  OUTREACH_RESPONSE_SCHEMA,
  wordCount,
} from '@/lib/ai-response';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  let body: { profile: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.profile?.trim()) {
    return NextResponse.json({ error: 'Profile text is required' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  const contextLine = body.context?.trim() ? `\n\nAdditional context from Avery: ${body.context.trim()}` : '';
  const userContent = `Here is a LinkedIn profile. Generate two natural, connection-first outreach messages for Avery following the rules.

Each message must:
- Be 25-60 words
- Use only one detail about Avery
- Give the recipient one clear, easy topic to respond to
- Sound like a genuine LinkedIn note, not a compressed cover letter
- Either identify Avery or explain his interest, never both
- Include a direct conversational question in at least one option
- Never infer why the person changed roles. Ask about a transition only when both roles are explicitly stated

Option A is the personalized option:
- Make the first sentence impossible to write from only the person's name, title, and company
- Use a named product, responsibility, customer problem, prior role, promotion, project, or stated focus

Option B is the generic option:
- Focus broadly on their current role, company, or field
- Keep it simple, natural, and low pressure
- Do not repeat Option A's researched detail
- Do not sound uninformed; express one genuine area of curiosity

Return only the requested structured output.\n\n${body.profile}${contextLine}`;
  console.log('[generate] Profile length:', body.profile.length, '| First 200 chars:', body.profile.slice(0, 200));

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: NETWORKING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: OUTREACH_RESPONSE_SCHEMA },
      },
    });
  } catch (err) {
    console.error('[generate] API call failed:', err);
    return NextResponse.json({ error: `API call failed: ${err instanceof Error ? err.message : 'Unknown error'}` }, { status: 502 });
  }

  const text = getText(response);

  console.log('[generate] Response length:', text.length, '| Stop reason:', response.stop_reason);
  console.log('[generate] Raw response:', text.slice(0, 500));

  try {
    const parsed = JSON.parse(text);
    const result = {
      options: Array.isArray(parsed.options)
        ? parsed.options.map((option: { label?: unknown; message?: unknown }) => ({
            label: typeof option.label === 'string' ? option.label : '',
            message: cleanDraft(option.message),
          }))
        : [],
      hook_used: parsed.hook_used ?? '',
      person: {
        name: parsed.person?.name ?? '',
        company: parsed.person?.company ?? '',
        role: parsed.person?.role ?? '',
      },
      reasoning: parsed.reasoning ?? '',
    };
    if (result.options.length !== 2) {
      return NextResponse.json({ error: 'AI did not return exactly two message options', raw: text }, { status: 502 });
    }
    const invalidOption = result.options.find((option: { label: string; message: string }) => {
      const words = wordCount(option.message);
      return words < 20 || words > 65 || !option.message;
    });
    if (invalidOption) {
      return NextResponse.json({ error: 'AI returned a message outside the required length' }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw: text }, { status: 502 });
  }
}
