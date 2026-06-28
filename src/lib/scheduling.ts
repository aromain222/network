import type { Contact } from './types';

export type Prefs = {
  days: boolean[];
  startHour: number;
  endHour: number;
  meetingLength: number;
  buffer: number;
  blackoutDates: string[];
};

export type Hint = {
  startOffset?: number;
  endOffset?: number;
  preferDays?: number[];
  minHour?: number;
  maxHour?: number;
};

export type Slot = { date: string; day: string; time: string; hour: number; minute: number };

// Turn "Monday June 22, 10AM PT" into "Monday, June 22 at 10am PT"
export function naturalizeSlotDay(day: string): string {
  return day
    .replace(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+/, '$1, ')
    .replace(/,\s*(\d{1,2}(?::\d{2})?)\s*(AM|PM)/i, (_match, time, period) => ` at ${time}${period.toLowerCase()}`);
}

// Build a prose scheduling reply, e.g.:
//   1 slot:  "Hey Ashley, I'm free Monday, June 22 at 10am PT — whatever works best for you!"
//   2 slots: "Hey Ashley, I'm free A or B — whatever works best for you!"
//   3+ slots:"Hey Ashley, any of these work for me — A, B, or C. Whatever's easiest for you!"
// When wantsET is true, each slot is suffixed with its ET equivalent.
export function buildSchedulingProse(
  firstName: string,
  slots: Pick<Slot, 'day' | 'hour' | 'minute'>[],
  wantsET = false,
): string {
  if (slots.length === 0) {
    return `Hey ${firstName}, happy to find a time — what works best on your end?`;
  }
  const displayed = slots.map(s => {
    const base = naturalizeSlotDay(s.day);
    if (!wantsET) return base;
    const etHour = (s.hour + 3) % 24;
    const period = etHour >= 12 ? 'pm' : 'am';
    const displayHour = etHour > 12 ? etHour - 12 : etHour === 0 ? 12 : etHour;
    const minute = s.minute ? `:${String(s.minute).padStart(2, '0')}` : '';
    return `${base.replace(/\s+PT$/i, '')} (${displayHour}${minute}${period} ET)`;
  });
  if (displayed.length === 1) {
    return `Hey ${firstName}, I'm free ${displayed[0]} — whatever works best for you!`;
  }
  if (displayed.length === 2) {
    return `Hey ${firstName}, I'm free ${displayed[0]} or ${displayed[1]} — whatever works best for you!`;
  }
  const last = displayed[displayed.length - 1];
  const rest = displayed.slice(0, -1).join(', ');
  return `Hey ${firstName}, any of these work for me — ${rest}, or ${last}. Whatever's easiest for you!`;
}

export const DEFAULT_PREFS: Prefs = {
  days: [false, true, true, true, true, true, false],
  startHour: 10,
  endHour: 18,
  meetingLength: 30,
  buffer: 30,
  blackoutDates: [],
};

export function extractSchedulingHint(value: string): string {
  const latest = extractLatestInboundMessage(value);
  const lines = latest.text.split('\n').map(line => line.trim());
  const toMeIndex = lines.reduce(
    (latest, line, index) => (/^to\s+me\b/i.test(line) ? index : latest),
    -1,
  );
  const messageLines = toMeIndex >= 0 ? lines.slice(toMeIndex + 1) : lines;
  return messageLines
    .filter(line =>
      line
      && !/^(mon|tue|wed|thu|fri|sat|sun),?\s+[a-z]{3,9}\s+\d{1,2}/i.test(line)
      && !/^\d{1,2}:\d{2}\s*(am|pm)\b/i.test(line)
      && !/^[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}$/.test(line),
    )
    .join(' ');
}

