import { NextResponse } from 'next/server';
import { getCalendarEvents } from '@/lib/google';
import {
  findContactByEmail,
  getDb,
  listMeetings,
  upsertGoogleMeeting,
  updateMeeting,
} from '@/lib/db';
import { getAllContacts } from '@/lib/db';

function matchContactToEvent(
  attendees: { email?: string; name?: string }[],
  summary: string,
): string | null {
  for (const a of attendees) {
    if (a.email) {
      const c = findContactByEmail(a.email);
      if (c) return c.id;
    }
  }
  const allContacts = getAllContacts();
  const lowerSummary = summary.toLowerCase();
  for (const a of attendees) {
    if (a.name) {
      const c = allContacts.find(x => x.name.toLowerCase() === a.name!.toLowerCase());
      if (c) return c.id;
    }
  }
  for (const c of allContacts) {
    const first = c.name.split(' ')[0]?.toLowerCase();
    if (first && first.length > 2 && lowerSummary.includes(first)) return c.id;
  }
  return null;
}

export async function POST() {
  const events = await getCalendarEvents(60);

  let upserts = 0;
  let reconciled = 0;
  let marked_completed = 0;

  for (const ev of events) {
    const contact_id = matchContactToEvent(ev.attendees ?? [], ev.summary);
    upsertGoogleMeeting({
      google_event_id: ev.id,
      title: ev.summary,
      start_iso: ev.start,
      end_iso: ev.end,
      location: ev.location ?? null,
      meet_link: ev.meetLink ?? null,
      attendees: ev.attendees ?? [],
      contact_id,
    });
    upserts++;
  }

  // Reconcile proposed meetings: if a Google event now exists with matching contact_id
  // within +/- 21 days of any proposed time, promote the proposed → cancelled and link
  // the Google event as the authoritative record.
  const meetings = listMeetings();
  const proposed = meetings.filter(m => m.state === 'proposed');
  for (const p of proposed) {
    if (!p.contact_id) continue;
    const match = meetings.find(m =>
      m.source === 'google'
      && m.contact_id === p.contact_id
      && m.start_iso
      && Math.abs(new Date(m.start_iso).getTime() - Date.parse(p.proposed_times[0] || p.created_at)) < 21 * 86400000
    );
    if (match) {
      updateMeeting(p.id, { state: 'cancelled', notes: `Auto-resolved: booked as Google event ${match.google_event_id}` });
      reconciled++;
    }
  }

  // Auto-flip past confirmed meetings → completed (so they show in the follow-up rail)
  const db = getDb();
  const result = db.prepare(
    `UPDATE meetings SET state = 'completed', updated_at = datetime('now')
     WHERE state = 'confirmed' AND start_iso IS NOT NULL AND datetime(end_iso) < datetime('now')`
  ).run();
  marked_completed = result.changes;

  return NextResponse.json({ upserts, reconciled, marked_completed });
}

export async function GET() {
  return POST();
}
