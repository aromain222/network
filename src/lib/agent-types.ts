export type AgentKind = 'discovery' | 'followup' | 'reengage';
export type AgentRunSource = 'cron' | 'manual';
export type DiscoveryStatus = 'pending' | 'skipped' | 'saved';
export type DiscoveryCategory =
  | 'Senior Executive'
  | 'Amherst Alum'
  | 'Menlo Alum'
  | 'Similar Trajectory'
  | 'Black Network'
  | 'Target Company'
  | 'VC/PE'
  | 'NESCAC'
  | 'Other';

export const DISCOVERY_CATEGORIES: DiscoveryCategory[] = [
  'Senior Executive',
  'Amherst Alum',
  'Menlo Alum',
  'Similar Trajectory',
  'Black Network',
  'Target Company',
  'VC/PE',
  'NESCAC',
];

export type DiscoveryPerson = {
  id: string;
  name: string;
  company: string;
  role: string;
  why: string;
  hook: string;
  category?: DiscoveryCategory;
  interesting_score?: number;
  conversation_angle?: string;
  novelty_reason?: string;
  linkedin_search: string;
  suggested_opening: string;
  source_url?: string;
  source_title?: string;
  source_date?: string;
  source_evidence?: string;
  message_a: string;
  message_b: string;
  status: DiscoveryStatus;
  saved_to_contacts: boolean;
  verified: boolean;
};

export type DiscoveryData = {
  date: string;
  generated_at: string;
  people: DiscoveryPerson[];
  stats: {
    total: number;
    approved: number;
    skipped: number;
    saved: number;
  };
  email_error?: string;
};

export type AgentDraft = {
  contact_id: string;
  name: string;
  company: string;
  role: string;
  days_since: number;
  draft: string;
  notes?: string;
};

export type AgentRun = {
  id: string;
  kind: AgentKind;
  source: AgentRunSource;
  started_at: string;
  completed_at: string;
  success: boolean;
  stats: Record<string, number>;
  email_sent: boolean;
  drafts?: AgentDraft[];
  email_error?: string;
  error?: string;
};

export type AgentLog = {
  runs: AgentRun[];
};

export type AgentStatus = {
  discovery: DiscoveryData | null;
  last_runs: Partial<Record<AgentKind, AgentRun>>;
  followups_due: number;
  reengagements_due: number;
  email_configured: boolean;
  legacy_discovery_contacts: number;
  persistence_warning?: string;
};