export function extractLatestInboundMessage(value: string): {
  sender: string;
  text: string;
} {
  const normalized = value.replace(/\r/g, '');
  const linkedInMarker = /(?:^|\n)([^\n]+?)\s+sent the following messages?\s+at[^\n]*\n/gi;
  const matches = [...normalized.matchAll(linkedInMarker)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const sender = last[1]
      .replace(/\s+Profile$/i, '')
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .trim();
    const tail = normalized.slice((last.index || 0) + last[0].length);
    const lines = tail.split('\n').map(line => line.trim()).filter(Boolean);
    const messageLines = lines.filter(line =>
      !/^View .+['’]s profile/i.test(line)
      && !new RegExp(`^${sender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s*\\([^)]*\\))?(?:\\s+\\d{1,2}:\\d{2}\\s*(?:AM|PM))?$`, 'i').test(line)
      && !/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Yesterday)$/i.test(line),
    );
    return {
      sender,
      text: messageLines.join('\n').trim(),
    };
  }

  const lines = normalized.split('\n').map(line => line.trim());
  const toMeIndex = lines.reduce(
    (latest, line, index) => (/^to\s+me\b/i.test(line) ? index : latest),
    -1,
  );
  if (toMeIndex >= 0) {
    const headerLines = lines.slice(0, toMeIndex);
    const sender = [...headerLines].reverse().find(line =>
      /^[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}$/.test(line)
      && !/^Avery Romain$/i.test(line),
    ) || '';
    return {
      sender,
      text: lines.slice(toMeIndex + 1).filter(Boolean).join('\n').trim(),
    };
  }

  return { sender: '', text: normalized.trim() };
}

export function stripProposedTimes(value: string): string {
  return value.replace(/\bpropose these times\s*:[\s\S]*$/i, '').trim();
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return minute === 0 ? `${h}${period}` : `${h}:${String(minute).padStart(2, '0')}${period}`;
}

function formatSlot(date: Date, hour: number, minute: number): string {
  return `${DAY_NAMES[date.getDay()]} ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${formatTime(hour, minute)} PT`;
}

// Hardcoded meetings the calendar UI shows for contacts that don't have ISO dates in notes
const HARDCODED_BUSY: { contactId: string; date: string; hour: number }[] = [
  { contactId: 'c051', date: '2026-06-03', hour: 14 }, // Trevor Smith 2PM PDT (~PT)
  { contactId: 'c053', date: '2026-06-05', hour: 12 }, // Jeff Hewitt lunch
  { contactId: 'c008', date: '2026-06-08', hour: 10 }, // Elliot Tight 1PM ET = 10AM PT
  { contactId: 'c052', date: '2026-06-09', hour: 11 }, // John Collura 11:30AM PDT
  { contactId: 'c015', date: '2026-06-11', hour: 9 },  // Leron Garriques coffee
];

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

// Convert hour + source timezone label to PT for comparison
function toPTHour(hour: number, tz: string): number {
  const t = tz.toLowerCase();
  if (t === 'et' || t === 'est' || t === 'edt') return hour - 3;
  if (t === 'ct' || t === 'cst' || t === 'cdt') return hour - 2;
  if (t === 'mt' || t === 'mst' || t === 'mdt') return hour - 1;
  return hour;
}

