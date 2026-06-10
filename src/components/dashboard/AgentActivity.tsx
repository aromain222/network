'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, ExternalLink } from 'lucide-react';
import type { AgentStatus } from '@/lib/agent-types';

function formatRun(value?: string) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function AgentActivity() {
  const [status, setStatus] = useState<AgentStatus | null>(null);

  useEffect(() => {
    fetch('/api/agent/status', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(setStatus)
      .catch(() => {});
  }, []);

  const discovery = status?.discovery;
  const acted = discovery ? discovery.stats.saved + discovery.stats.skipped : 0;
  const total = discovery?.stats.total || 0;

  return (
    <div className="rounded-lg border border-edge bg-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs text-secondary uppercase tracking-wider flex items-center gap-2">
          <Bot size={13} className="text-accent" /> Agent Activity
        </h2>
        <Link href="/discovery" className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80">
          Run Now <ExternalLink size={10} />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[11px]">
        <span className="text-muted">Last discovery</span>
        <span className="text-primary text-right">{formatRun(status?.last_runs.discovery?.completed_at)}</span>
        <span className="text-muted">People found</span>
        <span className="text-primary text-right">{total}</span>
        <span className="text-muted">Messages drafted</span>
        <span className="text-primary text-right">{status?.last_runs.discovery?.stats.drafted || 0}</span>
        <span className="text-muted">Acted on today</span>
        <span className="text-primary text-right">{acted} / {total || 25}</span>
        <span className="text-muted">Follow-ups due</span>
        <span className="text-yellow text-right">{status?.followups_due ?? 0}</span>
        <span className="text-muted">Re-engagements</span>
        <span className="text-orange text-right">{status?.reengagements_due ?? 0}</span>
        <span className="text-muted">Next run</span>
        <span className="text-primary text-right">Tomorrow 10:00 AM PT</span>
      </div>
    </div>
  );
}
