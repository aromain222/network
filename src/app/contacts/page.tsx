'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, Plus, Download, ChevronDown, Trash2, Phone, Send } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { ContactModal } from '@/components/ContactModal';
import { LogCallModal } from '@/components/LogCallModal';
import { FollowUpModal } from '@/components/FollowUpModal';
import { STATUS_CONFIG } from '@/lib/status';
import { contactsToCsv } from '@/lib/contacts';
import { relativeDate } from '@/lib/utils';
import type { Contact, ContactStatus } from '@/lib/types';

const STATUSES: (ContactStatus | 'all')[] = ['all', 'sent', 'replied', 'scheduled', 'completed', 'followup', 'no_response'];
const TAG_FILTERS = ['Amherst', 'Menlo', 'FDE', 'Fintech', 'AI', 'Finance', 'Founder'];

export default function ContactsPage() {
  return <Suspense><ContactsInner /></Suspense>;
}

function ContactsInner() {
  const searchParams = useSearchParams();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(searchParams.get('add') === 'true');
  const [editContact, setEditContact] = useState<Contact | undefined>(undefined);
  const [logCallContact, setLogCallContact] = useState<Contact | null>(null);
  const [followUpContact, setFollowUpContact] = useState<Contact | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/contacts');
    if (res.ok) setContacts(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = contacts.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (tagFilter && !c.tags.some(t => t.toLowerCase().includes(tagFilter.toLowerCase()))) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.company.toLowerCase().includes(q) && !c.role.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  async function handleSave(data: Omit<Contact, 'id'>) {
    if (editContact) {
      await fetch('/api/contacts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editContact.id, ...data }) });
    } else {
      await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    }
    setShowModal(false);
    setEditContact(undefined);
    load();
  }

  async function handleDelete(id: string) {
    await fetch('/api/contacts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    load();
  }

  async function handleStatus(id: string, status: ContactStatus) {
    await fetch('/api/contacts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
    load();
  }

  async function handleLogCall(notes: string) {
    if (!logCallContact) return;
    const existing = logCallContact.notes ? `${logCallContact.notes}\n` : '';
    await fetch('/api/contacts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: logCallContact.id, status: 'completed', notes: `${existing}Call ${new Date().toISOString().slice(0, 10)}: ${notes}` }),
    });
    setLogCallContact(null);
    load();
  }

  async function handleFollowUpSent() {
    if (!followUpContact) return;
    await fetch('/api/contacts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: followUpContact.id, followup_date: new Date().toISOString().slice(0, 10) }),
    });
    setFollowUpContact(null);
    load();
  }

  function handleExport() {
    const csv = contactsToCsv(contacts);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">Everyone in your network</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-[11px] text-secondary hover:text-primary transition-colors cursor-pointer"><Download size={13} /> CSV</button>
          <button onClick={() => { setEditContact(undefined); setShowModal(true); }} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11px] text-white hover:bg-accent/90 transition-colors cursor-pointer"><Plus size={13} /> Add</button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full rounded-md border border-edge bg-surface pl-8 pr-3 py-2 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none transition-colors" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex gap-1">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`rounded-full px-2.5 py-1 text-[10px] transition-colors cursor-pointer ${statusFilter === s ? 'bg-accent text-white' : 'border border-edge text-secondary hover:text-primary'}`}>
              {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-edge" />
        <div className="flex gap-1">
          {TAG_FILTERS.map(t => (
            <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)} className={`rounded-full px-2.5 py-1 text-[10px] transition-colors cursor-pointer ${tagFilter === t ? 'bg-purple text-white' : 'border border-edge text-secondary hover:text-primary'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-edge bg-surface overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-muted border-b border-edge">
              <th className="text-left px-4 py-2.5 font-normal">Contact</th>
              <th className="text-left px-4 py-2.5 font-normal">Company & Role</th>
              <th className="text-left px-4 py-2.5 font-normal">Status</th>
              <th className="text-left px-4 py-2.5 font-normal">Tags</th>
              <th className="text-left px-4 py-2.5 font-normal">Hook</th>
              <th className="text-left px-4 py-2.5 font-normal">Updated</th>
              <th className="text-right px-4 py-2.5 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const cfg = STATUS_CONFIG[c.status];
              return (
                <tr key={c.id} className="border-b border-edge last:border-0 hover:bg-elevated/30 transition-colors group">
                  <td className="px-4 py-2.5">
                    <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} className="flex items-center gap-2 cursor-pointer">
                      <Avatar name={c.name} size={26} />
                      <span className="text-primary">{c.name}</span>
                      <ChevronDown size={12} className={`text-muted transition-transform ${expandedId === c.id ? 'rotate-180' : ''}`} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-secondary">{[c.role, c.company].filter(Boolean).join(' at ') || '-'}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ color: cfg.color, backgroundColor: `${cfg.color}20` }}>{cfg.label}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 flex-wrap">{c.tags.map(t => <span key={t} className="border border-edge rounded-full px-1.5 py-0.5 text-[9px] text-muted">{t}</span>)}</div>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{c.hook}</td>
                  <td className="px-4 py-2.5 text-muted">{relativeDate(c.dateAdded)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {c.status !== 'completed' && (
                        <button onClick={() => setLogCallContact(c)} className="flex items-center gap-1 text-[10px] text-green cursor-pointer" title="Log a call">
                          <Phone size={11} /> Log Call
                        </button>
                      )}
                      {c.status === 'completed' && (
                        <button onClick={() => setFollowUpContact(c)} className="flex items-center gap-1 text-[10px] text-yellow cursor-pointer" title="Send follow-up">
                          <Send size={11} /> Follow-Up
                        </button>
                      )}
                      <a href={`/contacts/${c.id}`} className="text-[10px] text-accent cursor-pointer">View</a>
                      <button onClick={() => { setEditContact(c); setShowModal(true); }} className="text-[10px] text-accent cursor-pointer">Edit</button>
                      <button onClick={() => handleDelete(c.id)} className="text-[10px] text-red cursor-pointer"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-xs text-muted py-8 text-center">No contacts match your filters.</p>}
      </div>

      {showModal && <ContactModal contact={editContact} onSave={handleSave} onClose={() => { setShowModal(false); setEditContact(undefined); }} />}
      {logCallContact && <LogCallModal contactName={logCallContact.name} onSave={handleLogCall} onClose={() => setLogCallContact(null)} />}
      {followUpContact && <FollowUpModal contactName={followUpContact.name} onMarkSent={handleFollowUpSent} onClose={() => setFollowUpContact(null)} />}
    </div>
  );
}
