import Anthropic from '@anthropic-ai/sdk';

export const OUTREACH_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    options: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: {
            type: 'string',
            enum: [
              'Type 1 — Personalized',
              'Type 2 — Hook-only',
              'Type 3 — Curiosity',
              'Type 4 — Direct ask',
            ],
          },
          message: { type: 'string', minLength: 1, maxLength: 700 },
        },
        required: ['label', 'message'],
      },
    },
    hook_used: { type: 'string' },
    person: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        company: { type: 'string' },
        role: { type: 'string' },
      },
      required: ['name', 'company', 'role'],
    },
    reasoning: { type: 'string', maxLength: 180 },
  },
  required: ['options', 'hook_used', 'person', 'reasoning'],
} as const;

export const PROFILE_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    person: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        company: { type: 'string' },
        role: { type: 'string' },
      },
      required: ['name', 'company', 'role'],
    },
    strongest_connection: { type: 'string' },
    connection_evidence: { type: 'string' },
    avery_background: { type: 'string' },
    option_a_detail: { type: 'string' },
    option_b_detail: { type: 'string' },
    tone: { type: 'string' },
  },
  required: [
    'person',
    'strongest_connection',
    'connection_evidence',
    'avery_background',
    'option_a_detail',
    'option_b_detail',
    'tone',
  ],
} as const;

export const REPLY_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string', minLength: 1, maxLength: 700 },
    subject: { type: 'string', maxLength: 90 },
    email_to: { type: 'string', maxLength: 160 },
    reply_type: {
      type: 'string',
      enum: ['follow-up email', 'availability', 'thank you', 'gracious decline', 'casual'],
    },
    person: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        company: { type: 'string' },
        role: { type: 'string' },
      },
      required: ['name', 'company', 'role'],
    },
  },
  required: ['reply', 'subject', 'email_to', 'reply_type', 'person'],
} as const;

export const MEETING_NOTES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 2200 },
    action_items: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string', minLength: 1, maxLength: 220 },
    },
    decisions: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 220 },
    },
    follow_up_draft: { type: 'string', minLength: 1, maxLength: 1200 },
    relationship_notes: { type: 'string', maxLength: 900 },
  },
  required: ['summary', 'action_items', 'decisions', 'follow_up_draft', 'relationship_notes'],
} as const;

export function getText(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');
}

export function cleanDraft(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\u2014/g, ',')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}
