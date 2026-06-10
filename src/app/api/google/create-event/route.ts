import { NextRequest, NextResponse } from 'next/server';
import { createCalendarEvent } from '@/lib/google';
import { setContactGoogleEventId } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contactId, summary, description, startISO, endISO, location, attendeeEmail } = body;
    if (!summary || !startISO || !endISO) {
      return NextResponse.json({ error: 'Missing summary, startISO, or endISO' }, { status: 400 });
    }
    const eventId = await createCalendarEvent({ summary, description, startISO, endISO, location, attendeeEmail });
    if (!eventId) return NextResponse.json({ error: 'Google Calendar not connected or insert failed' }, { status: 502 });
    if (contactId) setContactGoogleEventId(contactId, eventId);
    return NextResponse.json({ eventId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
