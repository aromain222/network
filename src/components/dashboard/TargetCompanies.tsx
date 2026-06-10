'use client';

import { ChevronRight } from 'lucide-react';
import type { Contact } from '@/lib/types';

const TARGETS = [
  { name: 'Snowflake', target: 10 },
  { name: 'Bland AI', target: 10 },
  { name: 'Ramp', target: 10 },
  { name: 'OpenAI', target: 10 },
  { name: 'Google', target: 10 },
  { name: 'Databricks', target: 10 },
  { name: 'Stripe', target: 10 },
  { name: 'Plaid', target: 10 },
];

const COLORS: Record<string, string> = {
  Snowflake: '#29B5E8', 'Bland AI': '#a855f7', Ramp: '#22c55e', OpenAI: '#f0f0f5',
  Google: '#4285F4', Databricks: '#FF3621', Stripe: '#635BFF', Plaid: '#111',
};

export function TargetCompanies({ contacts }: { contacts: Contact[] }) {
  return (
    <div className="rounded-lg border border-edge bg-surface p-4">
      <h3 className="text-xs text-secondary mb-3">Target Companies</h3>
      <div className="space-y-2.5">
        {TARGETS.map(t => {
          const count = contacts.filter(c => c.company.toLowerCase().includes(t.name.toLowerCase())).length;
          const pct = Math.min((count / t.target) * 100, 100);
          const barColor = COLORS[t.name] || '#4f8ef7';
          return (
            <div key={t.name} className="group cursor-pointer">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-primary">{t.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted">{count} / {t.target}</span>
                  <ChevronRight size={12} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-edge overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: barColor }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
