'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Bot, User, ChevronDown, ChevronUp, Save, Check } from 'lucide-react';

type ChatMessage = { role: 'user' | 'assistant'; content: string; timestamp: number };

type Prefs = {
  days: boolean[];
  startHour: number;
  endHour: number;
  meetingLength: number;
  buffer: number;
  blackoutDates: string[];
};

const DEFAULTS: Prefs = {
  days: [false, true, true, true, true, true, false],
  startHour: 10,
  endHour: 18,
  meetingLength: 30,
  buffer: 30,
  blackoutDates: [],
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7);
function formatHour(h: number) {
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  return h > 12 ? `${h - 12} PM` : `${h} AM`;
}

const SUGGESTIONS = [
  'When am I free next week?',
  'Who should I follow up with?',
  'Prep me for my call with Elliot Tight',
  'What meetings do I have coming up?',
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem('scheduling-prefs');
    if (raw) setPrefs(JSON.parse(raw));
    const saved = localStorage.getItem('assistant-messages');
    if (saved) {
      try { setMessages(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('assistant-messages', JSON.stringify(messages.slice(-50)));
    }
  }, [messages]);

  function savePrefs() {
    localStorage.setItem('scheduling-prefs', JSON.stringify(prefs));
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 2000);
  }

  function toggleDay(i: number) {
    setPrefs(p => ({ ...p, days: p.days.map((d, j) => j === i ? !d : d) }));
  }

  async function send(text?: string) {
    const msg = text ?? input.trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg: ChatMessage = { role: 'user', content: msg, timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          prefs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, timestamp: Date.now() }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Try again.', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function clearChat() {
    setMessages([]);
    localStorage.removeItem('assistant-messages');
  }

  const selectClass = 'bg-bg border border-edge px-2 py-1.5 text-[11px] text-primary focus:border-accent focus:outline-none';

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <h1 className="page-title">Assistant</h1>
          <p className="page-subtitle">AI coach for networking strategy and message review</p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button onClick={clearChat} className="text-[10px] text-secondary hover:text-primary border border-edge px-2.5 py-1.5 transition-colors cursor-pointer">
              Clear
            </button>
          )}
          <button
            onClick={() => setShowPrefs(!showPrefs)}
            className="flex items-center gap-1 text-[10px] text-secondary hover:text-primary border border-edge px-2.5 py-1.5 transition-colors cursor-pointer"
          >
            {showPrefs ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            Preferences
          </button>
        </div>
      </div>

      {showPrefs && (
        <div className="rounded-lg border border-edge bg-surface p-4 mb-3 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-secondary uppercase tracking-wider">Scheduling Preferences</span>
            <button onClick={savePrefs} className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80 cursor-pointer">
              {prefsSaved ? <><Check size={10} /> Saved</> : <><Save size={10} /> Save</>}
            </button>
          </div>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((label, i) => (
              <button key={label} onClick={() => toggleDay(i)} className={`px-2 py-1 text-[10px] rounded border transition-colors cursor-pointer ${prefs.days[i] ? 'bg-accent/15 border-accent/30 text-accent' : 'bg-bg border-edge text-muted'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted">From</span>
              <select value={prefs.startHour} onChange={e => setPrefs(p => ({ ...p, startHour: +e.target.value }))} className={selectClass}>
                {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted">To</span>
              <select value={prefs.endHour} onChange={e => setPrefs(p => ({ ...p, endHour: +e.target.value }))} className={selectClass}>
                {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted">Length</span>
              <select value={prefs.meetingLength} onChange={e => setPrefs(p => ({ ...p, meetingLength: +e.target.value }))} className={selectClass}>
                {[15, 20, 30, 45, 60].map(m => <option key={m} value={m}>{m}m</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted">Buffer</span>
              <select value={prefs.buffer} onChange={e => setPrefs(p => ({ ...p, buffer: +e.target.value }))} className={selectClass}>
                {[0, 15, 30].map(m => <option key={m} value={m}>{m === 0 ? '0m' : `${m}m`}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Chat thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-lg border border-edge bg-[#0d0d0f] p-4 space-y-4 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center">
              <Bot size={20} className="text-accent" />
            </div>
            <div className="text-center">
              <p className="text-sm text-primary/80 mb-1">Hey Avery, what can I help with?</p>
              <p className="text-[10px] text-muted">Scheduling, meeting prep, follow-ups, or anything CRM-related.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-[11px] text-secondary bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={13} className="text-accent" />
              </div>
            )}
            <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-accent text-white rounded-br-md'
                : 'bg-white/8 text-primary/90 rounded-bl-md border border-white/5'
            }`}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                <User size={13} className="text-white" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={13} className="text-accent" />
            </div>
            <div className="bg-white/8 border border-white/5 px-3.5 py-2.5 rounded-2xl rounded-bl-md">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-3 shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask your assistant..."
            disabled={loading}
            className="flex-1 bg-bg border border-edge px-4 py-3 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none transition-colors disabled:opacity-50"
            autoFocus
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="bg-accent px-4 py-3 text-white hover:bg-accent/90 disabled:opacity-40 transition-colors cursor-pointer"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
