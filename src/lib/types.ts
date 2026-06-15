export type ContactStatus = 'draft' | 'sent' | 'replied' | 'scheduled' | 'completed' | 'followup' | 'no_response';
export type Warmth = 'warm' | 'cold' | 'second_degree';
export type Tier = 1 | 2 | 3;

export type Contact = {
  id: string;
  name: string;
  company: string;
  role: string;
  status: ContactStatus;
  tags: string[];
  hook: string;
  notes: string;
  dateAdded: string;
  message_sent: string;
  linkedin_url: string;
  followup_date?: string;
  last_touch_date?: string;
  met_date?: string;
  phone?: string;
  email?: string;
  tier?: Tier;
  warmth?: Warmth;
  relevance_score?: number;
  shared_background?: string;
  source?: string;
};

export type Goal = {
  id: number;
  label: string;
  weight: number;
  active: 0 | 1;
};

export type OutreachDraft = {
  id: number;
  contact_id: string;
  channel: 'email' | 'linkedin' | 'x';
  subject: string | null;
  body: string;
  angle: string | null;
  ask: string | null;
  status: 'pending' | 'approved' | 'sent' | 'rejected';
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
};

export type Opportunity = {
  id: number;
  kind: 'internship' | 'fulltime' | 'project' | 'intro';
  title: string;
  company: string | null;
  url: string | null;
  source: string | null;
  relevance_score: number;
  discovered_at: string;
  status: 'open' | 'applied' | 'closed';
};

export type PipelineMetrics = {
  day: string;
  prospects_discovered: number;
  outreach_sent: number;
  replies_received: number;
  meetings_scheduled: number;
  meetings_completed: number;
  referrals_received: number;
  opportunities_generated: number;
};

export type CareerBrief = {
  day: string;
  meetings: Array<{ time: string; with: string; topic: string }>;
  follow_ups: Contact[];
  health_alerts: Array<{ contact: Contact; days_since: number; suggested_message: string }>;
  internships: Opportunity[];
  fulltime: Opportunity[];
  recommended: Array<Contact & { reason: string; angle: string }>;
};

export type MessageDirection = 'outgoing' | 'incoming';
export type MessageChannel = 'linkedin' | 'email' | 'sms' | 'imessage' | 'phone' | 'in-person' | 'other';

export type Message = {
  id: string;
  contact_id: string;
  direction: MessageDirection;
  channel: MessageChannel;
  body: string;
  timestamp: string; // ISO
  meta?: string; // JSON string for extra fields (subject, attachments, etc.)
};

export type GenerateResponse = {
  options: { label: string; message: string }[];
  hook_used: string;
  person: { name: string; company: string; role: string };
  reasoning: string;
};

export type ReplyResponse = {
  reply: string;
  reply_type: string;
  person: { name: string; company: string; role: string };
  available_slots?: { date: string; day: string; time: string }[];
  calendar_checked?: boolean;
  calendar_connected?: boolean;
};
