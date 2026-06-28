import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getMeeting, updateMeeting } from '@/lib/db';
import { getText, MEETING_NOTES_SCHEMA } from '@/lib/ai-response';

type MeetingNotesResponse = {
  summary: string;
  action_items: string[];
  decisions: string[];
  follow_up_draft: string;
  relationship_notes: string;
};

function trimTranscript(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 60000);
}

function fallbackFollowUp(meetingTitle: string, summary: string): string {
  return `Thanks again for taking the time to chat. I appreciated hearing more about ${meetingTitle}.\n\nOne thing that stood out: ${summary.slice(0, 260)}\n\nWould be great to stay in touch.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  let body: { id?: number; transcript?: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const meeting = getMeeting(id);
  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

  const transcript = trimTranscript(body.transcript || meeting.transcript || '');
  if (transcript.length < 40) {
    return NextResponse.json({ error: 'Transcript must be at least 40 characters' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey, maxRetries: 3 });
  const attendeeLine = meeting.attendees
    .map(a => [a.name, a.email].filter(Boolean).join(' <') + (a.email ? '>' : ''))
    .filter(Boolean)
    .join(', ');

  const prompt = `You are the AI notetaking agent for a personal networking CRM.

Turn this raw meeting transcript into concise relationship notes Avery can act on.

Meeting:
- Title: ${meeting.title}
- Scheduled start: ${meeting.start_iso || 'unknown'}
- Attendees: ${attendeeLine || 'unknown'}
- Extra context: ${body.context?.trim() || 'none'}

Rules:
- Extract only facts supported by the transcript.
- Prioritize relationship context, useful follow-up hooks, concrete commitments, and next steps.
- Keep the summary skimmable and specific.
- Action items should be written as owner + action when the owner is clear.
- The follow_up_draft should sound natural, brief, and useful for a post-call thank-you.
- If there are no explicit decisions, return an empty decisions array.

Transcript:
${transcript}`;

  let parsed: MeetingNotesResponse;
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: MEETING_NOTES_SCHEMA },
      },
    });
    parsed = JSON.parse(getText(response)) as MeetingNotesResponse;
  } catch (err) {
    console.error('[meetings/notetaker] failed:', err);
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Anthropic returned ${err.status}: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Notetaker failed' }, { status: 502 });
  }

  const notes = [
    parsed.summary,
    parsed.relationship_notes ? `Relationship notes:\n${parsed.relationship_notes}` : '',
    parsed.action_items.length ? `Action items:\n${parsed.action_items.map(item => `- ${item}`).join('\n')}` : '',
    parsed.decisions.length ? `Decisions:\n${parsed.decisions.map(item => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const updated = updateMeeting(id, {
    transcript,
    notes,
    ai_summary: parsed.summary,
    action_items: parsed.action_items,
    decisions: parsed.decisions,
    follow_up_draft: parsed.follow_up_draft || fallbackFollowUp(meeting.title, parsed.summary),
    state: meeting.state === 'confirmed' ? 'completed' : meeting.state,
  });

  return NextResponse.json({ meeting: updated });
}
