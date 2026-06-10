'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Phone, Mail, Link2, Send, Trash2, Plus, MessageSquare, Building2, Clock, Loader2 } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import type { Contact, Message, MessageChannel, MessageDirection } from '@/lib/types';
import { STATUS_CONFIG } from '@/lib/status';

const CHANNEL_LABEL: Record<MessageChannel, string> = {
  linkedin: 'LinkedIn',
  email: 'Email',
  sms: 'SMS',
  imessage: 'iMessage',
  phone: 'Phone call',
  'in-person': 'In person',
  other: 'Other',
};

const CHANNELS: MessageChannel[] = ['linkedin', 'email', 'sms', 'imessage', 'phone', 'in-person', 'other'];

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState<{ direction: MessageDirection; channel: MessageChannel; body: string; timestamp: string }>({
    direction: 'outgoing', channel: 'linkedin', body: '', timestamp: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, mRes] = await Promise.all([
        fetch('/api/contacts').then(r => r.json()),
        fetch(`/api/messages?contact_id=${id}`).then(r => r.json()),
      ]);
      const c = (cRes as Contact[]).find(x => x.id === id);
      setContact(c || null);
      setMessages(mRes);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveMessage() {
    if (!form.body.trim() || !id) return;
    setSaving(true);
    try {
      await fetch('/api/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: id,
          direction: form.direction,
          channel: form.channel,
          body: form.body.trim(),
          timestamp: form.timestamp ? new Date(form.timestamp).toISOString() : new Date().toISOString(),
        }),
      });
      // Also update last_touch_date so it shows up in re-engage / dashboard
      await fetch('/api/contacts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, last_touch_date: new Date().toISOString().slice(0, 10) }),
      });
      setForm({ direction: 'outgoing', channel: form.channel, body: '', timestamp: '' });
      setComposing(false);
      await load();
    } finally { setSaving(false); }
  }

  async function removeMessage(mid: string) {
    if (!confirm('Delete this message?')) return;
    await fetch(`/api/messages?id=${mid}`, { method: 'DELETE' });
    await load();
  }

  if (loading) return <div className="flex items-center justify-center py-12 text-muted text-xs"><Loader2 size={14} className="animate-spin mr-2" /> Loading…</div>;
  if (!contact) return (
    <div className="space-y-4">
      <button onClick={() => router.push('/contacts')} className="text-xs text-secondary hover:text-primary flex items-center gap-1.5 cursor-pointer"><ArrowLeft size={12} /> Back to contacts</button>
      <p className="text-sm text-muted">Contact not found.</p>
    </div>
  );

  const status = STATUS_CONFIG[contact.status];

  return (
    <div className="space-y-5 max-w-3xl">
      <button onClick={() => router.push('/contacts')} className="text-xs text-secondary hover:text-primary flex items-center gap-1.5 cursor-pointer">
        <ArrowLeft size={12} /> Back to contacts
      </button>

      {/* Header card */}
      <div className="rounded-lg border border-edge bg-surface p-5">
        <div className="flex items-start gap-4">
          <Avatar name={contact.name} size={56} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="page-title">{contact.name}</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: status.color, backgroundColor: `${status.color}20` }}>{status.label}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-secondary flex-wrap">
              {contact.role && <span>{contact.role}</span>}
              {contact.company && <span className="flex items-center gap-1"><Building2 size={11} /> {contact.company}</span>}
              {contact.hook && <span className="text-accent">Hook: {contact.hook}</span>}
            </div>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-[11px] text-primary bg-bg border border-edge px-2.5 py-1 rounded-md hover:border-accent transition-colors">
                  <Phone size={11} className="text-accent" /> {contact.phone}
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-[11px] text-primary bg-bg border border-edge px-2.5 py-1 rounded-md hover:border-accent transition-colors">
                  <Mail size={11} className="text-accent" /> {contact.email}
                </a>
              )}
              {contact.linkedin_url && (
                <a href={contact.linkedin_url} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-[11px] text-primary bg-bg border border-edge px-2.5 py-1 rounded-md hover:border-accent transition-colors">
                  <Link2 size={11} className="text-accent" /> LinkedIn
                </a>
              )}
              {!contact.phone && !contact.email && !contact.linkedin_url && (
                <span className="text-[10px] text-muted">No contact methods saved. Add phone/email via Edit.</span>
              )}
            </div>
          </div>
        </div>

        {contact.notes && (
          <div className="mt-4 pt-4 border-t border-edge">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Notes</p>
            <p className="text-xs text-secondary whitespace-pre-wrap leading-relaxed">{contact.notes}</p>
          </div>
        )}
      </div>

      {/* Conversation */}
      <div className="rounded-lg border border-edge bg-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm text-primary font-medium flex items-center gap-1.5">
              <MessageSquare size={13} className="text-accent" /> Conversation
            </h2>
            <span className="text-[10px] text-muted">{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span>
          </div>
          {!composing && (
            <button onClick={() => setComposing(true)} className="flex items-center gap-1 bg-accent text-white px-3 py-1.5 text-[11px] rounded-md hover:bg-accent/90 transition-colors cursor-pointer">
              <Plus size={11} /> Log message
            </button>
          )}
        </div>

        {composing && (
          <div className="border border-accent/20 bg-accent/5 rounded-md p-3 space-y-2 mb-4">
            <div className="flex gap-2">
              <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value as MessageDirection }))}
                className="bg-bg border border-edge px-2 py-1.5 text-[11px] text-primary rounded-md focus:border-accent focus:outline-none">
                <option value="outgoing">You sent</option>
                <option value="incoming">They sent</option>
              </select>
              <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value as MessageChannel }))}
                className="bg-bg border border-edge px-2 py-1.5 text-[11px] text-primary rounded-md focus:border-accent focus:outline-none">
                {CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </select>
              <input type="datetime-local" value={form.timestamp} onChange={e => setForm(f => ({ ...f, timestamp: e.target.value }))}
                className="flex-1 bg-bg border border-edge px-2 py-1.5 text-[11px] text-primary rounded-md focus:border-accent focus:outline-none" />
            </div>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              rows={3} placeholder="Paste the message..."
              className="w-full bg-bg border border-edge px-3 py-2 text-xs text-primary placeholder-muted rounded-md focus:border-accent focus:outline-none resize-y" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setComposing(false)} className="text-[11px] text-secondary px-3 py-1.5 border border-edge rounded-md hover:text-primary cursor-pointer">Cancel</button>
              <button onClick={saveMessage} disabled={saving || !form.body.trim()}
                className="bg-accent text-white px-3 py-1.5 text-[11px] rounded-md hover:bg-accent/90 disabled:opacity-50 cursor-pointer flex items-center gap-1">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                Save
              </button>
            </div>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare size={20} className="mx-auto text-muted mb-2" />
            <p className="text-xs text-muted">No messages logged yet.</p>
            <p className="text-[10px] text-muted/70 mt-1">Click "Log message" to start tracking the conversation.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map(m => {
              const isOut = m.direction === 'outgoing';
              return (
                <div key={m.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] rounded-lg border p-3 group ${
                    isOut ? 'bg-accent/10 border-accent/20' : 'bg-bg border-edge'
                  }`}>
                    <div className="flex items-center gap-2 mb-1 text-[10px] text-muted">
                      <span className={isOut ? 'text-accent' : 'text-primary/70'}>
                        {isOut ? 'You' : contact.name.split(' ')[0]}
                      </span>
                      <span className="text-muted">·</span>
                      <span>{CHANNEL_LABEL[m.channel]}</span>
                      <span className="text-muted">·</span>
                      <span className="flex items-center gap-1"><Clock size={9} /> {new Date(m.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      <button onClick={() => removeMessage(m.id)} className="ml-auto opacity-0 group-hover:opacity-100 text-muted hover:text-red transition-opacity cursor-pointer">
                        <Trash2 size={10} />
                      </button>
                    </div>
                    <p className="text-xs text-primary/90 whitespace-pre-wrap leading-relaxed">{m.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
