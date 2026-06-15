'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock, AlertTriangle, Briefcase, Star, RefreshCw } from 'lucide-react';
import type { CareerBrief } from '@/lib/types';

export default function BriefPage() {
  const [brief, setBrief] = useState<CareerBrief | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/brief', { cache: 'no-store' });
    if (res.ok) setBrief(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runRoutine() {
    setLoading(true);
    await fetch('/api/brief', { method: 'POST' });
    await load();
    setLoading(false);
  }

  if (!brief) return <div className="text-secondary text-sm">Loading brief…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] text-secondary uppercase tracking-widest">{brief.day} · career brief</p>
          <h1 className="page-title">Good morning, Avery.</h1>
          <p className="page-subtitle">Your fully prepared career action plan.</p>
        </div>
        <button
          onClick={runRoutine}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11px] text-white hover:bg-accent/90 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Run morning routine
        </button>
      </div>

      <Section title="1. Today's Meetings" icon={CalendarDays} empty="No meetings scheduled.">
        {brief.meetings.map((m, i) => (
          <li key={i} className="flex items-center justify-between border-b border-edge/60 py-2.5 text-xs">
            <span className="font-mono text-secondary">{m.time}</span>
            <span className="text-primary font-medium">{m.with}</span>
            <span className="text-secondary">{m.topic}</span>
          </li>
        ))}
      </Section>

      <Section title="2. Contacts Requiring Follow-Up" icon={Clock} empty="No follow-ups pending.">
        {brief.follow_ups.map(c => (
          <li key={c.id} className="border-b border-edge/60 py-2.5 text-xs">
            <span className="text-primary font-medium">{c.name}</span>
            <span className="text-secondary"> — {c.role || '—'} @ {c.company || '—'}</span>
          </li>
        ))}
      </Section>

      <Section title="3. Relationship Health Alerts" icon={AlertTriangle} empty="All relationships warm.">
        {brief.health_alerts.map(a => (
          <li key={a.contact.id} className="border-b border-edge/60 py-3 text-xs">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-primary font-medium">{a.contact.name}</span>
              <span className="font-mono text-[10px] text-red">{a.days_since}d dormant</span>
            </div>
            <pre className="whitespace-pre-wrap text-secondary text-[11px] leading-relaxed">{a.suggested_message}</pre>
          </li>
        ))}
      </Section>

      <Section title="4. New Internship Opportunities" icon={Briefcase} empty="No new internships.">
        {brief.internships.map(o => (
          <li key={o.id} className="flex items-center justify-between border-b border-edge/60 py-2.5 text-xs">
            <div>
              <span className="text-primary font-medium">{o.title}</span>
              <span className="text-secondary"> — {o.company || '—'}</span>
            </div>
            <span className="font-mono text-[10px] text-accent">{(o.relevance_score * 100).toFixed(0)}%</span>
          </li>
        ))}
      </Section>

      <Section title="5. New Full-Time Opportunities" icon={Briefcase} empty="No new full-time roles.">
        {brief.fulltime.map(o => (
          <li key={o.id} className="flex items-center justify-between border-b border-edge/60 py-2.5 text-xs">
            <div>
              <span className="text-primary font-medium">{o.title}</span>
              <span className="text-secondary"> — {o.company || '—'}</span>
            </div>
            <span className="font-mono text-[10px] text-accent">{(o.relevance_score * 100).toFixed(0)}%</span>
          </li>
        ))}
      </Section>

      <Section title="6. Top 25 Recommended Networking Targets" icon={Star} empty="No recommendations.">
        {brief.recommended.map((c, i) => (
          <li key={c.id} className="grid grid-cols-[1.5rem_1fr_auto] gap-3 border-b border-edge/60 py-3 text-xs">
            <span className="font-mono text-muted">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-primary font-medium">{c.name}</span>
                <span className="text-secondary">{c.role || '—'} @ {c.company || '—'}</span>
                <WarmthPill warmth={c.warmth} />
                <span className="font-mono text-[10px] text-muted">T{c.tier}</span>
              </div>
              <p className="mt-1 text-secondary">{c.reason}</p>
              <p className="mt-0.5 text-muted italic">Angle: {c.angle}</p>
            </div>
            <span className="font-mono text-[10px] text-accent self-start">{((c.relevance_score ?? 0) * 100).toFixed(0)}</span>
          </li>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, empty, children }: { title: string; icon: React.ComponentType<{ size?: number; className?: string }>; empty: string; children: React.ReactNode }) {
  const hasContent = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className="rounded-lg border border-edge bg-surface p-5">
      <h2 className="flex items-center gap-2 text-xs text-secondary uppercase tracking-wider mb-3">
        <Icon size={13} /> {title}
      </h2>
      {hasContent ? <ul>{children}</ul> : <p className="text-xs text-muted">{empty}</p>}
    </section>
  );
}

function WarmthPill({ warmth }: { warmth?: 'warm' | 'cold' | 'second_degree' }) {
  if (!warmth) return null;
  const label = warmth === 'second_degree' ? '2°' : warmth;
  const cls =
    warmth === 'warm' ? 'bg-green/10 text-green' :
    warmth === 'second_degree' ? 'bg-yellow/10 text-yellow' :
    'bg-secondary/10 text-secondary';
  return <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${cls}`}>{label}</span>;
}
