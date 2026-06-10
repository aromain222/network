import { NextResponse } from 'next/server';
import { getCalendarEvents } from '@/lib/google';

export async function GET() {
  const events = await getCalendarEvents(60);
  return NextResponse.json({ events });
}
