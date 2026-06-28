'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Video, Coffee, Check, Send, StickyNote, Loader2, Pencil, Trash2, X, Plus } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import type { Contact } from '@/lib/types';
import type { Meeting } from '@/lib/db';

type Platform = 'google-meet' | 'zoom' | 'in-person' | 'tbd';

const TIMEZONES = ['PT', 'PDT', 'ET', 'EST', 'CT', 'CST', 'MT', 'MST'];

// Parse a display time like "2:00 PM PT" → { hhmm: "14:00", tz: "PT" }, or empty if TBD/unparseable
function parseTimeString(s: string): { hhmm: string; tz: string } {
  if (!s || s.toLowerCase() === 'tbd') return { hhmm: '', tz: 'PT' };
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*([A-Z]{2,4})?/i);
  if (!m) return { hhmm: '', tz: 'PT' };
  let h = parseInt(m[1]);
  const min = m[2] ? parseInt(m[2]) : 0;
  const ampm = m[3]?.toLowerCase();
  if (ampm === 'pm' && h !== 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  const tz = (m[4] || 'PT').toUpperCase();
  return { hhmm: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`, tz: TIMEZONES.includes(tz) ? tz : 'PT' };
}

// Format HH:MM + timezone → display string like "2:00 PM PT"
function formatTimeDisplay(hhmm: string, tz: string): string {
  if (!hhmm) return 'TBD';
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr);
  const m = parseInt(mStr);
  const period = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  const mPart = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${h}${mPart} ${period} ${tz}`;
}

type CalEvent = {
  date: string;
  day: number;
  contactId: string;
  name: string;
  company: string;
  time: string;
  location: string;
  platform: Platform;
  status: 'upcoming' | 'completed';
  key: string;
  source?: 'crm' | 'google';
  googleEventId?: string;
};

type GoogleEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  meetLink?: string;
  attendees?: { email?: string; name?: string }[];
};

type EventOverride = { date: string; time: string; location: string; platform: Platform } | 'removed';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function loadOverrides(): Record<string, EventOverride> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('calendar-overrides');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveOverrides(o: Record<string, EventOverride>) {
  try { localStorage.setItem('calendar-overrides', JSON.stringify(o)); } catch { /* ignore */ }
}

function applyOverride(ev: CalEvent, o: EventOverride | undefined): CalEvent | null {
  if (!o) return ev;
  if (o === 'removed') return null;
  return { ...ev, date: o.date, day: new Date(o.date + 'T00:00:00').getDate(), time: o.time, location: o.location, platform: o.platform };
}

