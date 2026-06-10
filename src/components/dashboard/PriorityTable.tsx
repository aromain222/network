'use client';

import { Mail, ExternalLink, MoreHorizontal } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { STATUS_CONFIG } from '@/lib/status';
import { relativeDate } from '@/lib/utils';
import type { Contact } from '@/lib/types';

function fakeScore(name: string): number {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return 70 + (Math.abs(h) % 26);
}

export function PriorityTable({ contacts }: { contacts: Contact[] }) {
  const priority = [...contacts]
    .filter(c => ['followup', 'scheduled', 'sent'].includes(c.status))
    .sort((a, b) => {
      const order: Record<string, number> = { followup: 0, scheduled: 1, sent: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    })
    .slice(0, 6);

  const stageLabel: Record<string, { text: string; color: string }> = {
    followup: { text: 'Follow-up due', color: '#eab308' },
    scheduled: { text: 'Call scheduled', color: '#22c55e' },
    sent: { text: 'Need reply', color: '#4f8ef7' },
    replied: { text: 'Nurture', color: '#666' },
  };

  return (
    <div className="rounded-lg border border-edge bg-surface p-4">
      <h3 className="text-xs text-secondary mb-3">Priority Contacts</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted text-[10px]">
              <th className="text-left pb-2 font-normal">Contact</th>
              <th className="text-left pb-2 font-normal">Company</th>
              <th className="text-left pb-2 font-normal">Stage</th>
              <th className="text-left pb-2 font-normal">Last Touch</th>
              <th className="text-left pb-2 font-normal">Score</th>
              <th className="text-right pb-2 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {priority.map(c => {
              const stage = stageLabel[c.status] ?? stageLabel.replied!;
              const score = fakeScore(c.name);
              return (
                <tr key={c.id} className="border-t border-edge hover:bg-elevated/50 transition-colors">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar name={c.name} size={26} />
                      <span className="text-primary">{c.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-secondary">{c.company || '-'}</td>
                  <td className="py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ color: stage.color, backgroundColor: `${stage.color}20` }}>
                      {stage.text}
                    </span>
                  </td>
                  <td className="py-2.5 text-muted">{relativeDate(c.dateAdded)}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-primary">{score}</span>
                      <div className="w-12 h-1.5 rounded-full bg-edge overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${score}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button className="p-1 text-muted hover:text-primary transition-colors cursor-pointer"><Mail size={13} /></button>
                      <button className="p-1 text-muted hover:text-primary transition-colors cursor-pointer"><ExternalLink size={13} /></button>
                      <button className="p-1 text-muted hover:text-primary transition-colors cursor-pointer"><MoreHorizontal size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
