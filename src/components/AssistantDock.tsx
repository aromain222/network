'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Send, Loader2, Bot, User, X, Sparkles, Minimize2 } from 'lucide-react';

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

const SUGGESTIONS = [
  'When am I free next week?',
  'Who should I follow up with?',
  'What meetings are coming up?',
];

export function AssistantDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem('scheduling-prefs');
    if (raw) try { setPrefs(JSON.parse(raw)); } catch {}
    const saved = localStorage.getItem('assistant-messages');
    if (saved) try { setMessages(JSON.parse(saved)); } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        inputRef.current?.focus();
      });
    }
  }, [open, messages.length, loading]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('assistant-messages', JSON.stringify(messages.slice(-50)));
    }
  }, [messages]);

  // Cmd/Ctrl+K to toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function send(text?: string) {
    const msg = text ?? input.trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: msg, timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);
    try {
      let overrides = {};
      try {
        const raw = localStorage.getItem('calendar-overrides');
        if (raw) overrides = JSON.parse(raw);
      } catch {}
      const res = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          prefs,
          overrides,
          currentPage: pathname,
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'Something went wrong.', timestamp: Date.now() }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.', timestamp: Date.now() }]);
    } finally { setLoading(false); }
  }

  function clearChat() {
    setMessages([]);
    localStorage.removeItem('assistant-messages');
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 60,
            width: 52, height: 52, borderRadius: '50%',
            background: '#5B4FE8',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white',
            boxShadow: '0 4px 16px rgba(91, 79, 232, 0.4)',
            transition: 'transform 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.06)'; }}
          onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <Sparkles size={20} />
          <span
            style={{
              position: 'absolute', top: -2, right: -2,
              background: '#1D9E75', color: 'white', fontSize: 9, fontWeight: 600,
              padding: '2px 5px', borderRadius: 999, lineHeight: 1,
            }}
          >EA</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 60,
            width: 400, height: 'min(640px, calc(100vh - 40px))',
            background: '#1a1a1e',
            border: '0.5px solid #2a2a2e',
            borderRadius: 14,
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px',
            borderBottom: '0.5px solid #2a2a2e',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: '#2a2560',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={15} color="#a89ff5" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#e8e8e8' }}>EA Assistant</div>
              <div style={{ fontSize: 10, color: '#777' }}>Scheduling · prep · follow-ups</div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                title="Clear chat"
                style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', fontSize: 10, padding: '4px 8px', borderRadius: 6 }}
                onMouseOver={e => { e.currentTarget.style.color = '#e8e8e8'; }}
                onMouseOut={e => { e.currentTarget.style.color = '#777'; }}
              >
                Clear
              </button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Minimize" style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', display: 'flex' }}>
              <Minimize2 size={14} />
            </button>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', display: 'flex' }}>
              <X size={15} />
            </button>
          </div>

          {/* Thread */}
          <div
            ref={scrollRef}
            style={{
              flex: 1, overflowY: 'auto', padding: 14,
              display: 'flex', flexDirection: 'column', gap: 10,
              background: '#111113',
            }}
          >
            {messages.length === 0 && !loading && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: '#2a2560', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={18} color="#a89ff5" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#e8e8e8', marginBottom: 4 }}>Hey Avery, what's up?</div>
                  <div style={{ fontSize: 10, color: '#777' }}>Ask me anything about your network.</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      style={{
                        background: '#222226', border: '0.5px solid #2a2a2e',
                        color: '#aaa', padding: '8px 12px',
                        borderRadius: 8, fontSize: 11.5, cursor: 'pointer',
                        textAlign: 'left', fontFamily: 'inherit',
                      }}
                      onMouseOver={e => { e.currentTarget.style.background = '#2a2a2e'; e.currentTarget.style.color = '#e8e8e8'; }}
                      onMouseOut={e => { e.currentTarget.style.background = '#222226'; e.currentTarget.style.color = '#aaa'; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#2a2560', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Bot size={11} color="#a89ff5" />
                  </div>
                )}
                <div style={{
                  maxWidth: '78%', padding: '8px 12px', borderRadius: 12,
                  background: m.role === 'user' ? '#5B4FE8' : '#222226',
                  color: m.role === 'user' ? 'white' : '#e8e8e8',
                  fontSize: 12.5, lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  borderBottomLeftRadius: m.role === 'assistant' ? 4 : 12,
                  borderBottomRightRadius: m.role === 'user' ? 4 : 12,
                }}>
                  {m.content}
                </div>
                {m.role === 'user' && (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#5B4FE8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <User size={11} color="white" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#2a2560', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <Bot size={11} color="#a89ff5" />
                </div>
                <div style={{ background: '#222226', padding: '10px 12px', borderRadius: 12, borderBottomLeftRadius: 4 }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[0, 150, 300].map(d => (
                      <span key={d} style={{
                        width: 5, height: 5, borderRadius: '50%', background: '#777',
                        animation: `bounce 1s infinite ${d}ms`,
                      }} />
                    ))}
                  </div>
                  <style jsx>{`
                    @keyframes bounce {
                      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                      30% { transform: translateY(-4px); opacity: 1; }
                    }
                  `}</style>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: 10, borderTop: '0.5px solid #2a2a2e', background: '#1a1a1e' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Ask anything..."
                disabled={loading}
                style={{
                  flex: 1, background: '#111113',
                  border: '0.5px solid #2a2a2e', borderRadius: 8,
                  padding: '8px 12px', fontSize: 12.5, color: '#e8e8e8',
                  outline: 'none', fontFamily: 'inherit',
                }}
                autoFocus
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                style={{
                  background: '#5B4FE8', border: 'none', color: 'white',
                  padding: '0 12px', borderRadius: 8, cursor: input.trim() ? 'pointer' : 'not-allowed',
                  opacity: input.trim() && !loading ? 1 : 0.4,
                  display: 'flex', alignItems: 'center',
                }}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
            <div style={{ fontSize: 9.5, color: '#555', marginTop: 6, textAlign: 'center' }}>
              <kbd style={{ background: '#222226', padding: '1px 4px', borderRadius: 3, fontSize: 9 }}>⌘K</kbd> to toggle anywhere
            </div>
          </div>
        </div>
      )}
    </>
  );
}
