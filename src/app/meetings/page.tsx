'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Bell, BellOff, Check, Clock, Copy, ExternalLink, Loader2, MessageSquare, Plus, RefreshCw, Sparkles, StickyNote, X } from 'lucide-react';
import type { Contact } from '@/lib/types';
import type { Meeting } from '@/lib/db';

type ApiMeeting = Meeting;

function fmtTime(iso: string | null): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtCountdown(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.round(hrs / 24);
  return `in ${days}d`;
}

const REMINDER_OFFSETS_MIN = [24 * 60, 60, 10];

function loadFiredReminders(): Record<string, number[]> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('meeting-reminders-fired') || '{}'); } catch { return {}; }
}
function saveFiredReminders(r: Record<string, number[]>) {
  try { localStorage.setItem('meeting-reminders-fired', JSON.stringify(r)); } catch { /* ignore */ }
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<ApiMeeting[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
  const [showAddForm, setShowAddForm] = useState(false);
  const [now, setNow] = useState<number>(0);
  const firedRef = useRef<Record<string, number[]> | null>(null);
  if (firedRef.current === null) firedRef.current = loadFiredReminders();

  const load = useCallback(async () => {
    const [mRes, cRes] = await Promise.all([
      fetch('/api/meetings').then(r => r.json()),
      fetch('/api/contacts').then(r => r.json()).catch(() => []),
    ]);
    setMeetings(mRes.meetings || []);
    setContacts(cRes || []);
    setLoading(false);
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch('/api/meetings/sync', { method: 'POST' });
      await load();
    } finally {
      setSyncing(false);
    }
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    void load();
    void sync();
    if (typeof Notification !== 'undefined') setNotifPermission(Notification.permission);
  }, [load, sync]);

  // Heartbeat: re-render every 30s for countdowns, and fire reminders.
  useEffect(() => {
    const interval = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (notifPermission !== 'granted') return;
      const fired = firedRef.current!;
      for (const m of meetings) {
        if (m.state !== 'confirmed' || !m.start_iso) continue;
        const startMs = new Date(m.start_iso).getTime();
        const minsUntil = (startMs - t) / 60000;
        const firedForMeeting = fired[m.id] || [];
        for (const offset of REMINDER_OFFSETS_MIN) {
          if (minsUntil > 0 && minsUntil <= offset && !firedForMeeting.includes(offset)) {
            new Notification('Meeting reminder', {
              body: `${m.title} • ${fmtCountdown(m.start_iso)}`,
              tag: `meeting-${m.id}-${offset}`,
            });
            fired[m.id] = [...firedForMeeting, offset];
            saveFiredReminders(fired);
          }
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [meetings, notifPermission]);

  const requestNotif = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setNotifPermission(p);
  };

  const updateMeeting = async (id: number, patch: Record<string, unknown>) => {
    await fetch('/api/meetings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    load();
  };

  const removeMeeting = async (id: number) => {
    await fetch(`/api/meetings?id=${id}`, { method: 'DELETE' });
    load();
  };

  const today = useMemo(() => {
    const end = now + 24 * 60 * 60 * 1000;
    return meetings.filter(m => m.state === 'confirmed' && m.start_iso && new Date(m.start_iso).getTime() <= end && new Date(m.start_iso).getTime() > now - 60 * 60 * 1000);
  }, [meetings, now]);

  const upcoming = useMemo(() => {
    const todayEnd = now + 24 * 60 * 60 * 1000;
    const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
    return meetings.filter(m => m.state === 'confirmed' && m.start_iso && new Date(m.start_iso).getTime() > todayEnd && new Date(m.start_iso).getTime() <= weekEnd);
  }, [meetings, now]);

  const awaiting = useMemo(() =>
    meetings.filter(m => m.state === 'proposed'),
  [meetings]);

  const followUp = useMemo(() =>
    meetings.filter(m => m.state === 'completed' && (!m.notes || !m.thank_you_sent)),
  [meetings]);

  const contactName = (id: string | null) => id ? (contacts.find(c => c.id === id)?.name || '—') : '—';

  if (loading) return (
    <div className="p-8 flex items-center gap-2 text-zinc-500"><Loader2 className="animate-spin" size={16} /> Loading meetings…</div>
  );

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Meetings</h1>
          <p className="text-sm text-zinc-500 mt-1">Everything in one place. Reminders fire while this tab is open.</p>
        </div>
        <div className="flex items-center gap-2">
          {notifPermission !== 'granted' ? (
            <button onClick={requestNotif} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-zinc-200 hover:bg-zinc-50">
              <BellOff size={14} /> Enable reminders
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-700 bg-emerald-50 rounded-md">
              <Bell size={14} /> Reminders on
            </span>
          )}
          <button onClick={sync} disabled={syncing} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Sync Google
          </button>
          <button onClick={() => setShowAddForm(s => !s)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-900 text-white hover:bg-zinc-700">
            <Plus size={14} /> Add manual
          </button>
        </div>
      </header>

      {showAddForm && <AddMeetingForm contacts={contacts} onCreated={() => { setShowAddForm(false); load(); }} />}

      <Rail title="Today + next 24h" empty="Nothing scheduled in the next 24 hours.">
        {today.map(m => (
          <UpcomingCard key={m.id} m={m} contactName={contactName(m.contact_id)} onUpdate={updateMeeting} onDelete={removeMeeting} />
        ))}
      </Rail>

      <Rail title="This week" empty="Quiet rest-of-week.">
        {upcoming.map(m => (
          <UpcomingCard key={m.id} m={m} contactName={contactName(m.contact_id)} onUpdate={updateMeeting} onDelete={removeMeeting} />
        ))}
      </Rail>

      <Rail title="Awaiting confirmation" empty="No open proposals." hint="Times you proposed that haven't shown up on Google Cal yet. Stale = 2+ days no response.">
        {awaiting.map(m => (
          <AwaitingCard key={m.id} m={m} contactName={contactName(m.contact_id)} now={now} onUpdate={updateMeeting} onDelete={removeMeeting} />
        ))}
      </Rail>

      <Rail title="Needs follow-up" empty="All caught up." hint="Past calls missing notes or a thank-you.">
        {followUp.map(m => (
          <FollowUpCard key={m.id} m={m} contactName={contactName(m.contact_id)} onUpdate={updateMeeting} onDelete={removeMeeting} />
        ))}
      </Rail>
    </div>
  );
}

function Rail({ title, children, empty, hint }: { title: string; children: React.ReactNode; empty: string; hint?: string }) {
  const arr = Array.isArray(children) ? children : [children];
  const filtered = arr.filter(Boolean);
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
        <span className="text-xs text-zinc-400">{filtered.length}</span>
        {hint && <span className="text-xs text-zinc-400 ml-2">{hint}</span>}
      </div>
      {filtered.length === 0
        ? <p className="text-sm text-zinc-400 italic">{empty}</p>
        : <div className="space-y-2">{filtered}</div>}
    </section>
  );
}

function UpcomingCard({ m, contactName, onUpdate }: { m: ApiMeeting; contactName: string; onUpdate: (id: number, patch: Record<string, unknown>) => void; onDelete: (id: number) => void }) {
  return (
    <div className="border border-zinc-200 rounded-lg p-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium truncate">{m.title}</span>
          <span className="text-xs text-zinc-500">· {contactName}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
          <span className="flex items-center gap-1"><Clock size={12} /> {fmtTime(m.start_iso)} <span className="text-emerald-600 ml-1">({fmtCountdown(m.start_iso)})</span></span>
          {m.location && <span>· {m.location}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {m.meet_link && (
          <a href={m.meet_link} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100">
            <ExternalLink size={12} /> Join
          </a>
        )}
        <button onClick={() => onUpdate(m.id, { state: 'cancelled' })} className="text-xs px-2 py-1 text-zinc-500 hover:text-zinc-700" title="Cancel">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

function AwaitingCard({ m, contactName, now, onUpdate, onDelete }: { m: ApiMeeting; contactName: string; now: number; onUpdate: (id: number, patch: Record<string, unknown>) => void; onDelete: (id: number) => void }) {
  const ageMs = (now || Date.parse(m.created_at)) - new Date(m.created_at).getTime();
  const stale = ageMs > 2 * 24 * 60 * 60 * 1000;
  const ageDays = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)));
  return (
    <div className={`border rounded-lg p-3 ${stale ? 'border-amber-300 bg-amber-50/40' : 'border-zinc-200'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{m.title} <span className="text-xs text-zinc-500 font-normal">· {contactName}</span></div>
          <div className="text-xs text-zinc-500 mt-0.5">Proposed {m.proposed_times.length} time{m.proposed_times.length === 1 ? '' : 's'} · {ageDays}d ago {stale && <span className="text-amber-700 font-medium">· stale</span>}</div>
          <div className="text-xs text-zinc-500 mt-1 flex flex-wrap gap-1">
            {m.proposed_times.slice(0, 4).map((t, i) => <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-100">{fmtTime(t)}</span>)}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {m.contact_id && (
            <Link href={`/contacts/${m.contact_id}`} className="text-xs px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 flex items-center gap-1">
              <MessageSquare size={12} /> Ping
            </Link>
          )}
          <button onClick={() => onUpdate(m.id, { state: 'confirmed', start_iso: m.proposed_times[0], end_iso: new Date(new Date(m.proposed_times[0]).getTime() + 30 * 60000).toISOString() })} className="text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1" title="Mark first proposed time as booked">
            <Check size={12} /> Mark booked
          </button>
          <button onClick={() => onDelete(m.id)} className="text-xs px-2 py-1 text-zinc-500 hover:text-zinc-700" title="Drop">
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function FollowUpCard({ m, contactName, onUpdate, onDelete }: { m: ApiMeeting; contactName: string; onUpdate: (id: number, patch: Record<string, unknown>) => void; onDelete: (id: number) => void }) {
  const [notes, setNotes] = useState(m.notes);
  const [transcript, setTranscript] = useState(m.transcript || '');
  const [editing, setEditing] = useState(false);
  const [notetaking, setNotetaking] = useState(false);
  const [notetakerError, setNotetakerError] = useState('');
  const needsNotes = !m.notes;
  const needsThanks = !m.thank_you_sent;

  const runNotetaker = async () => {
    if (!transcript.trim()) {
      setNotetakerError('Paste a transcript first.');
      return;
    }
    setNotetaking(true);
    setNotetakerError('');
    try {
      const res = await fetch('/api/meetings/notetaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Notetaker failed');
      setNotes(data.meeting?.notes || '');
      onUpdate(m.id, {
        transcript,
        notes: data.meeting?.notes || '',
        ai_summary: data.meeting?.ai_summary || '',
        action_items: data.meeting?.action_items || [],
        decisions: data.meeting?.decisions || [],
        follow_up_draft: data.meeting?.follow_up_draft || '',
      });
    } catch (err) {
      setNotetakerError(err instanceof Error ? err.message : 'Notetaker failed');
    } finally {
      setNotetaking(false);
    }
  };

  const copyFollowUp = async () => {
    const draft = m.follow_up_draft || notes;
    if (!draft) return;
    await navigator.clipboard?.writeText(draft);
  };

  return (
    <div className="border border-zinc-200 rounded-lg p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{m.title} <span className="text-xs text-zinc-500 font-normal">· {contactName}</span></div>
          <div className="text-xs text-zinc-500 mt-0.5">{fmtTime(m.start_iso)}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setEditing(s => !s)} className="text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-1">
            <Sparkles size={12} /> AI notes
          </button>
          <button onClick={() => setEditing(s => !s)} className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 ${needsNotes ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}>
            <StickyNote size={12} /> {needsNotes ? 'Log notes' : 'Edit notes'}
          </button>
          {m.contact_id && needsThanks && (
            <Link href={`/compose?reply=${m.contact_id}`} className="text-xs px-2 py-1 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center gap-1">
              <MessageSquare size={12} /> Thank-you
            </Link>
          )}
          {needsThanks && (
            <button onClick={() => onUpdate(m.id, { thank_you_sent: true })} className="text-xs px-2 py-1 text-zinc-500 hover:text-zinc-700" title="Mark thank-you as sent">
              <Check size={12} />
            </button>
          )}
          <button onClick={() => onDelete(m.id)} className="text-xs px-2 py-1 text-zinc-500 hover:text-zinc-700" title="Dismiss">
            <X size={12} />
          </button>
        </div>
      </div>
      {editing && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-zinc-500">Transcript</label>
                <button onClick={runNotetaker} disabled={notetaking || !transcript.trim()} className="text-xs px-2 py-1 rounded-md bg-blue-600 text-white disabled:opacity-50 flex items-center gap-1">
                  {notetaking ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {notetaking ? 'Generating' : 'Generate notes'}
                </button>
              </div>
              <textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={7} placeholder="Paste the call transcript here. The AI notetaker will summarize, extract decisions, and draft the thank-you." className="w-full text-sm border border-zinc-200 rounded-md p-2 resize-none" />
              {notetakerError && <p className="text-xs text-red-600 mt-1">{notetakerError}</p>}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-zinc-500">Notes</label>
                {(m.follow_up_draft || notes) && (
                  <button onClick={copyFollowUp} className="text-xs px-2 py-1 rounded-md bg-zinc-100 text-zinc-700 hover:bg-zinc-200 flex items-center gap-1">
                    <Copy size={12} /> Copy follow-up
                  </button>
                )}
              </div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={7} placeholder="What did you take away from the call?" className="w-full text-sm border border-zinc-200 rounded-md p-2 resize-none" />
            </div>
          </div>
          {m.ai_summary && (
            <div className="grid gap-3 md:grid-cols-3 text-xs">
              <div className="rounded-md bg-zinc-50 p-2">
                <div className="font-medium text-zinc-600 mb-1">Summary</div>
                <p className="text-zinc-500 line-clamp-4">{m.ai_summary}</p>
              </div>
              <div className="rounded-md bg-zinc-50 p-2">
                <div className="font-medium text-zinc-600 mb-1">Actions</div>
                <ul className="space-y-1 text-zinc-500">
                  {m.action_items.slice(0, 3).map((item, i) => <li key={i}>- {item}</li>)}
                  {m.action_items.length === 0 && <li>None captured.</li>}
                </ul>
              </div>
              <div className="rounded-md bg-zinc-50 p-2">
                <div className="font-medium text-zinc-600 mb-1">Decisions</div>
                <ul className="space-y-1 text-zinc-500">
                  {m.decisions.slice(0, 3).map((item, i) => <li key={i}>- {item}</li>)}
                  {m.decisions.length === 0 && <li>None captured.</li>}
                </ul>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setEditing(false); setNotes(m.notes); }} className="text-xs px-2 py-1 text-zinc-500 hover:text-zinc-700">Cancel</button>
            <button onClick={() => { onUpdate(m.id, { notes, transcript }); setEditing(false); }} className="text-xs px-2 py-1 rounded-md bg-zinc-900 text-white">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddMeetingForm({ contacts, onCreated }: { contacts: Contact[]; onCreated: () => void }) {
  const [contactQuery, setContactQuery] = useState('');
  const [contactId, setContactId] = useState('');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [duration, setDuration] = useState(30);
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts.filter(c => c.name.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q)).slice(0, 6);
  }, [contacts, contactQuery]);

  const pickContact = (c: Contact) => {
    setContactId(c.id);
    setContactQuery(c.name);
    if (!titleEdited) setTitle(`Call with ${c.name.split(' ')[0]}`);
  };

  const canSave = title.trim() && when;

  const toLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const dayChips = useMemo(() => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const out: { label: string; date: Date }[] = [
      { label: 'Today', date: today },
      { label: 'Tomorrow', date: new Date(today.getTime() + 86400000) },
    ];
    for (let i = 2; i <= 7; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      out.push({ label: dayNames[d.getDay()], date: d });
    }
    return out;
  }, []);

  const timeChips = [
    { label: '9a', h: 9 }, { label: '10a', h: 10 }, { label: '11a', h: 11 },
    { label: '1p', h: 13 }, { label: '2p', h: 14 }, { label: '3p', h: 15 },
    { label: '4p', h: 16 }, { label: '5p', h: 17 },
  ];

  const currentDateKey = when.slice(0, 10);
  const currentHour = parseInt(when.slice(11, 13) || '0');

  const setDay = (target: Date) => {
    const [, time] = when.split('T');
    const next = new Date(target);
    const [h, m] = (time || '10:00').split(':').map(Number);
    next.setHours(h, m, 0, 0);
    setWhen(toLocal(next));
  };

  const setHour = (hour: number) => {
    const base = when ? new Date(when) : new Date();
    base.setHours(hour, 0, 0, 0);
    setWhen(toLocal(base));
  };

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    const start = new Date(when);
    const end = new Date(start.getTime() + duration * 60000);
    await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'manual', title, contact_id: contactId || null,
        start_iso: start.toISOString(), end_iso: end.toISOString(),
        location: location || null,
      }),
    });
    setSaving(false);
    onCreated();
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
  };

  return (
    <div className="border border-zinc-200 rounded-lg p-4 bg-zinc-50/50 space-y-3" onKeyDown={handleKey}>
      <h3 className="text-sm font-medium">Add a meeting</h3>

      <div className="relative">
        <input
          value={contactQuery}
          onChange={e => { setContactQuery(e.target.value); if (contactId) setContactId(''); }}
          placeholder="Who? (type to search contacts — or leave blank)"
          className="w-full text-sm border border-zinc-200 rounded-md p-2 bg-white"
          autoFocus
        />
        {matches.length > 0 && !contactId && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-zinc-200 rounded-md shadow-sm max-h-48 overflow-auto">
            {matches.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => pickContact(c)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 flex justify-between"
              >
                <span>{c.name}</span>
                {c.company && <span className="text-xs text-zinc-500">{c.company}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        value={title}
        onChange={e => { setTitle(e.target.value); setTitleEdited(true); }}
        placeholder="Title"
        className="w-full text-sm border border-zinc-200 rounded-md p-2"
      />

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {dayChips.map(d => {
            const key = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}-${String(d.date.getDate()).padStart(2, '0')}`;
            const active = key === currentDateKey;
            return (
              <button
                key={d.label}
                type="button"
                onClick={() => setDay(d.date)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  active ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1">
          {timeChips.map(t => {
            const active = t.h === currentHour;
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => setHour(t.h)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  active ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="datetime-local"
            value={when}
            onChange={e => setWhen(e.target.value)}
            className="text-sm border border-zinc-200 rounded-md p-2"
          />
          <select
            value={duration}
            onChange={e => setDuration(parseInt(e.target.value))}
            className="text-sm border border-zinc-200 rounded-md p-2 bg-white"
          >
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
          </select>
        </div>
      </div>

      <input
        value={location}
        onChange={e => setLocation(e.target.value)}
        placeholder="Location / link (optional)"
        className="w-full text-sm border border-zinc-200 rounded-md p-2"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">⌘+Enter to save</span>
        <button onClick={submit} disabled={saving || !canSave} className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save meeting'}
        </button>
      </div>
    </div>
  );
}
