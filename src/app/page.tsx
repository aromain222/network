'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Clock, Star, TrendingUp, Plus, Download, Send, MessageSquare, CalendarCheck, CheckCircle, RefreshCw, X, BellOff } from 'lucide-react';
import { WeeklyChart } from '@/components/charts/WeeklyChart';
import { GoalChart } from '@/components/charts/GoalChart';
import { PipelineChart } from '@/components/charts/PipelineChart';
import { TargetCompanies } from '@/components/dashboard/TargetCompanies';
import { PriorityTable } from '@/components/dashboard/PriorityTable';
import { FollowUpPanel } from '@/components/dashboard/FollowUpPanel';
import { ComingUp } from '@/components/dashboard/ComingUp';
import { AgentActivity } from '@/components/dashboard/AgentActivity';
import { contactsToCsv } from '@/lib/contacts';
import type { Contact } from '@/lib/types';

export default function Dashboard() {
  const [contacts, setContacts] = useState<Contact[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/contacts');
    if (res.ok) setContacts(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [snoozed, setSnoozed] = useState<Set<string>>(new Set());

  const total = contacts.length;
  const followups = contacts.filter(c => c.status === 'followup').length;
  const highPriority = contacts.filter(c => c.status === 'scheduled' || c.status === 'followup').length;
  const engaged = contacts.filter(c => c.status === 'completed' || c.status === 'scheduled').length;
  const score = total > 0 ? Math.round((engaged / total) * 100) : 0;
  const topCompanies = [...new Set(contacts.filter(c => c.status === 'scheduled' || c.status === 'followup').map(c => c.company).filter(Boolean))].slice(0, 3);

  const pipeline = {
    sent: contacts.filter(c => c.status === 'sent'),
    replied: contacts.filter(c => c.status === 'replied'),
    scheduled: contacts.filter(c => c.status === 'scheduled'),
    completed: contacts.filter(c => c.status === 'completed'),
    followup: contacts.filter(c => c.status === 'followup'),
    noResponse: contacts.filter(c => c.status === 'no_response'),
  };

  const today = new Date();
  const twoWeeksAgo = new Date(today.getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const sixtyDaysAgo = new Date(today.getTime() - 60 * 86400000).toISOString().slice(0, 10);

  const stale = pipeline.sent.filter(c => c.dateAdded < twoWeeksAgo);

  const reengageContacts = contacts.filter(c => {
    if (c.status !== 'completed') return false;
    if (dismissed.has(c.id) || snoozed.has(c.id)) return false;
    const lastTouch = c.last_touch_date || c.met_date || c.dateAdded;
    return lastTouch < sixtyDaysAgo;
  });

  function snooze(id: string) {
    setSnoozed(prev => new Set(prev).add(id));
  }

  function handleExport() {
    const csv = contactsToCsv(contacts);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stats = [
    { icon: Users, label: 'Active Contacts', value: total, sub: `${contacts.filter(c => c.dateAdded >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).length} added this month`, subColor: 'text-green' },
    { icon: Clock, label: 'Follow-ups Due', value: followups, sub: 'Prioritize today', subColor: 'text-yellow' },
    { icon: Star, label: 'High Priority', value: highPriority, sub: topCompanies.join(', ') || 'None', subColor: 'text-secondary' },
    { icon: TrendingUp, label: 'Network Score', value: `${score}%`, sub: 'Based on warmth and recency', subColor: 'text-secondary' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Relationship Pipeline</h1>
          <p className="page-subtitle">Track every contact, follow-up, warm intro, and opportunity in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-[11px] text-secondary hover:text-primary hover:border-[#3a3a45] transition-colors cursor-pointer">
            <Download size={13} /> Export CRM
          </button>
          <a href="/contacts?add=true" className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11px] text-white hover:bg-accent/90 transition-colors cursor-pointer">
            <Plus size={13} /> Add Contact
          </a>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-lg border border-edge bg-surface p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className="text-secondary" />
                <span className="text-[10px] text-secondary">{s.label}</span>
              </div>
              <p className="text-2xl text-primary font-light">{s.value}</p>
              <p className={`text-[10px] mt-1 ${s.subColor}`}>{s.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[1fr_180px_180px] gap-3">
        <WeeklyChart />
        <GoalChart contacted={total} />
        <PipelineChart contacts={contacts} />
      </div>

      <AgentActivity />

      {/* Coming Up — scrollable meeting cards */}
      <ComingUp contacts={contacts} />

      {/* Pipeline */}
      <div className="rounded-lg border border-edge bg-surface p-5">
        <h2 className="text-xs text-secondary uppercase tracking-wider mb-4">Pipeline</h2>
        <div className="flex gap-2">
          {([
            { label: 'Sent', count: pipeline.sent.length, icon: Send, color: 'text-secondary', bg: 'bg-secondary/10' },
            { label: 'Replied', count: pipeline.replied.length, icon: MessageSquare, color: 'text-accent', bg: 'bg-accent/10' },
            { label: 'Scheduled', count: pipeline.scheduled.length, icon: CalendarCheck, color: 'text-green', bg: 'bg-green/10' },
            { label: 'Completed', count: pipeline.completed.length, icon: CheckCircle, color: 'text-purple', bg: 'bg-purple/10' },
            { label: 'Follow Up', count: pipeline.followup.length, icon: Clock, color: 'text-yellow', bg: 'bg-yellow/10' },
            { label: 'No Response', count: pipeline.noResponse.length + stale.length, icon: X, color: 'text-red', bg: 'bg-red/10' },
          ] as const).map(stage => {
            const Icon = stage.icon;
            return (
              <div key={stage.label} className={`flex-1 rounded-md ${stage.bg} p-3 text-center`}>
                <Icon size={14} className={`${stage.color} mx-auto mb-1`} />
                <p className={`text-lg font-light ${stage.color}`}>{stage.count}</p>
                <p className="text-[9px] text-muted mt-0.5">{stage.label}</p>
              </div>
            );
          })}
        </div>

        {stale.length > 0 && (
          <div className="mt-3 border-t border-edge pt-3">
            <p className="text-[10px] text-red mb-2">{stale.length} contact{stale.length > 1 ? 's' : ''} sent 2+ weeks ago with no reply</p>
            <div className="flex flex-wrap gap-1.5">
              {stale.slice(0, 8).map(c => (
                <span key={c.id} className="text-[10px] text-red/80 bg-red/10 px-2 py-0.5 rounded-full">{c.name}</span>
              ))}
              {stale.length > 8 && <span className="text-[10px] text-muted">+{stale.length - 8} more</span>}
            </div>
          </div>
        )}
      </div>

      {/* Re-engage */}
      {reengageContacts.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs text-secondary uppercase tracking-wider flex items-center gap-2">
              <RefreshCw size={13} className="text-orange" /> Re-engage
            </h2>
            <span className="text-[10px] text-orange bg-orange/10 px-2 py-0.5 rounded-full">{reengageContacts.length} due</span>
          </div>
          <div className="space-y-2">
            {reengageContacts.slice(0, 5).map(c => {
              const lastTouch = c.last_touch_date || c.met_date || c.dateAdded;
              const daysAgo = Math.floor((today.getTime() - new Date(lastTouch).getTime()) / 86400000);
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 py-2 border-b border-edge/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary font-medium">{c.name}</span>
                      {c.company && <span className="text-[10px] text-muted">{c.company}</span>}
                    </div>
                    <p className="text-[10px] text-secondary mt-0.5">Last contact {daysAgo} days ago</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={`/compose?context=${encodeURIComponent(`Re-engage with ${c.name}${c.company ? ` at ${c.company}` : ''}. Met ${daysAgo} days ago.`)}`}
                      className="text-[10px] text-accent bg-accent/10 px-2.5 py-1 rounded hover:bg-accent/20 transition-colors cursor-pointer"
                    >
                      Reconnect
                    </a>
                    <button onClick={() => snooze(c.id)} className="text-[10px] text-secondary hover:text-primary px-2 py-1 transition-colors cursor-pointer">
                      <BellOff size={11} />
                    </button>
                    <button onClick={() => setDismissed(prev => new Set(prev).add(c.id))} className="text-[10px] text-muted hover:text-secondary px-1 py-1 transition-colors cursor-pointer">
                      <X size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1fr_280px] gap-3">
        <PriorityTable contacts={contacts} />
        <div className="space-y-3">
          <TargetCompanies contacts={contacts} />
          <FollowUpPanel contacts={contacts} />
        </div>
      </div>
    </div>
  );
}
