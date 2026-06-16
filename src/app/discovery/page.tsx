'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import type {
  AgentKind,
  AgentStatus,
  DiscoveryCategory,
  DiscoveryPerson,
} from '@/lib/agent-types';
import { DISCOVERY_CATEGORIES } from '@/lib/agent-types';

const AGENT_LABELS: Record<AgentKind, string> = {
  discovery: 'Daily discovery',
  followup: 'Weekly follow-up',
  reengage: 'Re-engagement',
};

function formatTimestamp(value?: string) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function hookClass(hook: string) {
  const normalized = hook.toLowerCase();
  if (normalized.includes('amherst') || normalized.includes('menlo')) return 'bg-purple/15 text-purple';
  if (normalized.includes('black')) return 'bg-yellow/15 text-yellow';
  if (normalized.includes('fde')) return 'bg-blue/15 text-blue';
  if (normalized.includes('fintech')) return 'bg-green/15 text-green';
  return 'bg-accent/15 text-accent';
}

function friendlyAgentError(value: string): string {
  if (/rate_limit_error|status.?429|\b429\b/i.test(value)) {
    return 'Anthropic discovery is temporarily rate-limited. Your previous verified list was kept. Try again in about a minute.';
  }
  return value;
}

function MessageOption({
  label,
  message,
  onCopy,
  copied,
  disabled,
}: {
  label: string;
  message: string;
  onCopy: () => void;
  copied: boolean;
  disabled: boolean;
}) {
  return (
    <div className="rounded-md border border-edge bg-bg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-wider text-muted">{label}</span>
        <button
          onClick={onCopy}
          disabled={disabled}
          className="flex items-center gap-1 text-[10px] text-secondary hover:text-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copied ? <Check size={11} className="text-green" /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-[12px] leading-relaxed text-primary/90">{message}</p>
    </div>
  );
}

