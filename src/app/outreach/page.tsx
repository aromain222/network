'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Contact, OutreachDraft } from '@/lib/types';

type EnrichedDraft = OutreachDraft & { contact?: Pick<Contact, 'name' | 'role' | 'company'> };

export default function OutreachQueuePage() {
  const [drafts, setDrafts] = useState<EnrichedDraft[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});

  const load = useCallback(async () => {
    const [queueRes, contactsRes] = await Promise.all([
      fetch('/api/outreach', { cache: 'no-store' }),
      fetch('/api/contacts', { cache: 'no-store' }),
    ]);
    if (contactsRes.ok) {
      const list = (await contactsRes.json()) as Contact[];
      const map: Record<string, Contact> = {};
      for (const c of list) map[c.id] = c;
      setContacts(map);
    }
    if (queueRes.ok) {
      setDrafts(await queueRes.json());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(id: number, action: 'approve' | 'reject') {
    await fetch('/api/outreach/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Outreach Queue</h1>
        <p className="page-subtitle">{drafts.length} drafts awaiting approval. Nothing is auto-sent.</p>
      </div>

      <ul className="space-y-3">
        {drafts.map(d => {
          const c = contacts[d.contact_id];
          return (
            <li key={d.id} className="rounded-lg border border-edge bg-surface p-4">
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <p className="text-primary font-medium text-sm">{c?.name ?? d.contact_id}</p>
                  <p className="text-[10px] text-secondary">
                    {c?.role || '—'} @ {c?.company || '—'} · <span className="uppercase">{d.channel}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => act(d.id, 'approve')}
                    className="flex items-center gap-1 rounded-md bg-green/10 px-2.5 py-1 text-[11px] text-green hover:bg-green/20"
                  >
                    <Check size={12} /> Approve
                  </button>
                  <button
                    onClick={() => act(d.id, 'reject')}
                    className="flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-[11px] text-red hover:bg-red/20"
                  >
                    <X size={12} /> Reject
                  </button>
                </div>
              </div>
              {d.subject && (
                <p className="text-xs text-secondary mb-2">
                  <span className="font-mono text-[10px] text-muted">SUBJECT: </span>
                  {d.subject}
                </p>
              )}
              <pre className="whitespace-pre-wrap rounded-md bg-bg/40 border border-edge/60 p-3 text-xs text-primary leading-relaxed">
{d.body}
              </pre>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-secondary">
                {d.angle && <span className="rounded bg-secondary/10 px-1.5 py-0.5">angle: {d.angle}</span>}
                {d.ask && <span className="rounded bg-secondary/10 px-1.5 py-0.5">ask: {d.ask}</span>}
              </div>
            </li>
          );
        })}
        {drafts.length === 0 && <p className="text-xs text-muted">No drafts queued.</p>}
      </ul>
    </div>
  );
}
