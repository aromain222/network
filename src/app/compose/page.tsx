'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Copy, Check, Loader2, FileText, Send, MessageSquare, Mail, Upload, RefreshCw, ArrowRight, UserCheck, CalendarCheck, HelpCircle, Clock, CalendarPlus } from 'lucide-react';
import type { Contact, ContactStatus, GenerateResponse, ReplyResponse } from '@/lib/types';

export default function ComposePage() {
  return <Suspense><ComposeInner /></Suspense>;
}

function StreamWords({ text, onDone }: { text: string; onDone?: () => void }) {
  const [count, setCount] = useState(0);
  const words = text.split(/(\s+)/);
  const done = useRef(false);

  useEffect(() => {
    setCount(0);
    done.current = false;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i >= words.length) {
        setCount(words.length);
        clearInterval(id);
        if (!done.current) { done.current = true; onDone?.(); }
      } else {
        setCount(i);
      }
    }, 30);
    return () => clearInterval(id);
  }, [text, onDone, words.length]);

  return <>{words.slice(0, count).join('')}<span className="animate-pulse text-muted">|</span></>;
}

function MessageCard({
  label, message, hook, index, copied, onCopy, animate,
}: {
  label: string; message: string; hook: string; index: number;
  copied: number | null; onCopy: (text: string, idx: number) => void;
  animate: boolean;
}) {
  const [streamed, setStreamed] = useState(!animate);

  return (
    <div className="border border-edge bg-elevated p-5 flex flex-col gap-3 flex-1 min-h-0 opacity-0 animate-[fadeIn_0.3s_ease_forwards]">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[10px] font-mono text-muted uppercase tracking-wider">{label}</span>
        <button onClick={() => onCopy(message, index)} className="flex items-center gap-1 text-[10px] text-secondary hover:text-primary transition-colors cursor-pointer">
          {copied === index ? <><Check size={11} className="text-green" /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>

      <p className="text-[13px] text-primary/90 whitespace-pre-wrap leading-[1.7] flex-1">
        {animate && !streamed
          ? <StreamWords text={message} onDone={() => setStreamed(true)} />
          : message}
      </p>

      <div className="flex items-center justify-between pt-2 border-t border-edge/50 shrink-0">
        <span className="rounded-full bg-accent/15 text-accent px-2.5 py-0.5 text-[10px]">{hook}</span>
        <span className="flex items-center gap-1 text-[10px] text-green"><Check size={11} /> Contact saved</span>
      </div>
    </div>
  );
}

function ComposeInner() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'compose' | 'reply'>('compose');
  const [profile, setProfile] = useState('');
  const [reply, setReply] = useState('');
  const [context, setContext] = useState(searchParams.get('context') ?? '');
  const [composeContext, setComposeContext] = useState('');
  const [composeResult, setComposeResult] = useState<GenerateResponse | null>(null);
  const [replyResult, setReplyResult] = useState<ReplyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [statusUpdated, setStatusUpdated] = useState(false);
  const [manualContactId, setManualContactId] = useState('');
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ date: '', time: '', location: '', notes: '' });
  const [meetingSaved, setMeetingSaved] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<{ date: string; day: string; time: string }[]>([]);
  const [findingTimes, setFindingTimes] = useState(false);
  const [confirmedTime, setConfirmedTime] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    fetch('/api/contacts').then(r => r.json()).then(setContacts).catch(() => {});
  }, []);

  function matchContact(text: string): Contact | null {
    const combined = `${text}\n${context}`.toLowerCase();
    let best: Contact | null = null;
    let bestScore = 0;
    const suffixes = /,?\s*\b(jr\.?|sr\.?|ii|iii|iv|esq\.?)\s*$/i;
    for (const c of contacts) {
      const cleanName = c.name.replace(suffixes, '').trim().toLowerCase();
      const nameParts = cleanName.split(/\s+/).filter(p => p.length > 1);
      const firstName = nameParts[0];
      const surname = nameParts[nameParts.length - 1];
      const fullMatch = combined.includes(cleanName);
      const surnameMatch = surname && combined.includes(surname);
      const firstMatch = firstName && combined.includes(firstName);
      const score = fullMatch ? 3 : (surnameMatch && firstMatch) ? 2 : surnameMatch ? 1 : 0;
      if (score > bestScore) { best = c; bestScore = score; }
    }
    return best;
  }

  function detectIntent(text: string): { status: ContactStatus; label: string } {
    const lower = text.toLowerCase();
    if (/\b(not the right|can.t help|not a fit|unfortunately|not hiring|no openings)\b/i.test(lower))
      return { status: 'no_response', label: 'Declined' };
    if (/\b(text me|email me|reach out|send me|my email|happy to chat|let.s connect|open to|call me|dm me)\b/i.test(lower))
      return { status: 'replied', label: 'Replied' };
    const scheduledText = lower.replace(/\bmeet you\b/g, '').replace(/\bnice to meet\b/g, '').replace(/\bgreat to meet\b/g, '');
    if (/\b(call scheduled|meeting confirmed|zoom at|google meet at|coffee on|lunch on|dinner on|tuesday \d|wednesday \d|thursday \d|friday \d|monday \d)\b/i.test(scheduledText))
      return { status: 'scheduled', label: 'Meeting set' };
    return { status: 'replied', label: 'Replied' };
  }

  const matchedContact = reply.trim() ? matchContact(reply) : null;
  const detectedIntent = reply.trim() ? detectIntent(reply) : null;

  const lastAutoUpdate = useRef<string>('');
  useEffect(() => {
    if (!matchedContact || !detectedIntent) return;
    const key = `${matchedContact.id}:${detectedIntent.status}`;
    if (key === lastAutoUpdate.current) return;
    if (matchedContact.status === detectedIntent.status) {
      lastAutoUpdate.current = key;
      setStatusUpdated(true);
      return;
    }
    lastAutoUpdate.current = key;
    updateContactStatus(matchedContact.id, detectedIntent.status);
  }, [matchedContact?.id, detectedIntent?.status]);

  const hasSchedulingLanguage = /\b(call|meet|zoom|google meet|schedule|tuesday|wednesday|thursday|friday|monday|next week|this week|coffee|lunch|dinner|2pm|3pm|1pm|time|slot)\b/i.test(reply);
  const askingForTimes = /\b(what time|when are you|pick a time|availability|schedule a call|when works|your schedule|free time|available)\b/i.test(reply);

  async function findAvailableTimes() {
    setFindingTimes(true);
    try {
      const raw = localStorage.getItem('scheduling-prefs');
      const prefs = raw ? JSON.parse(raw) : undefined;
      let overrides = {};
      try {
        const rawO = localStorage.getItem('calendar-overrides');
        if (rawO) overrides = JSON.parse(rawO);
      } catch {}
      const res = await fetch('/api/calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs, reply, context, overrides }),
      });
      const data = await res.json();
      setAvailableSlots(data.slots ?? []);
    } catch { setAvailableSlots([]); }
    finally { setFindingTimes(false); }
  }

  function detectMeetingDetails(text: string): { date: string; isoDate: string; time: string; platform: string; tz: string } | null {
    if (!text) return null;
    const monthMap: Record<string, number> = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
    const dayWords: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const now = new Date();

    // Look for a time near a "meeting intent" word — works|let's|free at|see you|can do|good for|perfect at|talk then|catch up at|sounds good
    // This avoids matching message timestamps like "Avery Romain (He/Him) 9:56 PM"
    const intentTimeMatch = text.match(/(?:works?|let'?s|free\s+(?:at|on)|see\s+you|talk(?:\s+to\s+you)?(?:\s+then)?|catch\s+up|sounds?\s+good|good\s+for|perfect|done|booked|locked\s+in|at|on|by)[\s\S]{0,60}?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(pt|pdt|et|est|edt|ct|cst|cdt|mt|mst|mdt)?/i)
      || text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(pt|pdt|et|est|edt|ct|cst|cdt|mt|mst|mdt)?[\s\S]{0,40}?(?:works?|sounds?\s+good|perfect|talk\s+then|see\s+you|locked\s+in|booked|done)/i);
    const timeMatch = intentTimeMatch || text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(pt|pdt|et|est|edt|ct|cst|cdt|mt|mst|mdt)?\b/i);
    if (!timeMatch) return null;

    const dateMatch = text.match(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\s+(\d{1,2})\b/i);
    const dayMatch = text.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (!dateMatch && !dayMatch) return null;

    let target: Date;
    let displayDate: string;
    if (dateMatch) {
      const m = monthMap[dateMatch[1].toLowerCase()];
      const d = parseInt(dateMatch[2]);
      const y = now.getFullYear();
      target = new Date(y, m, d);
      if (target < new Date(now.getFullYear(), now.getMonth(), now.getDate())) target.setFullYear(y + 1);
      displayDate = `${dateMatch[1]} ${dateMatch[2]}`;
    } else {
      const targetDow = dayWords[dayMatch![1].toLowerCase()];
      const todayDow = now.getDay();
      let offset = (targetDow - todayDow + 7) % 7;
      if (offset === 0) offset = 7;
      target = new Date(now);
      target.setDate(now.getDate() + offset);
      displayDate = dayMatch![1];
    }

    const isoDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    const h = parseInt(timeMatch[1]);
    const min = timeMatch[2] || '00';
    const ampm = timeMatch[3].toUpperCase();
    const tz = (timeMatch[4] || 'ET').toUpperCase();
    const timeStr = `${h}:${min} ${ampm} ${tz}`;

    let platform = '';
    if (/zoom/i.test(text)) platform = 'Zoom';
    else if (/google meet|gmeet|hangout/i.test(text)) platform = 'Google Meet';
    else if (/coffee/i.test(text)) platform = 'Coffee';
    else if (/lunch/i.test(text)) platform = 'Lunch';
    else if (/dinner/i.test(text)) platform = 'Dinner';
    else if (/in.person|in person/i.test(text)) platform = 'In person';
    else if (/phone|call/i.test(text)) platform = 'Phone call';

    return { date: displayDate, isoDate, time: timeStr, platform, tz };
  }

  // Detect from EITHER the AI-drafted reply OR the inbound reply.
  // The draft is most reliable: short and distilled. Trust it first.
  // For inbound, skip if it looks like a pasted thread (multi-line, many timestamps)
  // since those are full of weekday labels and message timestamps the detector confuses with meetings.
  const inboundLines = reply.split('\n').filter(l => l.trim()).length;
  const looksLikePastedThread = inboundLines > 6;
  const detectedFromDraft = replyResult?.reply ? detectMeetingDetails(replyResult.reply) : null;
  const detectedFromReply = reply.trim() && !askingForTimes && !looksLikePastedThread ? detectMeetingDetails(reply) : null;
  const detectedMeeting = detectedFromDraft || detectedFromReply;
  const detectedConfirmation = detectedMeeting ? { date: detectedMeeting.date, time: detectedMeeting.time } : null;

  async function saveMeeting() {
    const contactId = matchedContact?.id || manualContactId;
    if (!contactId) return;
    const notes = contacts.find(c => c.id === contactId)?.notes ?? '';
    const meetingNote = `${meetingForm.date} ${meetingForm.time} ${meetingForm.location}${meetingForm.notes ? ' — ' + meetingForm.notes : ''}`;
    await fetch('/api/contacts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: contactId, status: 'scheduled', notes: notes ? `${notes}\n${meetingNote}` : meetingNote }),
    });
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status: 'scheduled' as ContactStatus } : c));
    setMeetingSaved(true);
    setShowMeetingForm(false);
    setTimeout(() => setMeetingSaved(false), 3000);
  }

  async function updateContactStatus(contactId: string, status: ContactStatus) {
    await fetch('/api/contacts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: contactId, status }),
    });
    setStatusUpdated(true);
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status } : c));
    setTimeout(() => setStatusUpdated(false), 3000);
  }

  async function parseFile(file: File) {
    if (file.type === 'text/plain') { setProfile(await file.text()); return; }
    setParsing(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/parse-pdf', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Failed to parse');
      const { text } = await res.json();
      setProfile(String(text ?? ''));
    } catch { setError('Could not parse PDF'); }
    finally { setParsing(false); }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.type === 'text/plain')) parseFile(file);
  }, []);

  function cleanProfile(raw: string): string {
    return raw
      .replace(/Avery Romain.*?\n/gi, '')
      .replace(/View Avery['']?s (full )?profile.*?\n/gi, '')
      .replace(/^You sent.*?\n/gim, '')
      .replace(/^Avery Romain\s*\n/gim, '')
      .trim();
  }

  function parseThread(raw: string): { otherName: string; lastReply: string; context: string } | null {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const namePattern = /^([A-Z][a-z]+(?: [A-Z][a-z'-]+)+)$/;
    const averyPattern = /^avery romain$/i;
    const skipPatterns = /^(View |You sent|Delivered|Seen|Read|\d{1,2}\/\d{1,2}|Today|Yesterday|AM|PM|sent|SEE MORE)/i;
    let otherName = '';
    const otherMessages: string[] = [];
    const allMessages: { sender: string; text: string }[] = [];
    let currentSender = '';
    for (const line of lines) {
      if (skipPatterns.test(line)) continue;
      if (averyPattern.test(line)) { currentSender = 'avery'; continue; }
      if (namePattern.test(line) && !averyPattern.test(line)) { currentSender = line; if (!otherName) otherName = line; continue; }
      if (currentSender && currentSender !== 'avery') { otherMessages.push(line); allMessages.push({ sender: currentSender, text: line }); }
      else if (currentSender === 'avery') { allMessages.push({ sender: 'Avery', text: line }); }
    }
    if (!otherName || otherMessages.length === 0) return null;
    return { otherName, lastReply: otherMessages[otherMessages.length - 1], context: allMessages.slice(-6).map(m => `${m.sender}: ${m.text}`).join('\n') };
  }

  function handleAutoDetect() {
    const parsed = parseThread(profile);
    if (!parsed) return;
    setReply(parsed.lastReply);
    setContext(`Thread with ${parsed.otherName}:\n${parsed.context}`);
    setProfile('');
    setMode('reply');
  }

  const looksLikeThread = /avery romain|view avery/i.test(profile);
  const threadData = looksLikeThread ? parseThread(profile) : null;
  const cleaned = cleanProfile(profile);
  const hookMatch = cleaned.match(/amherst|menlo|nescac|williams|bowdoin|middlebury|afrotech|nsbe|mlt|black at/i);
  const detectedHook = hookMatch ? hookMatch[0] : null;
  const detectedEmail = reply.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;

  async function handleCompose() {
    if (!profile.trim()) return;
    setLoading(true); setError(''); setComposeResult(null); setAnimate(true);
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: cleaned, context: composeContext || undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error + (data.raw ? `\n\nRaw: ${data.raw.slice(0, 300)}` : ''));
      if (!Array.isArray(data.options)) throw new Error('Unexpected response — no message options');
      setComposeResult(data);
      if (data.person?.name) {
        await fetch('/api/contacts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: data.person.name, company: data.person.company || '',
            role: data.person.role || '', status: 'sent', hook: data.hook_used,
            tags: [], notes: data.reasoning, message_sent: data.options[0]?.message || '',
            linkedin_url: '', dateAdded: new Date().toISOString().slice(0, 10),
          }),
        });
        setContacts(prev => [...prev, { id: `temp-${Date.now()}`, name: data.person.name, company: data.person.company || '', role: data.person.role || '', status: 'sent' as ContactStatus } as Contact]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }

  async function handleReply(asEmail = false) {
    if (!reply.trim()) return;
    setLoading(true); setError(''); setReplyResult(null);
    const ctx = asEmail && detectedEmail ? `${context}\nDraft as email to ${detectedEmail}.` : context;
    try {
      const res = await fetch('/api/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply, context: ctx || undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setReplyResult(data);

      // Auto-log inbound reply to the contact's conversation thread
      const cid = matchedContact?.id || manualContactId;
      if (cid) {
        await fetch('/api/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: cid,
            direction: 'incoming',
            channel: detectedEmail ? 'email' : 'linkedin',
            body: reply.trim(),
          }),
        }).catch(() => {});
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }

  async function logSentReply(text: string) {
    const cid = matchedContact?.id || manualContactId;
    if (!cid) return;
    await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: cid,
        direction: 'outgoing',
        channel: detectedEmail ? 'email' : 'linkedin',
        body: text,
      }),
    }).catch(() => {});
  }

  function copy(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  }


  const inputClass = 'w-full border border-edge bg-bg px-4 py-3 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none resize-none transition-colors';

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">Compose</h1>
          <p className="page-subtitle">AI-assisted outreach and reply drafting</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-edge mb-5">
        <button onClick={() => setMode('compose')} className={`px-4 py-2 text-xs border-b-2 -mb-px transition-colors cursor-pointer ${mode === 'compose' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'}`}>
          <Send size={13} className="inline mr-1.5" />New Message
        </button>
        <button onClick={() => setMode('reply')} className={`px-4 py-2 text-xs border-b-2 -mb-px transition-colors cursor-pointer ${mode === 'reply' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'}`}>
          <MessageSquare size={13} className="inline mr-1.5" />Draft Reply
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
        {/* Left column — Input */}
        <div className="flex flex-col gap-3 min-h-0">
          {mode === 'compose' ? (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className="relative flex-1 flex flex-col min-h-0"
              >
                <label className="block text-[10px] text-secondary mb-1.5 uppercase tracking-wider shrink-0">Profile</label>
                {parsing ? (
                  <div className="flex-1 flex items-center justify-center gap-2 border border-edge bg-bg text-xs text-secondary">
                    <Loader2 size={14} className="animate-spin" /> Extracting text from PDF...
                  </div>
                ) : (
                  <textarea
                    value={profile}
                    onChange={e => setProfile(e.target.value)}
                    placeholder="Paste the recipient's LinkedIn profile here — not the conversation thread. Copy their About, Experience, and Education sections."
                    className={`${inputClass} flex-1 resize-y ${dragging ? 'border-accent bg-accent/5' : ''}`}
                  />
                )}
                {dragging && (
                  <div className="absolute inset-0 top-5 flex items-center justify-center border-2 border-dashed border-accent bg-accent/10 pointer-events-none">
                    <div className="flex items-center gap-2 text-xs text-accent"><Upload size={16} /> Drop PDF here</div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2 shrink-0">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[10px] text-secondary hover:text-primary border border-edge px-2.5 py-1 transition-colors">
                  <FileText size={12} /> Upload PDF
                  <input type="file" accept=".pdf,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }} className="hidden" />
                </label>
                {looksLikeThread && (
                  <span className="text-[10px] text-yellow bg-yellow/10 px-2.5 py-1 rounded-full flex items-center gap-2">
                    {threadData
                      ? <>Thread with {threadData.otherName}
                          <button onClick={handleAutoDetect} className="inline-flex items-center gap-1 text-accent bg-accent/15 px-2 py-0.5 rounded-full hover:bg-accent/25 transition-colors cursor-pointer">
                            Draft Reply <ArrowRight size={10} />
                          </button>
                        </>
                      : <>Message thread detected — paste a profile instead</>
                    }
                  </span>
                )}
                {!looksLikeThread && detectedHook && (
                  <span className="text-[10px] text-accent bg-accent/10 px-2.5 py-1 rounded-full">
                    Hook detected: {detectedHook}
                  </span>
                )}
              </div>

              <div className="shrink-0">
                <label className="block text-[10px] text-secondary mb-1 uppercase tracking-wider">Additional context (optional)</label>
                <input
                  type="text"
                  value={composeContext}
                  onChange={e => setComposeContext(e.target.value)}
                  placeholder="e.g. we both went to Menlo, he played football, I'm interning at Murj, we've met before..."
                  className="w-full border border-edge bg-bg px-3 py-2 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none transition-colors"
                />
              </div>

              <button
                onClick={handleCompose}
                disabled={loading || !profile.trim()}
                className="w-full flex items-center justify-center gap-2 bg-accent px-4 py-3 text-xs text-white hover:bg-accent/90 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {loading ? 'Generating...' : 'Generate Messages'}
              </button>
            </>
          ) : (
            <>
              <div className="flex-1 flex flex-col gap-3 min-h-0">
                <div className="flex-1 flex flex-col min-h-0">
                  <label className="block text-[10px] text-secondary mb-1.5 uppercase tracking-wider shrink-0">Reply received</label>
                  <textarea value={reply} onChange={e => setReply(e.target.value)} className={`${inputClass} flex-1 resize-y`} placeholder='"Hey Avery, happy to chat. Email me at john@company.com"' />
                </div>
                <div>
                  <label className="block text-[10px] text-secondary mb-1.5 uppercase tracking-wider">Context (optional)</label>
                  <textarea value={context} onChange={e => setContext(e.target.value)} rows={3} className={`${inputClass} resize-y`} placeholder="Amherst alum, works at Stripe" />
                </div>
              </div>

              {reply.trim() && detectedIntent && (matchedContact ? (
                <div className="flex items-center justify-between gap-2 text-[10px] bg-surface border border-edge px-3 py-2.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <UserCheck size={12} className="text-green" />
                    <span className="text-primary font-medium">{matchedContact.name}</span>
                    {matchedContact.company && <span className="text-muted">{matchedContact.company}</span>}
                    <span className="text-secondary">—</span>
                    <span className={`px-2 py-0.5 rounded-full ${
                      detectedIntent.status === 'scheduled' ? 'text-green bg-green/15' :
                      detectedIntent.status === 'no_response' ? 'text-red bg-red/15' :
                      'text-accent bg-accent/15'
                    }`}>{detectedIntent.label}</span>
                  </div>
                  <span className="flex items-center gap-1 text-green"><Check size={11} /> Auto-updated</span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 text-[10px] bg-surface border border-edge px-3 py-2.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <HelpCircle size={12} className="text-yellow" />
                    <span className="text-secondary">Who is this reply from?</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={manualContactId}
                      onChange={e => setManualContactId(e.target.value)}
                      className="bg-bg border border-edge text-[10px] text-primary px-2 py-1 focus:outline-none focus:border-accent"
                    >
                      <option value="">Select contact...</option>
                      {contacts.filter(c => c.status !== 'completed').map(c => (
                        <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
                      ))}
                    </select>
                    {manualContactId && !statusUpdated && (
                      <button
                        onClick={() => updateContactStatus(manualContactId, detectedIntent.status)}
                        className="flex items-center gap-1 text-accent hover:text-accent/80 transition-colors cursor-pointer"
                      >
                        <CalendarCheck size={11} /> Update
                      </button>
                    )}
                    {statusUpdated && <span className="flex items-center gap-1 text-green"><Check size={11} /> Updated</span>}
                  </div>
                </div>
              ))}

              {detectedEmail && (
                <div className="flex items-center gap-2 text-[10px] text-yellow bg-yellow/10 px-3 py-2 shrink-0">
                  <Mail size={12} />
                  <span>Email detected: {detectedEmail}</span>
                </div>
              )}

              {askingForTimes && availableSlots.length === 0 && (
                <button
                  onClick={findAvailableTimes}
                  disabled={findingTimes}
                  className="flex items-center justify-center gap-2 border border-accent/30 bg-accent/5 px-4 py-2.5 text-[11px] text-accent hover:bg-accent/10 transition-colors cursor-pointer shrink-0"
                >
                  {findingTimes ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
                  {findingTimes ? 'Finding times...' : 'Find Available Times'}
                </button>
              )}

              {availableSlots.length > 0 && (
                <div className="border border-accent/20 bg-accent/5 p-3 space-y-2 shrink-0">
                  <p className="text-[10px] text-accent uppercase tracking-wider">Available Slots</p>
                  <div className="space-y-1">
                    {availableSlots.map((slot, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-primary">
                        <CalendarPlus size={11} className="text-accent" />
                        <span>{slot.day}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const name = matchedContact?.name?.split(' ')[0] || 'there';
                      const times = availableSlots.map(s => `• ${s.day}`).join('\n');
                      setContext(prev => `${prev ? prev + '\n' : ''}Propose these times:\n${times}`);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 bg-accent text-white px-3 py-2 text-[11px] hover:bg-accent/90 transition-colors cursor-pointer mt-1"
                  >
                    <Send size={11} /> Draft Reply with These Times
                  </button>
                </div>
              )}

              {detectedConfirmation && (matchedContact || manualContactId) && !meetingSaved && (
                <button
                  onClick={() => {
                    const cid = matchedContact?.id || manualContactId;
                    const cName = matchedContact?.name || contacts.find(c => c.id === manualContactId)?.name || '';
                    setMeetingForm({ date: detectedConfirmation.date, time: detectedConfirmation.time, location: 'Google Meet', notes: `Call with ${cName}` });
                    setShowMeetingForm(true);
                  }}
                  className="flex items-center justify-center gap-2 border border-green/30 bg-green/5 px-4 py-2.5 text-[11px] text-green hover:bg-green/10 transition-colors cursor-pointer shrink-0"
                >
                  <CalendarPlus size={13} /> Create Calendar Event — {detectedConfirmation.date} at {detectedConfirmation.time}
                </button>
              )}

              <div className="flex gap-2 shrink-0">
                <button onClick={() => handleReply(false)} disabled={loading || !reply.trim()} className="flex-1 flex items-center justify-center gap-2 bg-accent px-4 py-3 text-xs text-white hover:bg-accent/90 disabled:opacity-40 transition-colors cursor-pointer">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                  {loading ? 'Drafting...' : 'Draft Reply'}
                </button>
                {detectedEmail && (
                  <button onClick={() => handleReply(true)} disabled={loading} className="flex items-center gap-2 border border-edge px-4 py-3 text-xs text-secondary hover:text-primary transition-colors cursor-pointer">
                    <Mail size={14} /> Email
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right column — Output */}
        <div className="flex flex-col min-h-0">
          {error && <div className="border border-red/30 bg-red/10 px-4 py-3 text-xs text-red mb-3 shrink-0">{error}</div>}

          {loading && !composeResult && !replyResult && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 border border-edge bg-elevated">
              <Loader2 size={20} className="animate-spin text-accent" />
              <p className="text-xs text-secondary">{mode === 'compose' ? 'Crafting your messages...' : 'Drafting reply...'}</p>
            </div>
          )}

          {mode === 'compose' && composeResult && (
            <div className="flex flex-col flex-1 min-h-0 gap-0">
              <div className="flex items-center gap-2 text-xs px-1 mb-3 shrink-0">
                <span className="text-primary font-medium">{composeResult.person.name}</span>
                {composeResult.person.role && (
                  <span className="text-muted">{composeResult.person.role} at {composeResult.person.company}</span>
                )}
              </div>

              <div className="flex flex-col flex-1 min-h-0 gap-0">
                {composeResult.options.map((opt, i) => (
                  <div key={i} className={i > 0 ? 'border-t-0' : ''}>
                    <MessageCard
                      label={opt.label}
                      message={opt.message}
                      hook={composeResult.hook_used}
                      index={i}
                      copied={copied}
                      onCopy={copy}
                      animate={animate}
                    />
                  </div>
                ))}
              </div>

              {composeResult.reasoning && (
                <p className="text-[10px] text-muted italic px-1 mt-2 shrink-0">{composeResult.reasoning}</p>
              )}

              <div className="flex justify-center mt-3 shrink-0">
                <button
                  onClick={() => { setAnimate(true); handleCompose(); }}
                  disabled={loading}
                  className="flex items-center gap-1.5 border border-edge px-4 py-2 text-[11px] text-secondary hover:text-primary transition-colors cursor-pointer"
                >
                  <RefreshCw size={12} /> Regenerate
                </button>
              </div>
            </div>
          )}

          {mode === 'reply' && replyResult && (
            <div className="flex flex-col flex-1 min-h-0 gap-3">
              <div className="border border-edge bg-elevated p-5 flex-1 flex flex-col gap-3">
                <div className="flex items-center justify-between shrink-0">
                  <span className="rounded-full bg-accent/15 text-accent px-2.5 py-0.5 text-[10px]">{replyResult.reply_type}</span>
                  <button onClick={() => { copy(replyResult.reply, 99); logSentReply(replyResult.reply); }} className="flex items-center gap-1 text-[10px] text-secondary hover:text-primary cursor-pointer">
                    {copied === 99 ? <><Check size={11} className="text-green" /> Copied</> : <><Copy size={11} /> Copy</>}
                  </button>
                </div>
                <p className="text-[13px] text-primary/90 whitespace-pre-wrap leading-[1.7] flex-1">{replyResult.reply}</p>
              </div>

              {hasSchedulingLanguage && (matchedContact || manualContactId) && !meetingSaved && (
                !showMeetingForm ? (
                  <button
                    onClick={() => {
                      if (detectedMeeting) {
                        setMeetingForm({
                          date: detectedMeeting.isoDate,
                          time: detectedMeeting.time,
                          location: detectedMeeting.platform,
                          notes: '',
                        });
                      }
                      setShowMeetingForm(true);
                    }}
                    className="flex items-center justify-center gap-2 border border-green/30 bg-green/5 px-4 py-2.5 text-[11px] text-green hover:bg-green/10 transition-colors cursor-pointer shrink-0"
                  >
                    <CalendarCheck size={13} />
                    {detectedMeeting
                      ? `Add to calendar — ${detectedMeeting.date} at ${detectedMeeting.time}`
                      : 'Add Meeting to Calendar'}
                  </button>
                ) : (
                  <div className="border border-edge bg-surface p-4 space-y-3 shrink-0">
                    <p className="text-[10px] text-secondary uppercase tracking-wider">Schedule Meeting</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={meetingForm.date} onChange={e => setMeetingForm(f => ({ ...f, date: e.target.value }))} className="bg-bg border border-edge px-3 py-2 text-xs text-primary focus:border-accent focus:outline-none" />
                      <input type="text" value={meetingForm.time} onChange={e => setMeetingForm(f => ({ ...f, time: e.target.value }))} placeholder="2:00 PM ET" className="bg-bg border border-edge px-3 py-2 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none" />
                    </div>
                    <input type="text" value={meetingForm.location} onChange={e => setMeetingForm(f => ({ ...f, location: e.target.value }))} placeholder="Zoom / Google Meet / Coffee at..." className="w-full bg-bg border border-edge px-3 py-2 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none" />
                    <input type="text" value={meetingForm.notes} onChange={e => setMeetingForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" className="w-full bg-bg border border-edge px-3 py-2 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none" />
                    <div className="flex gap-2">
                      <button onClick={saveMeeting} disabled={!meetingForm.date} className="flex-1 bg-green text-white px-3 py-2 text-[11px] hover:bg-green/90 disabled:opacity-40 transition-colors cursor-pointer">Save Meeting</button>
                      <button onClick={() => setShowMeetingForm(false)} className="px-3 py-2 text-[11px] text-secondary border border-edge hover:text-primary transition-colors cursor-pointer">Cancel</button>
                    </div>
                  </div>
                )
              )}
              {meetingSaved && (
                <div className="flex items-center gap-2 text-[11px] text-green bg-green/10 border border-green/20 px-4 py-2.5 shrink-0">
                  <Check size={13} /> Meeting added to calendar
                </div>
              )}
            </div>
          )}

          {!composeResult && !replyResult && !error && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-edge">
              <Send size={24} className="text-muted/40" />
              <p className="text-xs text-muted">Generate a message to see options here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
