'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { Avatar } from '@/components/Avatar';
import { STATUS_CONFIG } from '@/lib/status';
import type { Contact } from '@/lib/types';

const HIGHLIGHT = ['Snowflake', 'Bland AI', 'Google', 'Ramp', 'Databricks', 'Stripe', 'Plaid', 'OpenAI', 'Anthropic', 'Harvey'];

const CATEGORY: Record<string, string> = {
  Snowflake: 'Data', 'Bland AI': 'AI', Google: 'AI', Ramp: 'Fintech', Databricks: 'Data',
  Stripe: 'Fintech', Plaid: 'Fintech', OpenAI: 'AI', Anthropic: 'AI', Harvey: 'AI',
};

export default function CompaniesPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const load = useCallback(async () => {
    const res = await fetch('/api/contacts');
    if (res.ok) setContacts(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  const companies = useMemo(() => {
    const map = new Map<string, Contact[]>();
    contacts.forEach(c => {
      if (!c.company) return;
      const key = c.company;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    const sorted = [...map.entries()].sort((a, b) => {
      const aHighlight = HIGHLIGHT.some(h => a[0].toLowerCase().includes(h.toLowerCase()));
      const bHighlight = HIGHLIGHT.some(h => b[0].toLowerCase().includes(h.toLowerCase()));
      if (aHighlight !== bHighlight) return aHighlight ? -1 : 1;
      return b[1].length - a[1].length;
    });
    return sorted;
  }, [contacts]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Companies</h1>
        <p className="page-subtitle">{companies.length} companies in your network</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {companies.map(([name, ppl]) => {
          const cat = Object.entries(CATEGORY).find(([k]) => name.toLowerCase().includes(k.toLowerCase()));
          const statusCounts: Record<string, number> = {};
          ppl.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

          return (
            <div key={name} className="rounded-lg border border-edge bg-surface p-4 hover:border-[#3a3a45] transition-colors">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm text-primary font-medium">{name}</h3>
                {cat && <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent/15 text-accent">{cat[1]}</span>}
              </div>
              <p className="text-[10px] text-secondary mb-3">{ppl.length} contact{ppl.length !== 1 ? 's' : ''}</p>

              <div className="space-y-1.5 mb-3">
                {ppl.slice(0, 4).map(c => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Avatar name={c.name} size={20} />
                    <span className="text-[10px] text-primary truncate flex-1">{c.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ color: STATUS_CONFIG[c.status].color, backgroundColor: `${STATUS_CONFIG[c.status].color}20` }}>
                      {STATUS_CONFIG[c.status].label}
                    </span>
                  </div>
                ))}
                {ppl.length > 4 && <p className="text-[9px] text-muted">+{ppl.length - 4} more</p>}
              </div>

              <div className="flex h-1.5 rounded-full overflow-hidden bg-edge">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <div key={status} style={{ width: `${(count / ppl.length) * 100}%`, backgroundColor: STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.color ?? '#666' }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
