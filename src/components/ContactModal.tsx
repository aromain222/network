'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { STATUS_CONFIG } from '@/lib/status';
import type { Contact, ContactStatus } from '@/lib/types';

type Props = {
  contact?: Contact;
  onSave: (data: Omit<Contact, 'id'>) => void;
  onClose: () => void;
};

const HOOKS = ['Amherst', 'Menlo', 'NESCAC', 'FDE', 'Fintech', 'AI', 'Murj', 'Founder', 'Black Network', 'Other'];

export function ContactModal({ contact, onSave, onClose }: Props) {
  const [name, setName] = useState(contact?.name ?? '');
  const [company, setCompany] = useState(contact?.company ?? '');
  const [role, setRole] = useState(contact?.role ?? '');
  const [status, setStatus] = useState<ContactStatus>(contact?.status ?? 'sent');
  const [hook, setHook] = useState(contact?.hook ?? 'Other');
  const [tags, setTags] = useState(contact?.tags?.join(', ') ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [linkedinUrl, setLinkedinUrl] = useState(contact?.linkedin_url ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      company: company.trim(),
      role: role.trim(),
      status,
      hook,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      notes: notes.trim(),
      message_sent: contact?.message_sent ?? '',
      linkedin_url: linkedinUrl.trim(),
      dateAdded: contact?.dateAdded ?? new Date().toISOString().slice(0, 10),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
    });
  }

  const input = 'w-full rounded-md border border-edge bg-bg px-3 py-2 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none transition-colors';
  const label = 'block text-[10px] text-secondary mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative bg-elevated border border-edge rounded-lg w-full max-w-md p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-serif text-base font-light">{contact ? 'Edit Contact' : 'Add Contact'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary transition-colors cursor-pointer"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2"><label className={label}>Name</label><input value={name} onChange={e => setName(e.target.value)} className={input} required /></div>
          <div><label className={label}>Company</label><input value={company} onChange={e => setCompany(e.target.value)} className={input} /></div>
          <div><label className={label}>Role</label><input value={role} onChange={e => setRole(e.target.value)} className={input} /></div>
          <div><label className={label}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as ContactStatus)} className={input}>
              {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
          </div>
          <div><label className={label}>Hook</label>
            <select value={hook} onChange={e => setHook(e.target.value)} className={input}>
              {HOOKS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="col-span-2"><label className={label}>Tags (comma separated)</label><input value={tags} onChange={e => setTags(e.target.value)} className={input} placeholder="e.g. priority, finance" /></div>
          <div><label className={label}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} className={input} placeholder="+1 555 123 4567" /></div>
          <div><label className={label}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} className={input} placeholder="name@example.com" type="email" /></div>
          <div className="col-span-2"><label className={label}>LinkedIn URL</label><input value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} className={input} /></div>
          <div className="col-span-2"><label className={label}>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${input} resize-y`} rows={2} /></div>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-edge px-3 py-2 text-xs text-secondary hover:text-primary transition-colors cursor-pointer">Cancel</button>
          <button type="submit" className="flex-1 rounded-md bg-accent px-3 py-2 text-xs text-white hover:bg-accent/90 transition-colors cursor-pointer">{contact ? 'Save' : 'Add'}</button>
        </div>
      </form>
    </div>
  );
}
