'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Clock, CalendarDays, Building2, PenLine, Settings, ChevronRight, Radar, Sunrise, Inbox, Target } from 'lucide-react';
import { getInitials } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/brief', label: 'Brief', icon: Sunrise },
  { href: '/discovery', label: 'Discovery', icon: Radar },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/follow-ups', label: 'Follow-Ups', icon: Clock, badge: 'followup' as const },
  { href: '/outreach', label: 'Outreach Queue', icon: Inbox, badge: 'outreach' as const },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, badge: 'calendar' as const },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/compose', label: 'Compose', icon: PenLine },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [followUpCount, setFollowUpCount] = useState(0);
  const [calendarCount, setCalendarCount] = useState(0);
  const [outreachCount, setOutreachCount] = useState(0);

  useEffect(() => {
    fetch('/api/contacts')
      .then(r => r.json())
      .then((contacts: { status: string; notes?: string; dateAdded?: string }[]) => {
        setFollowUpCount(contacts.filter(c => c.status === 'followup' || c.status === 'replied').length);
        const thisWeek = contacts.filter(c => c.status === 'scheduled').length;
        setCalendarCount(thisWeek);
      })
      .catch(() => {});
    fetch('/api/outreach?status=pending')
      .then(r => r.ok ? r.json() : [])
      .then((drafts: unknown[]) => setOutreachCount(Array.isArray(drafts) ? drafts.length : 0))
      .catch(() => {});
  }, [pathname]);

  const initials = getInitials('Avery Romain');

  return (
    <aside
      className="fixed left-0 top-0 h-screen flex flex-col z-40"
      style={{
        width: 196,
        background: '#18181b',
        borderRight: '0.5px solid #2a2a2e',
      }}
    >
      {/* Logo */}
      <div className="px-4 py-5" style={{ borderBottom: '0.5px solid #2a2a2e' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center"
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: '#5B4FE8',
              color: 'white', fontSize: 13, fontWeight: 600,
            }}
          >
            N
          </div>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#e8e8e8' }}>Network HQ</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
        {NAV.map(item => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors"
              style={{
                background: active ? '#2a2560' : 'transparent',
                color: active ? '#a89ff5' : '#777777',
                fontSize: 12.5,
                fontWeight: active ? 500 : 400,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#e8e8e8'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#777777'; }}
            >
              <Icon size={15} strokeWidth={1.6} />
              <span className="flex-1">{item.label}</span>
              {item.badge === 'followup' && followUpCount > 0 && (
                <span
                  style={{
                    background: '#5B4FE8', color: 'white',
                    fontSize: 10, padding: '2px 7px', borderRadius: 999,
                    minWidth: 18, textAlign: 'center', lineHeight: 1.3,
                  }}
                >
                  {followUpCount}
                </span>
              )}
              {item.badge === 'calendar' && calendarCount > 0 && (
                <span
                  style={{
                    background: '#1D9E75', color: 'white',
                    fontSize: 10, padding: '2px 7px', borderRadius: 999,
                    minWidth: 18, textAlign: 'center', lineHeight: 1.3,
                  }}
                >
                  {calendarCount}
                </span>
              )}
              {item.badge === 'outreach' && outreachCount > 0 && (
                <span
                  style={{
                    background: '#C8553D', color: 'white',
                    fontSize: 10, padding: '2px 7px', borderRadius: 999,
                    minWidth: 18, textAlign: 'center', lineHeight: 1.3,
                  }}
                >
                  {outreachCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User card */}
      <div className="px-3 py-4" style={{ borderTop: '0.5px solid #2a2a2e' }}>
        <button className="flex items-center gap-2.5 w-full" style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 4, borderRadius: 7 }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#2a2560', color: '#a89ff5',
              fontSize: 11, fontWeight: 500,
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p style={{ fontSize: 12, color: '#e8e8e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Avery Romain</p>
            <p style={{ fontSize: 10, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>averyromain5@gmail.com</p>
          </div>
          <ChevronRight size={12} color="#555" />
        </button>
      </div>
    </aside>
  );
}
