'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Save, Check, Plus, X, Calendar, Link2, Unlink, AlertCircle } from 'lucide-react';

type SchedulingPrefs = {
  days: boolean[];
  startHour: number;
  endHour: number;
  meetingLength: number;
  buffer: number;
  blackoutDates: string[];
};

const DEFAULTS: SchedulingPrefs = {
  days: [false, true, true, true, true, true, false],
  startHour: 10,
  endHour: 18,
  meetingLength: 30,
  buffer: 30,
  blackoutDates: [],
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7);

function formatHour(h: number) {
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  return h > 12 ? `${h - 12} PM` : `${h} AM`;
}

export default function SettingsPage() {
  return <Suspense fallback={null}><SettingsInner /></Suspense>;
}

function SettingsInner() {
  const searchParams = useSearchParams();
  const [prefs, setPrefs] = useState<SchedulingPrefs>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [newBlackout, setNewBlackout] = useState('');
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; configured: boolean; email?: string; connected_at?: string } | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('scheduling-prefs');
    if (raw) setPrefs(JSON.parse(raw));
    fetch('/api/google/status').then(r => r.json()).then(setGoogleStatus).catch(() => {});
  }, []);

  async function disconnectGoogle() {
    await fetch('/api/google/disconnect', { method: 'POST' });
    setGoogleStatus({ connected: false, configured: googleStatus?.configured ?? false });
  }

  const googleFlash = searchParams.get('google');
  const googleErrMsg = searchParams.get('msg');

  function save() {
    localStorage.setItem('scheduling-prefs', JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleDay(i: number) {
    setPrefs(p => ({ ...p, days: p.days.map((d, j) => j === i ? !d : d) }));
  }

  function addBlackout() {
    if (!newBlackout.trim()) return;
    setPrefs(p => ({ ...p, blackoutDates: [...p.blackoutDates, newBlackout.trim()] }));
    setNewBlackout('');
  }

  function removeBlackout(idx: number) {
    setPrefs(p => ({ ...p, blackoutDates: p.blackoutDates.filter((_, i) => i !== idx) }));
  }

  const inputClass = 'bg-bg border border-edge px-3 py-2 text-xs text-primary focus:border-accent focus:outline-none';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Scheduling preferences and account</p>
      </div>

      {/* Google Calendar connection */}
      <div className="rounded-lg border border-edge bg-surface p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-accent/15 flex items-center justify-center">
              <Calendar size={16} className="text-accent" />
            </div>
            <div>
              <h2 className="text-sm text-primary font-medium">Google Calendar</h2>
              <p className="text-[10px] text-secondary mt-0.5">
                {googleStatus?.connected
                  ? <>Connected as <span className="text-primary">{googleStatus.email}</span></>
                  : 'Sync your real calendar so the scheduler avoids conflicts'}
              </p>
            </div>
          </div>
          {googleStatus?.connected ? (
            <button onClick={disconnectGoogle} className="flex items-center gap-1.5 border border-edge px-3 py-2 text-[11px] text-secondary hover:text-primary transition-colors cursor-pointer">
              <Unlink size={12} /> Disconnect
            </button>
          ) : (
            <a
              href={googleStatus?.configured ? '/api/google/auth' : undefined}
              className={`flex items-center gap-1.5 bg-accent px-4 py-2 text-[11px] text-white transition-colors ${googleStatus?.configured ? 'hover:bg-accent/90 cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
            >
              <Link2 size={12} /> Connect Google Calendar
            </a>
          )}
        </div>
        {!googleStatus?.configured && googleStatus !== null && (
          <div className="flex items-start gap-2 text-[10px] text-yellow bg-yellow/10 border border-yellow/20 p-2.5 rounded">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            <span>Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code> to enable. Restart the dev server after adding them.</span>
          </div>
        )}
        {googleFlash === 'connected' && (
          <div className="flex items-center gap-2 text-[10px] text-green bg-green/10 border border-green/20 p-2.5 rounded">
            <Check size={12} /> Connected successfully
          </div>
        )}
        {googleFlash === 'error' && (
          <div className="flex items-start gap-2 text-[10px] text-red bg-red/10 border border-red/20 p-2.5 rounded">
            <AlertCircle size={12} className="shrink-0 mt-0.5" /> Connection failed: {googleErrMsg}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-edge bg-surface p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm text-primary font-medium">Scheduling Preferences</h2>
            <p className="text-[10px] text-secondary mt-0.5">Configure your availability for the AI scheduling assistant</p>
          </div>
          <button onClick={save} className="flex items-center gap-1.5 bg-accent px-4 py-2 text-[11px] text-white hover:bg-accent/90 transition-colors cursor-pointer">
            {saved ? <><Check size={12} /> Saved</> : <><Save size={12} /> Save</>}
          </button>
        </div>

        {/* Available days */}
        <div>
          <label className="block text-[10px] text-secondary uppercase tracking-wider mb-2">Available Days</label>
          <div className="flex gap-2">
            {DAY_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => toggleDay(i)}
                className={`px-3 py-2 text-xs rounded-md border transition-colors cursor-pointer ${
                  prefs.days[i]
                    ? 'bg-accent/15 border-accent/30 text-accent'
                    : 'bg-bg border-edge text-muted hover:text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Hours */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] text-secondary uppercase tracking-wider mb-2">Start Time (PT)</label>
            <select value={prefs.startHour} onChange={e => setPrefs(p => ({ ...p, startHour: +e.target.value }))} className={inputClass}>
              {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-secondary uppercase tracking-wider mb-2">End Time (PT)</label>
            <select value={prefs.endHour} onChange={e => setPrefs(p => ({ ...p, endHour: +e.target.value }))} className={inputClass}>
              {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
            </select>
          </div>
        </div>

        {/* Meeting length + buffer */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] text-secondary uppercase tracking-wider mb-2">Default Meeting Length</label>
            <select value={prefs.meetingLength} onChange={e => setPrefs(p => ({ ...p, meetingLength: +e.target.value }))} className={inputClass}>
              {[15, 20, 30, 45, 60].map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-secondary uppercase tracking-wider mb-2">Buffer Between Meetings</label>
            <select value={prefs.buffer} onChange={e => setPrefs(p => ({ ...p, buffer: +e.target.value }))} className={inputClass}>
              {[0, 15, 30].map(m => <option key={m} value={m}>{m === 0 ? 'None' : `${m} min`}</option>)}
            </select>
          </div>
        </div>

        {/* Blackout dates */}
        <div>
          <label className="block text-[10px] text-secondary uppercase tracking-wider mb-2">Blackout Dates</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newBlackout}
              onChange={e => setNewBlackout(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBlackout()}
              placeholder="June 3 — SoFi call"
              className={`${inputClass} flex-1`}
            />
            <button onClick={addBlackout} className="flex items-center gap-1 border border-edge px-3 py-2 text-[11px] text-secondary hover:text-primary transition-colors cursor-pointer">
              <Plus size={12} /> Add
            </button>
          </div>
          {prefs.blackoutDates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {prefs.blackoutDates.map((d, i) => (
                <span key={i} className="flex items-center gap-1.5 text-[10px] text-red bg-red/10 px-2.5 py-1 rounded-full">
                  {d}
                  <button onClick={() => removeBlackout(i)} className="hover:text-red/60 cursor-pointer"><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="border-t border-edge pt-4">
          <p className="text-[10px] text-muted">
            Available {prefs.days.map((d, i) => d ? DAY_LABELS[i] : null).filter(Boolean).join(', ')} from {formatHour(prefs.startHour)} to {formatHour(prefs.endHour)} PT.
            {' '}{prefs.meetingLength} min meetings with {prefs.buffer > 0 ? `${prefs.buffer} min buffer` : 'no buffer'}.
            {prefs.blackoutDates.length > 0 && ` ${prefs.blackoutDates.length} blackout date${prefs.blackoutDates.length > 1 ? 's' : ''}.`}
          </p>
        </div>
      </div>
    </div>
  );
}