function parseEventsFromContacts(contacts: Contact[], overrides: Record<string, EventOverride>): CalEvent[] {
  const hardcoded: CalEvent[] = [
    { date: '2026-06-03', day: 3, contactId: 'c051', name: 'Trevor Smith', company: 'SoFi', time: '2:00 PM PDT', location: 'Google Meet', platform: 'google-meet', status: 'upcoming', key: 'c051-2026-06-03' },
    { date: '2026-06-05', day: 5, contactId: 'c053', name: 'Jeff Hewitt', company: '', time: 'Lunch', location: 'Location TBD', platform: 'in-person', status: 'upcoming', key: 'c053-2026-06-05' },
    { date: '2026-06-08', day: 8, contactId: 'c008', name: 'Elliot Tight', company: 'Blackstone', time: '1:00 PM ET', location: 'Zoom', platform: 'zoom', status: 'upcoming', key: 'c008-2026-06-08' },
    { date: '2026-06-09', day: 9, contactId: 'c052', name: 'John Collura', company: 'Amazon', time: '11:30 AM PDT', location: 'Google Meet', platform: 'google-meet', status: 'upcoming', key: 'c052-2026-06-09' },
    { date: '2026-06-09', day: 9, contactId: 'c039', name: 'Cal Callaway', company: 'Deutsche Bank', time: 'TBD', location: 'TBD', platform: 'tbd', status: 'upcoming', key: 'c039-2026-06-09' },
    { date: '2026-06-11', day: 11, contactId: 'c015', name: 'Leron Garriques', company: '', time: 'Coffee', location: 'Downtown SF', platform: 'in-person', status: 'upcoming', key: 'c015-2026-06-11' },
  ];

  const contactMap = new Map(contacts.map(c => [c.id, c]));
  for (const ev of hardcoded) {
    const c = contactMap.get(ev.contactId);
    if (c?.status === 'completed') ev.status = 'completed';
  }

  const hardcodedIds = new Set(hardcoded.map(e => e.contactId));
  const datePattern = /(?:june|jul|aug|sep|oct|nov|dec|jan|feb|mar|apr|may)\s+(\d{1,2})/i;
  const parsed: CalEvent[] = [];

  for (const c of contacts) {
    if (hardcodedIds.has(c.id)) continue;
    if (c.status !== 'scheduled' && c.status !== 'completed') continue;
    if (!c.notes) continue;

    const match = c.notes.match(datePattern);
    if (!match) continue;

    const monthMatch = c.notes.match(/january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i);
    if (!monthMatch) continue;

    const monthStr = monthMatch[0].toLowerCase();
    const monthMap: Record<string, number> = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
      may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
      sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
    };
    const month = monthMap[monthStr];
    if (month === undefined) continue;
    const day = parseInt(match[1]);
    const year = 2026;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const timeMatch = c.notes.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:pdt|pt|et|est|pst|ct|cst|mt|mst)?)/i);
    const time = timeMatch ? timeMatch[1] : 'TBD';

    let platform: Platform = 'tbd';
    if (/google meet/i.test(c.notes)) platform = 'google-meet';
    else if (/zoom/i.test(c.notes)) platform = 'zoom';
    else if (/coffee|lunch|dinner|in.person/i.test(c.notes)) platform = 'in-person';

    let location = platform === 'google-meet' ? 'Google Meet' : platform === 'zoom' ? 'Zoom' : 'TBD';
    if (/downtown|sf|nyc|bay area/i.test(c.notes)) {
      const locMatch = c.notes.match(/(downtown\s*\w*|sf|nyc|bay area)/i);
      if (locMatch) location = locMatch[0];
    }

    parsed.push({
      date: dateStr, day, contactId: c.id, name: c.name, company: c.company,
      time, location, platform,
      status: c.status === 'completed' ? 'completed' : 'upcoming',
      key: `${c.id}-${dateStr}`,
    });
  }

  // Apply overrides + filter removed
  const all = [...hardcoded, ...parsed]
    .map(ev => applyOverride(ev, overrides[ev.key]))
    .filter((ev): ev is CalEvent => ev !== null);

  return all.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

function PlatformIcon({ platform }: { platform: Platform }) {
  switch (platform) {
    case 'google-meet': return <Video size={12} className="text-green" />;
    case 'zoom': return <Video size={12} className="text-accent" />;
    case 'in-person': return <Coffee size={12} className="text-yellow" />;
    default: return <MapPin size={12} className="text-muted" />;
  }
}

