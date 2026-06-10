'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Video, Coffee, MapPin, Calendar, StickyNote, Send, AlertCircle } from 'lucide-react';
import type { Contact } from '@/lib/types';
import { Avatar } from '@/components/Avatar';

type Meeting = {
  contact: Contact;
  date: Date;
  dateLabel: string;
  timeLabel: string;
  platform: 'google-meet' | 'zoom' | 'in-person' | 'tbd';
  location: string;
  daysAway: number;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseMeetings(contacts: Contact[]): Meeting[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const monthMap: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };

  const meetings: Meeting[] = [];
  for (const c of contacts) {
    if (c.status !== 'scheduled') continue;
    if (!c.notes) continue;

    const dateMatch = c.notes.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\b/i);
    if (!dateMatch) continue;
    const month = monthMap[dateMatch[1].toLowerCase()];
    const day = parseInt(dateMatch[2]);
    if (month === undefined || isNaN(day)) continue;

    const year = 2026;
    const date = new Date(year, month, day);
    if (date < now) continue;

    const daysAway = Math.floor((date.getTime() - now.getTime()) / 86400000);
    if (daysAway > 60) continue;

    const timeMatch = c.notes.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:pdt|pt|et|est|pst|ct|cst|mt|mst)?)/i);
    let timeLabel = 'TBD';
    if (timeMatch) timeLabel = timeMatch[1];
    else if (/coffee/i.test(c.notes)) timeLabel = 'Coffee';
    else if (/lunch/i.test(c.notes)) timeLabel = 'Lunch';
    else if (/dinner/i.test(c.notes)) timeLabel = 'Dinner';

    let platform: Meeting['platform'] = 'tbd';
    let location = 'TBD';
    if (/google meet/i.test(c.notes)) { platform = 'google-meet'; location = 'Google Meet'; }
    else if (/zoom/i.test(c.notes)) { platform = 'zoom'; location = 'Zoom'; }
    else if (/coffee|lunch|dinner|in.person/i.test(c.notes)) {
      platform = 'in-person';
      const locMatch = c.notes.match(/(downtown\s*\w*|sf|nyc|bay area|palo alto|menlo park)/i);
      location = locMatch ? locMatch[0] : 'In person';
    }

    const dateLabel = `${DAY_NAMES[date.getDay()]} ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
    meetings.push({ contact: c, date, dateLabel, timeLabel, platform, location, daysAway });
  }
  return meetings.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function PlatformIcon({ platform }: { platform: Meeting['platform'] }) {
  switch (platform) {
    case 'google-meet': return <Video size={11} className="text-green" />;
    case 'zoom': return <Video size={11} className="text-accent" />;
    case 'in-person': return <Coffee size={11} className="text-yellow" />;
    default: return <MapPin size={11} className="text-muted" />;
  }
}

function buildReachOutPlan(m: Meeting): { label: string; tone: 'now' | 'soon' | 'later'; action: string } {
  if (m.daysAway === 0) return { label: 'Today', tone: 'now', action: 'Send a quick "see you soon" confirmation' };
  if (m.daysAway === 1) return { label: 'Tomorrow', tone: 'now', action: 'Confirm time + share any prep links' };
  if (m.daysAway <= 3) return { label: `In ${m.daysAway} days`, tone: 'soon', action: 'Send a friendly reminder 24h before' };
  if (m.daysAway <= 7) return { label: `In ${m.daysAway} days`, tone: 'soon', action: 'Prep talking points this week' };
  return { label: `In ${m.daysAway} days`, tone: 'later', action: 'Add to your radar — no action needed yet' };
}

function countdownColor(daysAway: number): string {
  if (daysAway === 0) return 'text-red bg-red/15';
  if (daysAway === 1) return 'text-orange bg-orange/15';
  if (daysAway <= 3) return 'text-yellow bg-yellow/15';
  if (daysAway <= 7) return 'text-green bg-green/15';
  return 'text-accent bg-accent/15';
}

export function ComingUp({ contacts }: { contacts: Contact[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const meetings = parseMeetings(contacts);

  function scroll(dir: 'left' | 'right') {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -340 : 340, behavior: 'smooth' });
  }

  if (meetings.length === 0) {
    return (
      <div className="rounded-lg border border-edge bg-surface p-5">
        <h2 className="text-xs text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
          <Calendar size={13} className="text-accent" /> Coming Up
        </h2>
        <p className="text-xs text-muted py-4 text-center">No upcoming meetings scheduled. Once you confirm meeting times, they'll show up here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-edge bg-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs text-secondary uppercase tracking-wider flex items-center gap-2">
          <Calendar size={13} className="text-accent" /> Coming Up
          <span className="text-[10px] text-muted normal-case tracking-normal">— {meetings.length} meeting{meetings.length > 1 ? 's' : ''}</span>
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => scroll('left')} className="p-1 text-secondary hover:text-primary transition-colors cursor-pointer rounded hover:bg-elevated">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => scroll('right')} className="p-1 text-secondary hover:text-primary transition-colors cursor-pointer rounded hover:bg-elevated">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-2"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {meetings.map(m => {
          const plan = buildReachOutPlan(m);
          return (
            <div
              key={`${m.contact.id}-${m.date.toISOString()}`}
              className="shrink-0 w-[320px] border border-edge bg-bg rounded-lg p-4 hover:border-accent/30 transition-colors"
              style={{ scrollSnapAlign: 'start' }}
            >
              <div className="flex items-start justify-between mb-3">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${countdownColor(m.daysAway)}`}>
                  {plan.label}
                </span>
                <span className="text-[10px] text-muted">{m.dateLabel}</span>
              </div>

              <div className="flex items-center gap-2.5 mb-3">
                <Avatar name={m.contact.name} size={32} />
                <div className="min-w-0">
                  <p className="text-sm text-primary font-medium truncate">{m.contact.name}</p>
                  {m.contact.company && <p className="text-[11px] text-muted truncate">{m.contact.company}</p>}
                </div>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-secondary mb-3 pb-3 border-b border-edge/60">
                <span className="flex items-center gap-1.5">
                  <PlatformIcon platform={m.platform} /> {m.timeLabel}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin size={11} className="text-muted" /> {m.location}
                </span>
              </div>

              <div className="mb-3">
                <p className="text-[9px] uppercase tracking-wider text-muted mb-1 flex items-center gap-1">
                  <AlertCircle size={9} /> Reach-out plan
                </p>
                <p className="text-[11px] text-primary/85 leading-snug">{plan.action}</p>
              </div>

              {m.contact.notes && (
                <p className="text-[10px] text-muted italic line-clamp-2 mb-3">{m.contact.notes.slice(0, 120)}{m.contact.notes.length > 120 ? '…' : ''}</p>
              )}

              <div className="flex gap-1.5">
                <a
                  href={`/compose?context=${encodeURIComponent(`Send a friendly check-in to ${m.contact.name}${m.contact.company ? ` at ${m.contact.company}` : ''} before our ${m.dateLabel} ${m.timeLabel} meeting`)}`}
                  className="flex-1 flex items-center justify-center gap-1 bg-accent/10 hover:bg-accent/20 text-accent text-[10px] px-2 py-1.5 rounded transition-colors cursor-pointer"
                >
                  <Send size={10} /> Reach out
                </a>
                <a
                  href={`/assistant`}
                  className="flex-1 flex items-center justify-center gap-1 border border-edge hover:border-accent/30 text-secondary hover:text-primary text-[10px] px-2 py-1.5 rounded transition-colors cursor-pointer"
                >
                  <StickyNote size={10} /> Prep
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