export default function DiscoveryPage() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<'discovery' | 'all' | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<DiscoveryCategory | 'All'>('All');

  async function load() {
    const response = await fetch('/api/agent/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load agent status');
    setStatus(await response.json());
  }

  useEffect(() => {
    fetch('/api/agent/status', { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('Could not load agent status');
        return response.json();
      })
      .then(setStatus)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load agent status'))
      .finally(() => setLoading(false));
  }, []);

  async function run(kind: 'discovery' | 'all') {
    setRunning(kind);
    setError('');
    try {
      const endpoint = kind === 'all' ? '/api/agent/run' : '/api/agent/discovery';
      const response = await fetch(endpoint, { method: 'POST' });
      const data = await response.json();
      if (!response.ok && response.status !== 207) {
        throw new Error(friendlyAgentError(data.run?.error || data.error || 'Agent run failed'));
      }
      await load();
      if (data.run?.error) setError(friendlyAgentError(data.run.error));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agent run failed');
    } finally {
      setRunning(null);
    }
  }

  async function act(person: DiscoveryPerson, action: 'skip' | 'save') {
    setActionId(person.id);
    setError('');
    try {
      const response = await fetch('/api/agent/discovery/action', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: person.id, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update person');
      setStatus(current => current ? { ...current, discovery: data.discovery } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update person');
    } finally {
      setActionId(null);
    }
  }

  async function copy(key: string, message: string) {
    await navigator.clipboard.writeText(message);
    setCopied(key);
    window.setTimeout(() => setCopied(''), 1600);
  }

  const discovery = status?.discovery;
  const actedOn = discovery ? discovery.stats.saved + discovery.stats.skipped : 0;
  const progress = discovery?.stats.total ? Math.round((actedOn / discovery.stats.total) * 100) : 0;

  if (loading) {
    return <div className="h-[60vh] flex items-center justify-center"><Loader2 size={20} className="animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Verified Discovery</h1>
          <p className="page-subtitle">
            {discovery?.date || 'No list generated'} · Last generated: {formatTimestamp(discovery?.generated_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => run('all')}
            disabled={Boolean(running)}
            className="btn-outline disabled:opacity-40"
          >
            {running === 'all' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Run All Agents
          </button>
          <button
            onClick={() => run('discovery')}
            disabled={Boolean(running)}
            className="btn-primary disabled:opacity-40"
          >
            {running === 'discovery' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Generate Now
          </button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red/30 bg-red/10 px-4 py-3 text-xs text-red">{error}</div>}
      {status?.persistence_warning && (
        <div className="rounded-md border border-yellow/30 bg-yellow/10 px-4 py-3 text-xs text-yellow">
          {status.persistence_warning}
        </div>
      )}
      {Boolean(status?.legacy_discovery_contacts) && (
        <div className="rounded-md border border-yellow/30 bg-yellow/10 px-4 py-3 text-xs text-yellow">
          {status?.legacy_discovery_contacts} older agent-added contacts were saved without source evidence. Review them before outreach.
        </div>
      )}
      {discovery?.email_error && (
        <div className="rounded-md border border-yellow/30 bg-yellow/10 px-4 py-3 text-xs text-yellow">
          Email digest failed: {discovery.email_error}. Results are available below.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {(['discovery', 'followup', 'reengage'] as AgentKind[]).map(kind => {
          const run = status?.last_runs[kind];
          return (
            <div key={kind} className="rounded-lg border border-edge bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-secondary">{AGENT_LABELS[kind]}</span>
                <span className={`h-2 w-2 rounded-full ${run?.success ? 'bg-green' : run ? 'bg-red' : 'bg-muted'}`} />
              </div>
              <p className="mt-2 text-xs text-primary">{formatTimestamp(run?.completed_at)}</p>
              <p className="mt-1 text-[10px] text-muted">
                {run ? `${run.stats.drafted ?? run.stats.total ?? 0} drafted · ${run.email_sent ? 'email sent' : 'email not sent'}` : 'No runs yet'}
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-edge bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-primary">{actedOn} of {discovery?.stats.total || 0} acted on today</span>
          <span className="text-[10px] text-muted">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-edge overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-[10px] text-muted">New leads require a live source confirming the person&apos;s current company and role. Unverified legacy cards cannot be copied or saved.</p>
      </div>

      {discovery?.people.length ? (
        <CategoryFilter
          people={discovery.people}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
      ) : null}

      {!discovery?.people.length ? (
        <div className="rounded-lg border-2 border-dashed border-edge py-20 text-center">
          <Search size={24} className="mx-auto text-muted/50 mb-3" />
          <p className="text-sm text-secondary">No discovery list yet.</p>
          <p className="text-[10px] text-muted mt-1">Generate one source-backed candidate and message drafts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {discovery.people
            .filter(p => categoryFilter === 'All' || (p.category ?? 'Other') === categoryFilter)
            .map(person => (
            <article
              key={person.id}
              className={`rounded-lg border bg-surface p-4 space-y-3 ${person.status === 'pending' ? 'border-edge' : 'border-accent/20 opacity-75'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`rounded-full px-2.5 py-0.5 text-[9px] ${hookClass(person.hook)}`}>{person.hook}</span>
                {person.status === 'pending' ? (
                  <button
                    onClick={() => act(person, 'skip')}
                    disabled={actionId === person.id}
                    className="flex items-center gap-1 text-[10px] text-muted hover:text-red cursor-pointer"
                  >
                    <X size={11} /> Skip
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-secondary">
                    <Check size={11} className={person.status === 'saved' ? 'text-green' : 'text-muted'} />
                    {person.status === 'saved' ? 'Saved' : 'Skipped'}
                  </span>
                )}
              </div>

              <div>
                <h2 className="text-sm font-medium text-primary">{person.name}</h2>
                <p className="text-[11px] text-secondary">{person.role} at {person.company}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">Why today: {person.why}</p>
                {person.verified && person.source_url ? (
                  <a
                    href={person.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[10px] text-accent hover:text-primary"
                  >
                    Verified source <ExternalLink size={10} />
                  </a>
                ) : (
                  <p className="mt-2 text-[10px] text-red">No supporting source. Do not use this lead.</p>
                )}
              </div>

              <MessageOption
                label="Option A"
                message={person.message_a}
                onCopy={() => copy(`${person.id}-a`, person.message_a)}
                copied={copied === `${person.id}-a`}
                disabled={!person.verified}
              />
              <MessageOption
                label="Option B"
                message={person.message_b}
                onCopy={() => copy(`${person.id}-b`, person.message_b)}
                copied={copied === `${person.id}-b`}
                disabled={!person.verified}
              />

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => act(person, 'save')}
                  disabled={!person.verified || !person.source_url || person.saved_to_contacts || actionId === person.id}
                  className="btn-primary flex-1 justify-center disabled:opacity-40"
                >
                  {actionId === person.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {person.saved_to_contacts ? 'Saved to Contacts' : person.verified ? 'Save to Contacts' : 'Needs Source'}
                </button>
                <a
                  href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(person.linkedin_search)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-outline"
                >
                  LinkedIn <ExternalLink size={11} />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryFilter({
  people,
  value,
  onChange,
}: {
  people: DiscoveryPerson[];
  value: DiscoveryCategory | 'All';
  onChange: (v: DiscoveryCategory | 'All') => void;
}) {
  const counts = new Map<DiscoveryCategory | 'All', number>();
  counts.set('All', people.length);
  for (const cat of DISCOVERY_CATEGORIES) counts.set(cat, 0);
  for (const p of people) {
    const cat = (p.category ?? 'Other') as DiscoveryCategory;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const visible: Array<DiscoveryCategory | 'All'> = ['All', ...DISCOVERY_CATEGORIES.filter(c => (counts.get(c) ?? 0) > 0)];
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map(cat => {
        const active = value === cat;
        const count = counts.get(cat) ?? 0;
        return (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] transition-colors ${
              active
                ? 'bg-accent text-white'
                : 'bg-surface border border-edge text-secondary hover:text-primary hover:border-[#3a3a45]'
            }`}
          >
            <span>{cat}</span>
            <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-white/20' : 'bg-edge/60 text-muted'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