export default function CalendarPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [dbMeetings, setDbMeetings] = useState<Meeting[]>([]);
  const [overrides, setOverrides] = useState<Record<string, EventOverride>>({});
  const [month, setMonth] = useState(5);
  const [year, setYear] = useState(2026);
  const [prepNotes, setPrepNotes] = useState<Record<string, string>>({});
  const [openPrep, setOpenPrep] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [metNotes, setMetNotes] = useState<Record<string, string>>({});
  const [showMetForm, setShowMetForm] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ date: string; hhmm: string; tz: string; location: string; platform: Platform }>({ date: '', hhmm: '', tz: 'PT', location: '', platform: 'tbd' });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [addForm, setAddForm] = useState<{ contactId: string; date: string; hhmm: string; tz: string; location: string; platform: Platform }>({ contactId: '', date: '', hhmm: '', tz: 'PT', location: '', platform: 'google-meet' });
  const [addSaving, setAddSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const eventRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    const res = await fetch('/api/contacts');
    if (res.ok) setContacts(await res.json());
    try {
      const mRes = await fetch('/api/meetings');
      if (mRes.ok) {
        const data = await mRes.json();
        setDbMeetings(data.meetings || []);
      }
    } catch { /* fine */ }
    try {
      const gRes = await fetch('/api/google/events');
      if (gRes.ok) {
        const data = await gRes.json();
        setGoogleEvents(data.events || []);
      }
    } catch { /* not connected, fine */ }
  }, []);

  useEffect(() => {
    setOverrides(loadOverrides());
    void load();
    // Pull anything new from Google Calendar so invites/updates land here automatically
    fetch('/api/meetings/sync', { method: 'POST' })
      .then(() => load())
      .catch(() => {});
  }, [load]);

  const crmEvents = parseEventsFromContacts(contacts, overrides);

  // Convert Google events → CalEvent shape
  const gEventsAsCal: CalEvent[] = googleEvents.map(g => {
    const startDate = new Date(g.start);
    const dateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
    const hours = startDate.getHours();
    const minutes = startDate.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const timeStr = `${h12}:${String(minutes).padStart(2, '0')} ${period} PT`;
    // Try to detect a contact by name in the summary or attendees
    const matchByName = contacts.find(c => g.summary.toLowerCase().includes(c.name.toLowerCase()));
    const matchByEmail = !matchByName && g.attendees
      ? contacts.find(c => g.attendees!.some(a => a.email && c.notes?.toLowerCase().includes(a.email!.toLowerCase())))
      : undefined;
    const matched = matchByName || matchByEmail;
    let platform: Platform = 'tbd';
    let location = g.location || '';
    if (g.meetLink) { platform = 'google-meet'; location = location || 'Google Meet'; }
    else if (/zoom/i.test(g.location || '') || /zoom/i.test(g.summary)) { platform = 'zoom'; location = location || 'Zoom'; }
    else if (g.location) { platform = 'in-person'; }
    return {
      date: dateStr, day: startDate.getDate(),
      contactId: matched?.id || `g-${g.id}`,
      name: matched?.name || g.summary,
      company: matched?.company || '',
      time: timeStr, location, platform,
      status: 'upcoming',
      key: `google-${g.id}`,
      source: 'google',
      googleEventId: g.id,
    };
  });

  // Convert in-app meetings DB rows → CalEvent shape (confirmed only; skip proposed/cancelled)
  const dbEventsAsCal: CalEvent[] = dbMeetings
    .filter(m => (m.state === 'confirmed' || m.state === 'completed') && m.start_iso)
    .map(m => {
      const startDate = new Date(m.start_iso!);
      const dateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
      const hours = startDate.getHours();
      const minutes = startDate.getMinutes();
      const period = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
      const timeStr = `${h12}:${String(minutes).padStart(2, '0')} ${period} PT`;
      const matched = m.contact_id ? contacts.find(c => c.id === m.contact_id) : undefined;
      let platform: Platform = 'tbd';
      let location = m.location || '';
      if (m.meet_link || /meet\.google\.com/i.test(m.meet_link || '')) { platform = 'google-meet'; location = location || 'Google Meet'; }
      else if (/zoom/i.test(m.location || '') || /zoom/i.test(m.title)) { platform = 'zoom'; location = location || 'Zoom'; }
      else if (m.location) { platform = 'in-person'; }
      return {
        date: dateStr, day: startDate.getDate(),
        contactId: matched?.id || `m-${m.id}`,
        name: matched?.name || m.title,
        company: matched?.company || '',
        time: timeStr, location, platform,
        status: m.state === 'completed' ? 'completed' : 'upcoming',
        key: `meeting-${m.id}`,
        source: m.source === 'google' ? 'google' : 'crm',
        googleEventId: m.google_event_id || undefined,
      };
    });

  // Merge: CRM events + Google events + DB meetings, deduped by googleEventId or date+name
  const crmKeys = new Set(crmEvents.map(e => `${e.date}|${e.name.toLowerCase()}`));
  const seenGoogleIds = new Set(gEventsAsCal.map(g => g.googleEventId).filter(Boolean));
  // Also dedupe within the DB meetings themselves (manual parse + later google sync of same event)
  const dbDeduped: CalEvent[] = [];
  const seenDbKeys = new Set<string>();
  for (const d of dbEventsAsCal) {
    const key = `${d.date}|${d.name.toLowerCase()}`;
    if (seenDbKeys.has(key)) continue;
    seenDbKeys.add(key);
    dbDeduped.push(d);
  }
  const filteredDb = dbDeduped.filter(d =>
    !(d.googleEventId && seenGoogleIds.has(d.googleEventId))
    && !crmKeys.has(`${d.date}|${d.name.toLowerCase()}`),
  );
  const dbKeys = new Set(filteredDb.map(d => `${d.date}|${d.name.toLowerCase()}`));
  const merged = [
    ...crmEvents,
    ...gEventsAsCal.filter(g => !crmKeys.has(`${g.date}|${g.name.toLowerCase()}`) && !dbKeys.has(`${g.date}|${g.name.toLowerCase()}`)),
    ...filteredDb,
  ];
  // Tag CRM events that match a Google event as also being on Google
  for (const cm of merged) {
    if (cm.source !== 'google') {
      const match = gEventsAsCal.find(g => g.date === cm.date && g.name.toLowerCase() === cm.name.toLowerCase());
      if (match) { cm.googleEventId = match.googleEventId; cm.source = 'crm'; }
    }
  }
  const events = merged.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const monthEvents = events.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const eventDays = new Set(monthEvents.map(e => e.day));

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
  const todayDate = today.getDate();

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  function scrollToDay(day: number) {
    eventRefs.current[day]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function openEdit(ev: CalEvent) {
    setEditingKey(ev.key);
    const { hhmm, tz } = parseTimeString(ev.time);
    setEditForm({ date: ev.date, hhmm, tz, location: ev.location, platform: ev.platform });
  }

  function saveEdit() {
    if (!editingKey) return;
    const time = formatTimeDisplay(editForm.hhmm, editForm.tz);
    const updated = { ...overrides, [editingKey]: { date: editForm.date, time, location: editForm.location, platform: editForm.platform } };
    setOverrides(updated);
    saveOverrides(updated);
    setEditingKey(null);
  }

  function removeEvent(key: string) {
    const updated = { ...overrides, [key]: 'removed' as const };
    setOverrides(updated);
    saveOverrides(updated);
    setConfirmRemove(null);
  }

  async function markComplete(contactId: string) {
    setMarking(contactId);
    const today = new Date().toISOString().slice(0, 10);
    const notes = metNotes[contactId];
    const contact = contacts.find(c => c.id === contactId);
    const updatedNotes = notes ? (contact?.notes ? `${contact.notes}\nMet ${today}: ${notes}` : `Met ${today}: ${notes}`) : contact?.notes;
    await fetch('/api/contacts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: contactId, status: 'completed', notes: updatedNotes, met_date: today }),
    });
    await load();
    setMarking(null);
    setShowMetForm(null);
  }

  async function createMeeting() {
    if (!addForm.contactId || !addForm.date || !addForm.hhmm) return;
    setAddSaving(true);
    const contact = contacts.find(c => c.id === addForm.contactId);
    if (!contact) { setAddSaving(false); return; }
    const d = new Date(addForm.date + 'T00:00:00');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const platformText = addForm.platform === 'google-meet' ? 'Google Meet' : addForm.platform === 'zoom' ? 'Zoom' : addForm.platform === 'in-person' ? (addForm.location || 'In person') : 'TBD';
    const timeText = formatTimeDisplay(addForm.hhmm, addForm.tz);
    const meetingNote = `${monthNames[d.getMonth()]} ${d.getDate()} ${timeText} via ${platformText}${addForm.location && addForm.platform !== 'in-person' ? ` (${addForm.location})` : ''}`;
    const updatedNotes = contact.notes ? `${contact.notes}\n${meetingNote}` : meetingNote;
    await fetch('/api/contacts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: addForm.contactId, status: 'scheduled', notes: updatedNotes }),
    });
    await load();
    setAddSaving(false);
    setShowAddMeeting(false);
    setAddForm({ contactId: '', date: '', hhmm: '', tz: 'PT', location: '', platform: 'google-meet' });
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-subtitle">Your upcoming meetings and calls</p>
        </div>
        <button onClick={() => setShowAddMeeting(true)} className="btn-primary">
          <Plus size={13} /> Add meeting
        </button>
      </div>

      {/* Month calendar */}
      <div className="rounded-lg border border-edge bg-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-1 text-secondary hover:text-primary transition-colors cursor-pointer"><ChevronLeft size={16} /></button>
          <h2 className="text-sm text-primary font-medium">{MONTHS[month]} {year}</h2>
          <button onClick={nextMonth} className="p-1 text-secondary hover:text-primary transition-colors cursor-pointer"><ChevronRight size={16} /></button>
        </div>

        <div className="grid grid-cols-7 gap-px">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[10px] text-muted py-1.5">{d}</div>
          ))}
          {calendarDays.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;
            const hasEvent = eventDays.has(day);
            const isToday = isCurrentMonth && day === todayDate;
            const isSelected = selectedDay === day;
            return (
              <button
                key={day}
                onClick={() => { setSelectedDay(day); if (hasEvent) scrollToDay(day); }}
                className={`relative flex flex-col items-center justify-center py-2 rounded-md text-xs transition-colors cursor-pointer ${
                  isSelected ? 'bg-accent text-white font-medium' :
                  isToday ? 'bg-accent/15 text-accent font-medium' :
                  hasEvent ? 'text-primary hover:bg-elevated' : 'text-secondary hover:bg-elevated/50'
                }`}
              >
                {day}
                {hasEvent && (
                  <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : isToday ? 'bg-accent' : 'bg-green'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay !== null && (() => {
        const dayDate = new Date(year, month, selectedDay);
        const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
        const dayEvents = monthEvents.filter(e => e.day === selectedDay);
        const dayLabel = `${DAYS[dayDate.getDay()]}, ${MONTHS[month]} ${selectedDay}`;
        return (
          <div className="rounded-lg border border-edge bg-surface p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm text-primary font-medium">{dayLabel}</h3>
                <span className="text-[10px] text-muted">{dayEvents.length} {dayEvents.length === 1 ? 'meeting' : 'meetings'}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setAddForm(f => ({ ...f, date: isoDate }));
                    setShowAddMeeting(true);
                  }}
                  className="flex items-center gap-1 bg-accent text-white px-3 py-1.5 text-[11px] rounded-md hover:bg-accent/90 transition-colors cursor-pointer"
                >
                  <Plus size={11} /> Add meeting on this day
                </button>
                <button onClick={() => setSelectedDay(null)} className="text-muted hover:text-primary cursor-pointer">
                  <X size={14} />
                </button>
              </div>
            </div>
            {dayEvents.length === 0 ? (
              <p className="text-[11px] text-muted">Nothing scheduled. Click "Add meeting" above to book this day.</p>
            ) : (
              <div className="space-y-1.5">
                {dayEvents.map(ev => (
                  <div key={ev.key} className="flex items-center gap-2 text-[11px] py-1.5 px-2 rounded bg-bg/50">
                    <Avatar name={ev.name} size={18} />
                    <span className="text-primary font-medium">{ev.name}</span>
                    {ev.company && <span className="text-muted text-[10px]">{ev.company}</span>}
                    <span className="text-secondary ml-auto flex items-center gap-1">
                      <PlatformIcon platform={ev.platform} />
                      {ev.time} · {ev.location}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Upcoming meetings */}
      <div>
        <h2 className="text-xs text-secondary uppercase tracking-wider mb-3">Upcoming Meetings</h2>
        <div className="space-y-3">
          {monthEvents.length === 0 && (
            <div className="rounded-lg border border-dashed border-edge p-8 text-center">
              <p className="text-xs text-muted">No meetings scheduled for {MONTHS[month]}</p>
            </div>
          )}
          {monthEvents.map(event => {
            const isComplete = event.status === 'completed';
            const isEditing = editingKey === event.key;
            const isConfirmingRemove = confirmRemove === event.key;
            return (
              <div
                key={event.key}
                ref={el => { eventRefs.current[event.day] = el; }}
                className="rounded-lg border border-edge bg-surface p-4 flex gap-4 group"
              >
                {/* Day number */}
                <div className="flex flex-col items-center justify-start pt-0.5">
                  <span className={`text-2xl font-light ${isComplete ? 'text-purple' : 'text-green'}`}>
                    {event.day}
                  </span>
                  <span className="text-[10px] text-muted">{DAYS[new Date(event.date + 'T00:00:00').getDay()]}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar name={event.name} size={22} />
                    <span className="text-xs text-primary font-medium">{event.name}</span>
                    {event.company && <span className="text-[10px] text-muted">{event.company}</span>}
                    {isComplete && (
                      <span className="text-[10px] text-purple bg-purple/15 px-2 py-0.5 rounded-full">
                        {contacts.find(c => c.id === event.contactId)?.met_date
                          ? `Met ${contacts.find(c => c.id === event.contactId)!.met_date}`
                          : 'Completed'}
                      </span>
                    )}
                    {overrides[event.key] && overrides[event.key] !== 'removed' && (
                      <span className="text-[10px] text-yellow bg-yellow/15 px-2 py-0.5 rounded-full">Edited</span>
                    )}
                    {event.source === 'google' && (
                      <span className="text-[10px] text-blue bg-blue/15 px-2 py-0.5 rounded-full">Google</span>
                    )}
                    {event.source !== 'google' && event.googleEventId && (
                      <span className="text-[10px] text-green/80 bg-green/10 px-2 py-0.5 rounded-full">Synced</span>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="flex items-center gap-3 text-[11px] text-secondary">
                      <span className="flex items-center gap-1">
                        <PlatformIcon platform={event.platform} />
                        {event.time}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={11} className="text-muted" />
                        {event.location}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2 border border-accent/20 bg-accent/5 rounded-md p-3">
                      <p className="text-[10px] text-accent font-medium">Edit meeting</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase tracking-wider text-muted mb-1">Date</label>
                          <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                            className="w-full rounded-md border border-edge bg-bg px-2 py-1.5 text-[11px] text-primary focus:border-accent focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase tracking-wider text-muted mb-1">Time</label>
                          <div className="flex gap-1">
                            <input type="time" value={editForm.hhmm} onChange={e => setEditForm(f => ({ ...f, hhmm: e.target.value }))}
                              className="flex-1 rounded-md border border-edge bg-bg px-2 py-1.5 text-[11px] text-primary focus:border-accent focus:outline-none" />
                            <select value={editForm.tz} onChange={e => setEditForm(f => ({ ...f, tz: e.target.value }))}
                              className="rounded-md border border-edge bg-bg px-2 py-1.5 text-[11px] text-primary focus:border-accent focus:outline-none">
                              {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase tracking-wider text-muted mb-1">Platform</label>
                          <select value={editForm.platform} onChange={e => setEditForm(f => ({ ...f, platform: e.target.value as Platform }))}
                            className="w-full rounded-md border border-edge bg-bg px-2 py-1.5 text-[11px] text-primary focus:border-accent focus:outline-none">
                            <option value="google-meet">Google Meet</option>
                            <option value="zoom">Zoom</option>
                            <option value="in-person">In person</option>
                            <option value="tbd">TBD</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase tracking-wider text-muted mb-1">Location</label>
                          <input type="text" value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                            className="w-full rounded-md border border-edge bg-bg px-2 py-1.5 text-[11px] text-primary focus:border-accent focus:outline-none" />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={saveEdit} className="flex items-center gap-1 bg-accent text-white px-3 py-1.5 text-[10px] hover:bg-accent/90 transition-colors cursor-pointer">
                          <Check size={11} /> Save
                        </button>
                        <button onClick={() => setEditingKey(null)} className="px-3 py-1.5 text-[10px] text-secondary border border-edge hover:text-primary transition-colors cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  )}

                  {isConfirmingRemove && (
                    <div className="mt-2 flex items-center gap-2 border border-red/20 bg-red/5 rounded-md p-2.5">
                      <p className="text-[11px] text-red flex-1">Remove this meeting from your calendar?</p>
                      <button onClick={() => removeEvent(event.key)} className="bg-red text-white px-3 py-1 text-[10px] hover:bg-red/90 transition-colors cursor-pointer">Remove</button>
                      <button onClick={() => setConfirmRemove(null)} className="px-3 py-1 text-[10px] text-secondary border border-edge hover:text-primary transition-colors cursor-pointer">Cancel</button>
                    </div>
                  )}

                  {openPrep === event.contactId && (
                    <div className="mt-2">
                      <textarea
                        value={prepNotes[event.contactId] ?? ''}
                        onChange={e => setPrepNotes(prev => ({ ...prev, [event.contactId]: e.target.value }))}
                        placeholder="Talking points, questions to ask..."
                        rows={2}
                        className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none resize-y transition-colors"
                        autoFocus
                      />
                    </div>
                  )}

                  {showMetForm === event.contactId && (
                    <div className="mt-2 border border-green/20 bg-green/5 rounded-md p-3 space-y-2">
                      <p className="text-[10px] text-green font-medium">How did it go?</p>
                      <textarea
                        value={metNotes[event.contactId] ?? ''}
                        onChange={e => setMetNotes(prev => ({ ...prev, [event.contactId]: e.target.value }))}
                        placeholder="Great conversation, discussed FDE roles..."
                        rows={2}
                        className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none resize-y"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => markComplete(event.contactId)}
                          disabled={marking === event.contactId}
                          className="flex items-center gap-1 bg-green text-white px-3 py-1.5 text-[10px] hover:bg-green/90 disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          {marking === event.contactId ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          Complete
                        </button>
                        <button onClick={() => setShowMetForm(null)} className="px-3 py-1.5 text-[10px] text-secondary border border-edge hover:text-primary transition-colors cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1.5 items-end shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isEditing && !isConfirmingRemove && (
                    <>
                      <button onClick={() => openEdit(event)} className="flex items-center gap-1 text-[10px] text-secondary hover:text-primary transition-colors cursor-pointer">
                        <Pencil size={11} /> Edit
                      </button>
                      <button onClick={() => setConfirmRemove(event.key)} className="flex items-center gap-1 text-[10px] text-red/80 hover:text-red transition-colors cursor-pointer">
                        <Trash2 size={11} /> Remove
                      </button>
                      <button
                        onClick={() => setOpenPrep(openPrep === event.contactId ? null : event.contactId)}
                        className="flex items-center gap-1 text-[10px] text-secondary hover:text-primary transition-colors cursor-pointer"
                      >
                        <StickyNote size={11} /> Prep Notes
                      </button>
                      {!isComplete && showMetForm !== event.contactId && (
                        <button
                          onClick={() => setShowMetForm(event.contactId)}
                          className="flex items-center gap-1 text-[10px] text-green hover:text-green/80 transition-colors cursor-pointer"
                        >
                          <Check size={11} /> Mark as Met
                        </button>
                      )}
                      <a
                        href={`/compose?context=${encodeURIComponent(`Follow-up after call with ${event.name}${event.company ? ` at ${event.company}` : ''}`)}`}
                        className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80 transition-colors cursor-pointer"
                      >
                        <Send size={11} /> Draft Follow-Up
                      </a>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showAddMeeting && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowAddMeeting(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-surface border border-edge rounded-lg p-5 w-[440px] max-w-[90vw] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm text-primary font-medium">New meeting</h3>
              <button onClick={() => setShowAddMeeting(false)} className="text-muted hover:text-primary cursor-pointer"><X size={16} /></button>
            </div>

            <div>
              <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">Contact</label>
              <select value={addForm.contactId} onChange={e => setAddForm(f => ({ ...f, contactId: e.target.value }))} className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-xs text-primary focus:border-accent focus:outline-none">
                <option value="">Pick a contact...</option>
                {contacts
                  .filter(c => c.status !== 'completed' && c.status !== 'no_response')
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
                  ))
                }
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">Date</label>
                <input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-xs text-primary focus:border-accent focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">Time</label>
                <div className="flex gap-1">
                  <input type="time" value={addForm.hhmm} onChange={e => setAddForm(f => ({ ...f, hhmm: e.target.value }))} className="flex-1 rounded-md border border-edge bg-bg px-3 py-2 text-xs text-primary focus:border-accent focus:outline-none" />
                  <select value={addForm.tz} onChange={e => setAddForm(f => ({ ...f, tz: e.target.value }))} className="rounded-md border border-edge bg-bg px-2 py-2 text-xs text-primary focus:border-accent focus:outline-none">
                    {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">Platform</label>
                <select value={addForm.platform} onChange={e => setAddForm(f => ({ ...f, platform: e.target.value as Platform }))} className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-xs text-primary focus:border-accent focus:outline-none">
                  <option value="google-meet">Google Meet</option>
                  <option value="zoom">Zoom</option>
                  <option value="in-person">In person</option>
                  <option value="tbd">TBD</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-muted uppercase tracking-wider mb-1.5">Location <span className="text-muted/60">(optional)</span></label>
                <input type="text" value={addForm.location} onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))} placeholder="Downtown SF" className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-xs text-primary focus:border-accent focus:outline-none" />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={createMeeting} disabled={addSaving || !addForm.contactId || !addForm.date || !addForm.hhmm} className="btn-primary flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                {addSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {addSaving ? 'Saving...' : 'Add meeting'}
              </button>
              <button onClick={() => setShowAddMeeting(false)} className="btn-outline">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
