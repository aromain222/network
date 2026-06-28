'use client';

import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { STATUS_CONFIG } from '@/lib/status';
import { relativeDate, isOverdue } from '@/lib/utils';
import type { Contact, ContactStatus } from '@/lib/types';
import type { AgentDraft, AgentStatus } from '@/lib/agent-types';

export default function FollowUpsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/contacts');
    if (res.ok) setContacts(await res.json());
  }, []);

  useEffect(() => {
    load();
    fetch('/api/agent/status', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(setAgentStatus)
      .catch(() => {});
  }, [load]);

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

  async function handleStatus(id: string, status: ContactStatus) {
    await fetch('/api/contacts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
    load();
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
      <div>
        <h1 className="page-title">Follow-ups</h1>
        <p className="page-subtitle">{followups.length} contacts need your attention</p>
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

      {followups.length === 0 ? (
        <div className="rounded-lg border border-edge bg-surface p-12 text-center">
          <p className="text-sm text-secondary">All caught up! No follow-ups needed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {followups.map(c => {
            const overdue = isOverdue(c.dateAdded);
            const diff = Math.floor((Date.now() - new Date(c.dateAdded).getTime()) / 86400000);
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
    </div>
  );
}
