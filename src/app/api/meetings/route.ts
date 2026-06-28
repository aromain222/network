import { NextRequest, NextResponse } from 'next/server';
import {
  createManualMeeting,
  createProposedMeeting,
  deleteMeeting,
  listMeetings,
  updateMeeting,
} from '@/lib/db';

export async function GET() {
  return NextResponse.json({ meetings: listMeetings() });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const kind = body.kind as string;
  const contact_id = (body.contact_id as string) || null;
  const title = (body.title as string) || 'Untitled meeting';

  if (kind === 'proposed') {
    const times = Array.isArray(body.proposed_times) ? (body.proposed_times as string[]) : [];
    if (times.length === 0) return NextResponse.json({ error: 'proposed_times required' }, { status: 400 });
    const meeting = createProposedMeeting({
      contact_id,
      title,
      proposed_times: times,
      attendees: Array.isArray(body.attendees) ? (body.attendees as { email?: string; name?: string }[]) : [],
    });
    return NextResponse.json({ meeting });
  }

  if (kind === 'manual') {
    const start_iso = body.start_iso as string;
    const end_iso = body.end_iso as string;
    if (!start_iso || !end_iso) return NextResponse.json({ error: 'start_iso and end_iso required' }, { status: 400 });
    const meeting = createManualMeeting({
      contact_id,
      title,
      start_iso,
      end_iso,
      location: (body.location as string) || null,
      meet_link: (body.meet_link as string) || null,
    });
    return NextResponse.json({ meeting });
  }

  return NextResponse.json({ error: 'kind must be "proposed" or "manual"' }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const meeting = updateMeeting(id, body);
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ meeting });
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteMeeting(id);
  return NextResponse.json({ ok: true });
}