function parseScheduledTimes(contacts: Contact[]): { date: string; hour: number }[] {
  const busy: { date: string; hour: number }[] = [];
  const seen = new Set<string>();

  // Pull hardcoded meetings for contacts that still exist as 'scheduled'
  for (const h of HARDCODED_BUSY) {
    const c = contacts.find(x => x.id === h.contactId);
    if (c && c.status === 'scheduled') {
      const key = `${h.date}|${h.hour}`;
      if (!seen.has(key)) { busy.push({ date: h.date, hour: h.hour }); seen.add(key); }
    }
  }

  for (const c of contacts) {
    if (c.status !== 'scheduled' || !c.notes) continue;

    // 1) ISO date format
    const isoMatch = c.notes.match(/(\d{4}-\d{2}-\d{2})/);
    // 2) Natural "June 8" format (assume 2026)
    const naturalMatch = c.notes.match(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\s+(\d{1,2})\b/i);

    let dateStr: string | null = null;
    if (isoMatch) dateStr = isoMatch[1];
    else if (naturalMatch) {
      const m = MONTH_MAP[naturalMatch[1].toLowerCase()];
      const d = parseInt(naturalMatch[2]);
      if (m !== undefined && !isNaN(d)) dateStr = `2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    if (!dateStr) continue;

    const timeMatch = c.notes.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(p[ds]t|et|est|edt|pt|c[ds]t|ct|m[ds]t|mt)?/i);
    if (!timeMatch) continue;

    let hour = parseInt(timeMatch[1]);
    const isPM = /pm/i.test(timeMatch[3]);
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    const tz = (timeMatch[4] || 'PT').toUpperCase();
    hour = toPTHour(hour, tz);

    const key = `${dateStr}|${hour}`;
    if (!seen.has(key)) { busy.push({ date: dateStr, hour }); seen.add(key); }
  }

  return busy;
}

export function parseHint(text: string): Hint {
  if (!text) return {};
  const lower = text.toLowerCase();
  const today = new Date();
  const todayDow = today.getDay();
  const mentionsET = /\b(et|est|edt|eastern)\b/i.test(lower);
  const timeWindow: Pick<Hint, 'minHour' | 'maxHour'> =
    /\bevening\b/i.test(lower)
      ? { minHour: mentionsET ? 14 : 16 }
      : /\bearly\s+afternoon\b/i.test(lower)
        ? { minHour: mentionsET ? 10 : 12, maxHour: mentionsET ? 13 : 15 }
        : /\bafternoon\b/i.test(lower)
          ? { minHour: mentionsET ? 9 : 12 }
          : /\bmorning\b/i.test(lower)
            ? { maxHour: mentionsET ? 9 : 12 }
            : {};

  const dayWords: Record<string, number> = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
  const dayMatches: number[] = [];
  for (const [word, idx] of Object.entries(dayWords)) {
    const re = new RegExp(`\\b(next\\s+|this\\s+)?${word}\\b`, 'i');
    if (re.test(lower)) dayMatches.push(idx);
  }

  if (/\bnext\s+week\b/.test(lower)) {
    const daysToNextMon = (1 - todayDow + 7) % 7 || 7;
    return { startOffset: daysToNextMon, endOffset: daysToNextMon + 11, preferDays: dayMatches.length ? dayMatches : undefined, ...timeWindow };
  }
  if (/\bthis\s+week\b/.test(lower)) {
    const daysToNextFri = (5 - todayDow + 7) % 7 || 7;
    return { startOffset: 1, endOffset: daysToNextFri + 7, preferDays: dayMatches.length ? dayMatches : undefined, ...timeWindow };
  }
  if (/\bin\s+(two|2|a\s+couple|couple)\s+weeks?\b/.test(lower)) {
    const daysToNextMon = (1 - todayDow + 7) % 7 || 7;
    return { startOffset: daysToNextMon + 7, endOffset: daysToNextMon + 11, ...timeWindow };
  }
  if (dayMatches.length > 0) {
    const target = dayMatches[0];
    let offset = (target - todayDow + 7) % 7;
    if (offset === 0) offset = 7;
    return { startOffset: offset, endOffset: offset, preferDays: dayMatches, ...timeWindow };
  }

  if (/\btomorrow\b/.test(lower)) return { startOffset: 1, endOffset: 1, ...timeWindow };
  if (/\btoday\b/.test(lower)) return { startOffset: 0, endOffset: 0, ...timeWindow };

  return timeWindow;
}

export function findSlots(
  contacts: Contact[],
  prefs: Prefs = DEFAULT_PREFS,
  hintText = '',
  maxSlots = 3,
  overrides: Record<string, { date: string; time: string } | 'removed'> = {},
  externalBusy: { start: string; end: string }[] = [],
): Slot[] {
  const hint = parseHint(hintText);
  let busyTimes = parseScheduledTimes(contacts);

  // Add Google Calendar busy ranges (interpreted in PT)
  for (const b of externalBusy) {
    const s = new Date(b.start);
    const e = new Date(b.end);
    // Walk every hour the busy block covers and add it as a conflict point
    const cursor = new Date(s);
    while (cursor < e) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const hour = cursor.getHours();
      busyTimes.push({ date: dateStr, hour });
      cursor.setHours(cursor.getHours() + 1);
    }
  }

  // Apply client overrides: remove meetings the user removed, and apply date/time changes
  // Override keys look like `${contactId}-${originalDate}` from calendar/page.tsx
  for (const [key, ov] of Object.entries(overrides)) {
    const [contactId, origDate] = key.split('-2026-');
    if (!contactId) continue;
    const cid = key.split('-')[0];
    const origIso = '2026-' + origDate;
    void cid; void origIso;

    if (ov === 'removed') {
      // Remove any busy entry matching the hardcoded contactId or contact note date
      const hc = (typeof key === 'string') ? key : '';
      const hcEntry = HARDCODED_BUSY.find(h => `${h.contactId}-${h.date}` === hc);
      if (hcEntry) busyTimes = busyTimes.filter(b => !(b.date === hcEntry.date && b.hour === hcEntry.hour));
    } else if (ov && typeof ov === 'object' && ov.date && ov.time) {
      // Apply edit: add new busy time at the override's date/time
      const tm = ov.time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*([A-Z]{2,4})?/i);
      if (tm) {
        let h = parseInt(tm[1]);
        if (tm[3]?.toLowerCase() === 'pm' && h !== 12) h += 12;
        if (tm[3]?.toLowerCase() === 'am' && h === 12) h = 0;
        h = toPTHour(h, (tm[4] || 'PT').toUpperCase());
        // Remove the original date entry if present
        const hcEntry = HARDCODED_BUSY.find(h2 => `${h2.contactId}-${h2.date}` === key);
        if (hcEntry) busyTimes = busyTimes.filter(b => !(b.date === hcEntry.date && b.hour === hcEntry.hour));
        busyTimes.push({ date: ov.date, hour: h });
      }
    }
  }
  const slots: Slot[] = [];
  const now = new Date();
  const startDate = new Date(now);
  const startOffset = hint.startOffset ?? 1;
  startDate.setDate(startDate.getDate() + startOffset);
  const windowDays = hint.endOffset !== undefined ? (hint.endOffset - startOffset + 1) : 21;

  type TimeBlock = 'morning' | 'midday' | 'afternoon';
  type Candidate = Slot & { dayIndex: number; block: TimeBlock };
  const candidates: Candidate[] = [];

  function getBlock(hour: number): TimeBlock {
    if (hour < 12) return 'morning';
    if (hour < 15) return 'midday';
    return 'afternoon';
  }

  for (let d = 0; d < Math.max(windowDays, 1); d++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + d);
    const dayOfWeek = date.getDay();
    if (!prefs.days[dayOfWeek]) continue;
    if (hint.preferDays && hint.preferDays.length > 0 && !hint.preferDays.includes(dayOfWeek)) continue;
    const dateStr = date.toISOString().slice(0, 10);
    const isBlackout = prefs.blackoutDates.some(b => b.toLowerCase().includes(dateStr) || dateStr.includes(b.toLowerCase()));
    if (isBlackout) continue;
    const dayBusy = busyTimes.filter(b => b.date === dateStr);

    for (let hour = prefs.startHour; hour < prefs.endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hint.minHour !== undefined && hour < hint.minHour) continue;
        if (hint.maxHour !== undefined && hour >= hint.maxHour) continue;
        const slotEnd = hour * 60 + minute + prefs.meetingLength;
        if (slotEnd > prefs.endHour * 60) continue;
        const conflict = dayBusy.some(b => {
          const busyStart = b.hour * 60 - prefs.buffer;
          const busyEnd = b.hour * 60 + 60 + prefs.buffer;
          const slotStart = hour * 60 + minute;
          return slotStart < busyEnd && (slotStart + prefs.meetingLength) > busyStart;
        });
        if (conflict) continue;
        candidates.push({ date: dateStr, day: formatSlot(date, hour, minute), time: formatTime(hour, minute), hour, minute, dayIndex: d, block: getBlock(hour) });
      }
    }
  }

  const buckets = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = `${c.date}|${c.block}`;
    if (!buckets.has(key)) buckets.set(key, c);
  }

  const bucketEntries = Array.from(buckets.values());
  const blockOrder: Record<TimeBlock, number> = { morning: 0, midday: 1, afternoon: 2 };
  bucketEntries.sort((a, b) => a.date.localeCompare(b.date) || blockOrder[a.block] - blockOrder[b.block]);

  const usedDays = new Set<string>();
  const preferredBlocks: TimeBlock[] = ['morning', 'afternoon', 'midday'];

  // First pass: guarantee distinct dates, varying the time of day when possible.
  const dates = [...new Set(bucketEntries.map(entry => entry.date))];
  for (const [index, date] of dates.entries()) {
    if (slots.length >= maxSlots) break;
    const preferredBlock = preferredBlocks[index % preferredBlocks.length];
    const sameDay = bucketEntries.filter(entry => entry.date === date);
    const match = sameDay.find(entry => entry.block === preferredBlock) || sameDay[0];
    if (!match) continue;
    slots.push({
      date: match.date,
      day: match.day,
      time: match.time,
      hour: match.hour,
      minute: match.minute,
    });
    usedDays.add(match.date);
  }

  // Only reuse a date when the search window has fewer unique available days.
  for (const c of candidates) {
    if (slots.length >= maxSlots) break;
    if (slots.some(s => s.date === c.date && s.hour === c.hour && s.minute === c.minute)) continue;
    slots.push({ date: c.date, day: c.day, time: c.time, hour: c.hour, minute: c.minute });
  }

  slots.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
  return slots;
}
