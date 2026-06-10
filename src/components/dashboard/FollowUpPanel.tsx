'use client';

import { Avatar } from '@/components/Avatar';
import { relativeDate, isOverdue } from '@/lib/utils';
import type { Contact } from '@/lib/types';

export function FollowUpPanel({ contacts }: { contacts: Contact[] }) {
  const followups = contacts
    .filter(c => c.status === 'followup' || c.status === 'scheduled')
    .sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime());

  return (
    <div className="rounded-lg border border-edge bg-surface p-4">
      <h3 className="text-xs text-secondary mb-3">Follow-ups Due</h3>
      {followups.length === 0 ? (
        <p className="text-[10px] text-muted py-4 text-center">All clear!</p>
      ) : (
        <div className="space-y-2">
          {followups.map(c => {
            const overdue = isOverdue(c.dateAdded);
            const diff = Math.floor((Date.now() - new Date(c.dateAdded).getTime()) / 86400000);
            return (
              <div key={c.id} className="flex items-start gap-2.5 p-2 rounded-md hover:bg-elevated/50 transition-colors">
                <Avatar name={c.name} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-primary truncate">{c.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                      overdue ? 'bg-red/15 text-red' : diff <= 2 ? 'bg-yellow/15 text-yellow' : 'bg-edge text-muted'
                    }`}>
                      {relativeDate(c.dateAdded)}
                    </span>
                  </div>
                  {c.company && <p className="text-[10px] text-muted truncate">{c.company}</p>}
                  {c.notes && <p className="text-[10px] text-muted italic mt-0.5 line-clamp-1">{c.notes}</p>}
                  <div className="flex gap-2 mt-1.5">
                    <button className="text-[10px] text-accent hover:text-accent/80 transition-colors cursor-pointer">Draft Email</button>
                    <button className="text-[10px] text-secondary hover:text-primary transition-colors cursor-pointer">LinkedIn DM</button>
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
