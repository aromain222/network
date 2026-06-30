'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { STATUS_CONFIG } from '@/lib/status';
import { relativeDate, isOverdue } from '@/lib/utils';
import type { Contact, ContactStatus } from '@/lib/types';
import type { AgentDraft, AgentStatus } from '@/lib/agent-types';

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

export default function FollowUpsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [runningAgent, setRunningAgent] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/contacts');
    if (res.ok) setContacts(await res.json());
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [contactsRes, statusRes] = await Promise.all([
        fetch('/api/contacts'),
        fetch('/api/agent/status', { cache: 'no-store' }),
      ]);
      if (contactsRes.ok) setContacts(await contactsRes.json());
      if (statusRes.ok) setAgentStatus(await statusRes.json());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  const agentDrafts: { label: string; draft: AgentDraft }[] = [
    ...(agentStatus?.last_runs.followup?.drafts || []).map(draft => ({ label: 'Follow-up', draft })),
    ...(agentStatus?.last_runs.reengage?.drafts || []).map(draft => ({ label: 'Re-engage', draft })),
  ];

  const followups = contacts
    .filter(c => c.status === 'followup' || c.status === 'scheduled')
    .sort((a, b) => {
      const aOverdue = isOverdue(a.dateAdded);
      const bOverdue = isOverdue(b.dateAdded);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
    });

  const agentReady = contacts
    .filter(c => c.status === 'sent' && !c.followup_date && daysSince(c.dateAdded) > 7)
    .sort((a, b) => daysSince(b.dateAdded) - daysSince(a.dateAdded));

  const completed = contacts
    .filter(c => c.status === 'completed')
    .sort((a, b) =>
      new Date(b.last_touch_date || b.met_date || b.dateAdded).getTime()
      - new Date(a.last_touch_date || a.met_date || a.dateAdded).getTime()
    );

  async function handleStatus(id: string, status: ContactStatus) {
    await fetch('/api/contacts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
    load();
  }

  async function runFollowupAgent() {
    setRunningAgent(true);
    try {
      await fetch('/api/agent/followup', { method: 'POST' });
      const response = await fetch('/api/agent/status', { cache: 'no-store' });
      if (response.ok) setAgentStatus(await response.json());
    } finally {
      setRunningAgent(false);
    }
  }

  function suggestedAction(c: Contact): string {
    if (c.status === 'followup') {
      if (c.notes.toLowerCase().includes('email')) return 'Send follow-up email';
      if (c.notes.toLowerCase().includes('waiting')) return 'Check in with a brief nudge';
      return 'Send a follow-up message';
    }
    if (c.status === 'scheduled') return 'Confirm meeting details';
    return 'Reach out';
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Follow-ups</h1>
          <p className="page-subtitle">
            {followups.length} active · {agentReady.length} ready for agent follow-up · {completed.length} completed
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="btn-outline disabled:opacity-40"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {agentDrafts.length > 0 && (
        <div className="rounded-lg border border-accent/20 bg-surface p-5">
          <h2 className="text-xs text-secondary uppercase tracking-wider mb-4">Latest Agent Drafts</h2>
          <div className="space-y-3">
            {agentDrafts.map(({ label, draft }) => (
              <div key={`${label}-${draft.contact_id}`} className="rounded-md border border-edge bg-bg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-xs text-primary font-medium">{draft.name}</span>
                    <span className="text-[10px] text-muted ml-2">{draft.company}</span>
                  </div>
                  <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5 text-[9px]">{label}</span>
                </div>
                <p className="text-xs text-primary/90 leading-relaxed">{draft.draft}</p>
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(draft.draft)}
                    className="text-[10px] text-accent hover:text-accent/80 cursor-pointer"
                  >
                    Copy Draft
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {agentReady.length > 0 && (
        <div className="rounded-lg border border-blue/20 bg-surface p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xs text-secondary uppercase tracking-wider">Ready for Agent Follow-up</h2>
              <p className="text-[10px] text-muted mt-1">Older sent outreach with no logged follow-up yet.</p>
            </div>
            <button
              onClick={runFollowupAgent}
              disabled={runningAgent}
              className="btn-primary disabled:opacity-40"
            >
              {runningAgent ? 'Finding drafts...' : `Find ${agentReady.length} follow-ups`}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {agentReady.slice(0, 12).map(c => {
              const cfg = STATUS_CONFIG[c.status];
              return (
                <div key={c.id} className="rounded-md border border-edge bg-bg p-3">
                  <div className="flex items-start gap-2">
                    <Avatar name={c.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-primary font-medium truncate">{c.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px]" style={{ color: cfg.color, backgroundColor: `${cfg.color}20` }}>{cfg.label}</span>
                      </div>
                      {c.company && <p className="text-[10px] text-secondary mt-0.5 truncate">{[c.role, c.company].filter(Boolean).join(' at ')}</p>}
                      <p className="text-[10px] text-muted mt-1">Sent {relativeDate(c.dateAdded)}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <a
                          href={`/compose?context=${encodeURIComponent(`Following up with ${c.name} at ${c.company}. Original hook: ${c.hook}. ${c.notes}`)}`}
                          className="text-[10px] text-accent hover:text-accent/80 transition-colors cursor-pointer"
                        >
                          Draft Message
                        </a>
                        <button
                          onClick={() => handleStatus(c.id, 'followup')}
                          className="text-[10px] text-yellow hover:text-yellow/80 transition-colors cursor-pointer"
                        >
                          Mark Needed
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {agentReady.length > 12 && (
            <p className="text-[10px] text-muted mt-3">Showing 12 of {agentReady.length}. Run the agent to draft across all eligible contacts.</p>
          )}
        </div>
      )}

      {followups.length === 0 ? (
        <div className="rounded-lg border border-edge bg-surface p-12 text-center">
          <p className="text-sm text-secondary">All caught up! No follow-ups needed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {followups.map(c => {
            const overdue = isOverdue(c.dateAdded);
            const diff = daysSince(c.dateAdded);
            const cfg = STATUS_CONFIG[c.status];
            return (
              <div key={c.id} className={`rounded-lg border bg-surface p-4 ${overdue ? 'border-red/30' : 'border-edge'}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    title="Mark followed up"
                    onChange={() => handleStatus(c.id, 'completed')}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-green"
                  />
                  <Avatar name={c.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-primary font-medium">{c.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ color: cfg.color, backgroundColor: `${cfg.color}20` }}>{cfg.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${
                        overdue ? 'bg-red/15 text-red' : diff <= 2 ? 'bg-yellow/15 text-yellow' : 'bg-edge text-muted'
                      }`}>{relativeDate(c.dateAdded)}</span>
                    </div>
                    {c.company && <p className="text-xs text-secondary mt-0.5">{[c.role, c.company].filter(Boolean).join(' at ')}</p>}
                    {c.notes && <p className="text-xs text-muted italic mt-1">{c.notes}</p>}
                    <div className="flex items-center gap-3 mt-3">
                      <p className="text-[10px] text-secondary flex-1">{suggestedAction(c)}</p>
                      <a href={`/compose?context=${encodeURIComponent(`Following up with ${c.name} at ${c.company}. ${c.notes}`)}`}
                        className="text-[10px] text-accent hover:text-accent/80 transition-colors cursor-pointer">Draft Message</a>
                      <button onClick={() => handleStatus(c.id, 'completed')} className="text-[10px] text-green hover:text-green/80 transition-colors cursor-pointer">Mark Followed Up</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {completed.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface p-5">
          <h2 className="text-xs text-secondary uppercase tracking-wider mb-4">Completed</h2>
          <div className="space-y-2">
            {completed.slice(0, 20).map(c => {
              const cfg = STATUS_CONFIG[c.status];
              const touched = c.last_touch_date || c.met_date || c.dateAdded;
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-md border border-edge bg-bg p-3">
                  <Avatar name={c.name} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary font-medium truncate">{c.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px]" style={{ color: cfg.color, backgroundColor: `${cfg.color}20` }}>{cfg.label}</span>
                    </div>
                    {c.company && <p className="text-[10px] text-secondary truncate">{[c.role, c.company].filter(Boolean).join(' at ')}</p>}
                  </div>
                  <span className="text-[10px] text-muted shrink-0">{relativeDate(touched)}</span>
                  <button
                    onClick={() => handleStatus(c.id, 'followup')}
                    className="text-[10px] text-accent hover:text-accent/80 transition-colors cursor-pointer"
                  >
                    Reopen
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
