import { NextRequest, NextResponse } from 'next/server';
import { getAllContacts } from '@/lib/db';
import { findSlots, DEFAULT_PREFS, type Prefs } from '@/lib/scheduling';
import { getCalendarBusy } from '@/lib/google';

export async function POST(req: NextRequest) {
  let prefs: Prefs = DEFAULT_PREFS;
  let hintText = '';
  let overrides = {};
  try {
    const body = await req.json();
    prefs = { ...DEFAULT_PREFS, ...body.prefs };
    hintText = (body.context || '') + ' ' + (body.reply || '');
    overrides = body.overrides || {};
  } catch {
    // use defaults
  }

  const contacts = getAllContacts();
  const externalBusy = await getCalendarBusy(30);
  const slots = findSlots(contacts, prefs, hintText, 3, overrides, externalBusy);
  return NextResponse.json({ slots, total: slots.length, googleBusyCount: externalBusy.length });
}
