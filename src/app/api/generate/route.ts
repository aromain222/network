import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NETWORKING_SYSTEM_PROMPT } from '@/lib/system-prompt';
import {
  cleanDraft,
  getText,
  OUTREACH_RESPONSE_SCHEMA,
  PROFILE_ANALYSIS_SCHEMA,
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
  const analysisPrompt = `Analyze this LinkedIn profile before writing any outreach.

Rank shared connections using this exact priority:
1. Compound direct connection: same school plus same sport/team, same school plus same organization, or another two-part overlap
2. Same school and same specific activity separately supported by the profile
3. Same school
4. Same former school, hometown, or regional connection
5. Same professional or identity-based organization
6. Direct overlap with Avery's actual building, investing, or work experience
7. Broad role or industry interest

Critical rules:
- If the person attended Amherst and played football there, strongest_connection must be "Amherst football," not merely "Amherst."
- Never infer football from Amherst attendance alone. Require explicit football evidence.
- Select exactly one Avery background that mirrors the strongest connection.
- option_a_detail must be one concrete profile fact that creates a natural question Avery would genuinely ask.
- Prioritize professional relevance over novelty. Current responsibilities, a specific promotion, a clear career move, or a named area of work beat an unusual major or minor.
- Do not select a degree combination, certification, award, or hobby merely because it is rare. Use it only when Avery shares it or it directly explains the conversation topic.
- option_b_detail must describe only the broad hook or field. It must not contain a profile-specific project, transition, responsibility, employer history, or achievement.
- The question suggested by each detail must directly follow from that detail. Never select an education detail and then ask an unrelated career question.
- Use only facts in the profile or Avery's supplied context.

Profile:
${body.profile}${contextLine}`;

  console.log('[generate] Profile length:', body.profile.length, '| First 200 chars:', body.profile.slice(0, 200));

  let analysis;
  try {
    const analysisResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: analysisPrompt }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: PROFILE_ANALYSIS_SCHEMA },
      },
    });
    analysis = JSON.parse(getText(analysisResponse));
  } catch (err) {
    console.error('[generate] Profile analysis failed:', err);
    return NextResponse.json({ error: `Profile analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}` }, { status: 502 });
  }

  const role = String(analysis.person?.role ?? '').toLowerCase();
  const background = String(analysis.avery_background ?? '').toLowerCase();
  const isCustomerFacing = /\b(sales|account executive|ae|sdr|bdr|cse|cs|customer success|customer engineer|solutions|sales engineer|forward[- ]?deployed|fde|account manager|gtm|go[- ]to[- ]market|sales director|regional director|enterprise)/i.test(role)
    || background.includes('customer-facing');
  const tone = String(body.context ?? '').toLowerCase();
  const wantsNetworky = /more networky|warmer|less salesy|more casual|less formal|softer|peer/i.test(tone);

  const connectionGuidance = String(analysis.strongest_connection).toLowerCase().includes('amherst football')
    ? `AMHERST FOOTBALL VOICE:
- Type 1 model: "Hey Sebastian, I'm Avery and I play football at Amherst. Always cool seeing another Amherst football alum working in AI. I was curious how much of your role is technical implementation versus working directly with customers. Would you be open to a quick conversation?"
- Type 2 model: "Hey Sebastian, I'm Avery and I play football at Amherst too. Always trying to stay connected with former players doing interesting things after school. Would you be open to connecting?"
- Adapt the facts, but preserve this relaxed rhythm.
- Never say someone "made it to" a company. Never say "I'm really interested in that space."`
    : String(analysis.strongest_connection).toLowerCase().includes('amherst')
      ? `AMHERST VOICE:
- Type 1 model: "Hey Jarrad, I'm Avery, a junior at Amherst. I saw you advise founder-owned business services companies and was curious what makes a company compelling in that market. Would you be open to a quick conversation?"
- Type 2 model: "Hey Jarrad, I'm Avery, a junior at Amherst trying to figure out how finance and tech actually fit together. I always like connecting with alums who've navigated that world. Would you be open to a quick chat?"
- Type 1 gets one professional fact and one directly related question. Do not list multiple sectors, transactions, or responsibilities.
- Type 2 uses Amherst and Avery's honest curiosity, but no specific fact from the recipient's profile.`
      : isCustomerFacing
        ? `CUSTOMER-FACING AI VOICE (sales, SE, AE, CSE, FDE, solutions):
- Avery's background must read as a curious student exploring customer-facing roles, not as a peer founder.
- Type 1 model: "Hey Mikhail, I'm Avery, a junior at Amherst thinking a lot about customer-facing roles in AI. Curious what pulled you from ServiceNow to an earlier-stage AI company like Decagon — would love to hear how that decision came together. Would you be open to a quick chat?"
- Type 2 model: "Hey Mikhail, I'm Avery, a junior at Amherst trying to figure out what customer-facing roles in AI actually look like up close. Your background looks a lot like the path I'd want to be on. Would you be open to a quick conversation?"
- Never lead with "founder of an AI investing platform" for these recipients, even when they work at an AI company.
- Type 1 asks one question caused by their actual career arc (most recent move, what brought them to this company, how the role differs from their last one). Do not ask about "the sales motion" or "how X and Y fit together in practice" — those read like research calls, not networking.`
        : '';

  const toneGuidance = wantsNetworky
    ? `NETWORKY TONE OVERRIDE (applied because Avery's context requested it):
- Sound like a 21-year-old sending a real DM, not a templated outreach. Casual, peer, warm.
- Drop "founder of an AI investing platform" framing even if normally appropriate. Lead with shared world or honest student curiosity.
- Remove hedges like "trying to figure out how X actually fits together in practice" when they make the note feel like a research request. Replace with concrete curiosity about a specific career move.
- Two short sentences plus the ask is ideal. Three sentences max.
- Type 2 should still be usable without specific profile detail, but it should feel like a curious student saying hi, not a pitch.`
    : '';

  const userContent = `Write exactly two first-touch LinkedIn messages using the completed profile analysis below.

PROFILE ANALYSIS:
${JSON.stringify(analysis)}

WRITING CONTRACT:
- Return labels exactly as "Type 1 — Personalized" and "Type 2 — Generic".
- Both messages: 25-80 words, 2-3 short sentences, one Avery background, one ask.
- Use the exact avery_background selected in the analysis. Do not add another Avery credential.
- Lead with the strongest_connection. Do not downgrade a compound connection such as Amherst football to Amherst.
- Type 1 — Personalized: use option_a_detail. Reference exactly one real profile detail and make the question follow naturally from it. Keep it under 100 words.
- Type 2 — Generic: do not reference any specific project, transition, responsibility, achievement, or employer history from the recipient's profile. Use only the strongest shared hook plus Avery's honest uncertainty or curiosity. Keep it under 80 words.
- Type 2 should have personality, using ideas such as "trying to figure out how X and Y actually fit together," "trying to figure out where I fit," or "always trying to stay connected with people doing interesting things." Vary the wording instead of copying these mechanically.
- Write like a direct 21-year-old student, not a recruiter, marketer, or career coach.
- End with "Would you be open to connecting?" or "Would you be open to a quick conversation?"
- Avoid stiff phrases: "your path," "hear a bit about," "if you're open to it," "caught my eye," "stood out," "current junior," "football side," "figured I had to reach out," and "seems like."
- Avoid empty reactions such as "pretty rare combo," "always great to connect," "really impressive," or "I noticed."
- Never write "always looking to connect," "always looking to connect with alums," or any similar networking-purpose statement.
- Never write "saw you went to Amherst." Say "I'm also at Amherst," "fellow Mammoth," or reference the shared team naturally.
- For Amherst football, introduce Avery as "I'm Avery and I play football at Amherst" or "I'm Avery, a junior on the football team at Amherst." Then say "Always cool seeing another Amherst football alum..." or ask the work question directly.
- Do not write "I'm Avery, a football player at Amherst." It sounds unnatural.
- Do not add a sentence that merely says Avery is interested in the space. The connection and question should carry the message.
- Avoid vague filler such as "that space," "your experience," or "your journey." Name the role, work, or shared connection.
- In Type 1, the question must be caused by the detail immediately before it. If the question is about M&A advisory, the detail must concern M&A, sector coverage, a transaction, or the advisory role.
- When deciding whether to include a detail, leave it out if it makes the message feel researched for its own sake.
- Never infer motivation or summarize multiple employers.
- ${connectionGuidance}
- ${toneGuidance}
- Return only the requested structured output.`;

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
    console.error('[generate] Message generation failed:', err);
    return NextResponse.json({ error: `Message generation failed: ${err instanceof Error ? err.message : 'Unknown error'}` }, { status: 502 });
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
      hook_used: analysis.strongest_connection || parsed.hook_used || '',
      person: {
        name: parsed.person?.name ?? '',
        company: parsed.person?.company ?? '',
        role: parsed.person?.role ?? '',
      },
      reasoning: `${analysis.strongest_connection}: ${analysis.connection_evidence}`,
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
