export type ContactStatus = 'draft' | 'sent' | 'replied' | 'scheduled' | 'completed' | 'followup' | 'no_response';

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
};
