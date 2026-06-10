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
          label: { type: 'string', enum: ['Option A', 'Option B'] },
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

export const REPLY_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string', minLength: 1, maxLength: 700 },
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
  required: ['reply', 'reply_type', 'person'],
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
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}
