import type { ContactStatus } from './types';

export const STATUS_CONFIG: Record<ContactStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:       { label: 'Draft',       color: '#666666', bg: 'bg-[#666]/15', border: 'border-l-[#666]' },
  sent:        { label: 'Sent',        color: '#4f8ef7', bg: 'bg-[#4f8ef7]/15', border: 'border-l-[#4f8ef7]' },
  replied:     { label: 'Replied',     color: '#22c55e', bg: 'bg-[#22c55e]/15', border: 'border-l-[#22c55e]' },
  scheduled:   { label: 'Scheduled',   color: '#22c55e', bg: 'bg-[#22c55e]/15', border: 'border-l-[#22c55e]' },
  completed:   { label: 'Completed',   color: '#a855f7', bg: 'bg-[#a855f7]/15', border: 'border-l-[#a855f7]' },
  followup:    { label: 'Follow Up',   color: '#eab308', bg: 'bg-[#eab308]/15', border: 'border-l-[#eab308]' },
  no_response: { label: 'No Response', color: '#ef4444', bg: 'bg-[#ef4444]/15', border: 'border-l-[#ef4444]' },
};
