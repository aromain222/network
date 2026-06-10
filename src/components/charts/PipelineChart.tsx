'use client';

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import type { Contact } from '@/lib/types';

const STAGES = [
  { key: 'draft', label: 'Research', color: '#666' },
  { key: 'sent', label: 'Messaged', color: '#4f8ef7' },
  { key: 'replied', label: 'Replied', color: '#22c55e' },
  { key: 'call', label: 'Call', color: '#a855f7' },
  { key: 'referral', label: 'Referral', color: '#f97316' },
];

export function PipelineChart({ contacts }: { contacts: Contact[] }) {
  const data = STAGES.map(s => ({
    name: s.label,
    value: s.key === 'call'
      ? contacts.filter(c => c.status === 'scheduled' || c.status === 'completed').length
      : s.key === 'referral'
        ? 0
        : contacts.filter(c => c.status === s.key).length,
    color: s.color,
  }));

  return (
    <div className="rounded-lg border border-edge bg-surface p-4">
      <h3 className="text-xs text-secondary mb-4">Pipeline</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={65} />
          <Tooltip
            contentStyle={{ background: '#1e1e24', border: '1px solid #2a2a35', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#8888aa' }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
