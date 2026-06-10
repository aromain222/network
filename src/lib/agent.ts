import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';
import { appendAgentRun, saveDiscovery } from './agent-store';
import {
  createContact,
  findContactByName,
  getAllContacts,
  getMessages,
  updateContact,
} from './db';
import { cleanDraft, getText, wordCount } from './ai-response';
import type {
  AgentDraft,
  AgentKind,
  AgentRun,
  AgentRunSource,
  DiscoveryData,
  DiscoveryPerson,
} from './agent-types';
import type { Contact } from './types';

const MODEL = 'claude-sonnet-4-6';
const APP_URL = process.env.APP_URL || 'http://localhost:3001';
const TARGET_EMAIL = process.env.AGENT_EMAIL || 'averyromain5@gmail.com';
const FROM_EMAIL = process.env.AGENT_FROM_EMAIL || 'Network HQ <onboarding@resend.dev>';

export const AGENT_SYSTEM_PROMPT = `You are a networking agent for Avery Romain, a junior (Class of 2027) at Amherst College studying Political Science. He is Black, plays football at Amherst, and is from the Bay Area (attended Menlo School). He is interning at Murj as an AI Finance Architect this summer.

His interests: Forward Deployed Engineering, Solutions Architecture, Sales Engineering, fintech, AI, and customer-facing product roles.

His target companies: Ramp, Retool, Palantir, Stripe, Anthropic, Cohere, Glean, Databricks, Snowflake, Harvey, Brex, Plaid, Rippling, Scale AI, Modern Treasury, Carta, Bland AI, Decagon, Writer AI, HappyRobot, dbt Labs, Voiceflow, Samsara, Notion, Airtable.

His hooks, strongest to weakest:
1. Amherst College alum
2. Menlo School alum
3. Black professional networks such as BLCK VC, AfroTech, MLT, NSBE, or Black at a company
4. Other NESCAC schools
5. FDE, solutions, or customer-facing role
6. Fintech and AI intersection
7. Founder background
8. Career change or fast promotion

Message rules:
- Keep LinkedIn outreach concise, usually 25-70 words and never over 100 words
- Open with the strongest hook
- Never use em dashes
- Never say "I came across your profile", "pick your brain", "synergize", or "hope this finds you well"
- Sound like a real person, not a marketing email
- End with a low-friction request to connect or have a quick conversation
- Mention no more than one thing about Avery; choose the strongest hook
- Refer to Avery as a junior at Amherst, never as a rising junior or rising senior
- Avoid generic praise such as "inspiring", "impressive", or "stood out" unless tied to one specific supplied fact
- Do not invent personal details that are not in the supplied data`;

type DiscoverySeed = Omit<
  DiscoveryPerson,
  'id' | 'message_a' | 'message_b' | 'status' | 'saved_to_contacts' | 'verified'
>;

type DraftPair = {
  name: string;
  message_a: string;
  message_b: string;
};

type EmailResult = {
  sent: boolean;
  error?: string;
};

type SearchSource = {
  url: string;
  title: string;
  page_age?: string | null;
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof Anthropic.RateLimitError
      || (
        typeof error === 'object'
        && error !== null
        && 'status' in error
        && error.status === 429
      )
    ) {
      throw error;
    }
    await sleep(5000);
    return operation();
  }
}

function anthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey });
}

async function complete(prompt: string, maxTokens: number): Promise<string> {
  const client = anthropicClient();
  return withRetry(async () => {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: AGENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort: 'low' },
    });
    return getText(response);
  });
}

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(cleaned) as T;
}

async function completeJson<T>(prompt: string, maxTokens: number): Promise<T> {
  const first = await complete(prompt, maxTokens);
  try {
    return parseJson<T>(first);
  } catch {
    const corrected = await complete(
      `${prompt}\n\nYour previous response was invalid JSON. Return ONLY valid JSON with no markdown or commentary.`,
      maxTokens,
    );
    return parseJson<T>(corrected);
  }
}

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function daysSince(dateString: string, now = new Date()): number {
  return Math.floor((now.getTime() - new Date(dateString).getTime()) / 86400000);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendDigest(subject: string, html: string, text: string): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not configured' };

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: TARGET_EMAIL,
      subject,
      html,
      text,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'Unknown email error' };
  }
}

function normalizeDiscoverySeed(value: Partial<DiscoverySeed>): DiscoverySeed | null {
  const name = String(value.name || '').trim();
  const company = String(value.company || '').trim();
  const role = String(value.role || '').trim();
  const sourceUrl = String(value.source_url || '').trim();
  const sourceEvidence = String(value.source_evidence || '').trim();
  if (!name || !company || !role || !sourceUrl || !sourceEvidence) return null;
  return {
    name,
    company,
    role,
    why: String(value.why || '').trim(),
    hook: String(value.hook || 'Other').trim(),
    linkedin_search: String(value.linkedin_search || `${name} ${company}`).trim(),
    suggested_opening: cleanDraft(value.suggested_opening),
    source_url: sourceUrl,
    source_title: String(value.source_title || '').trim(),
    source_date: String(value.source_date || '').trim(),
    source_evidence: sourceEvidence,
  };
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function extractSearchSources(response: Anthropic.Message): Map<string, SearchSource> {
  const sources = new Map<string, SearchSource>();
  for (const block of response.content) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (result.type !== 'web_search_result') continue;
      const url = normalizeUrl(result.url);
      if (!url) continue;
      sources.set(url, {
        url: result.url,
        title: result.title,
        page_age: result.page_age,
      });
    }
  }
  return sources;
}

function parseDiscoveryResponse(response: Anthropic.Message): Partial<DiscoverySeed>[] {
  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
  try {
    return parseJson<Partial<DiscoverySeed>[]>(text);
  } catch {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end <= start) throw new Error('Discovery response did not contain valid JSON');
    return parseJson<Partial<DiscoverySeed>[]>(text.slice(start, end + 1));
  }
}

async function discoverPeople(existingNames: string[]): Promise<DiscoverySeed[]> {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const prompt = `Today is ${today}. Use web search to find one real person Avery could contact.

Prioritize target-company customer-facing operators, senior AI or fintech leaders, early-stage founders, recent FDE or solutions hires, and people at YC fintech or AI companies. Only use an Amherst, Menlo, NESCAC, or Black professional-network hook when a search result explicitly supports it.

Do not include these existing contacts: ${existingNames.slice(0, 20).join(', ')}.

Accuracy rules:
- Search the web for every candidate.
- Include a person only when one returned source explicitly confirms their full name, current company, and current role.
- Use the exact URL from that search result as source_url.
- source_evidence must briefly state what the source confirms.
- Never infer education, identity, race, affiliations, or a current job from indirect clues.
- Exclude ambiguous, stale, conflicting, or uncertain results.
- Return one result or an empty array. Never invent a person.
- Do not use phrases such as "likely", "appears to be", "or GTM", or alternative titles.

Return ONLY a valid JSON array:
[
  {
    "name": "Full Name",
    "company": "Company Name",
    "role": "Current exact title supported by the source",
    "why": "One sentence on why they are relevant",
    "hook": "Amherst | Menlo | NESCAC | FDE | Fintech | Black Network | Founder | Senior Leader",
    "linkedin_search": "exact search string",
    "suggested_opening": "First sentence in Avery's voice using only verified facts",
    "source_url": "exact URL returned by web search",
    "source_title": "source page title",
    "source_date": "source page date when available",
    "source_evidence": "short statement of the name, company, and role confirmed by this source"
  }
]`;

  const client = anthropicClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: AGENT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 1,
      user_location: {
        type: 'approximate',
        city: 'San Francisco',
        region: 'California',
        country: 'US',
        timezone: 'America/Los_Angeles',
      },
    }],
  }, {
    timeout: 90000,
    maxRetries: 0,
  });
  const raw = parseDiscoveryResponse(response);
  if (!Array.isArray(raw)) throw new Error('Discovery response was not an array');

  const sources = extractSearchSources(response);
  const deduped = new Map<string, DiscoverySeed>();
  for (const item of raw) {
    const normalized = normalizeDiscoverySeed(item);
    if (!normalized) continue;
    const source = sources.get(normalizeUrl(normalized.source_url || ''));
    if (!source) continue;
    const key = `${normalized.name}|${normalized.company}`.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, {
        ...normalized,
        source_url: source.url,
        source_title: source.title,
        source_date: source.page_age || normalized.source_date,
      });
    }
  }
  const people = [...deduped.values()].slice(0, 1);
  if (people.length === 0) throw new Error('Discovery found no candidates with valid source evidence');
  return people;
}

async function draftBatch(people: DiscoverySeed[]): Promise<DraftPair[]> {
  const prompt = `Draft two concise LinkedIn messages for each person below.

Rules:
- Use only the supplied source-backed facts
- Option A is personalized: open with source_evidence or another concrete supplied detail and ask about that detail
- Option B is generic: focus broadly on the person's current role or field, keep it simple and low pressure, and do not repeat Option A's researched detail
- Make Option A show research without summarizing the person's resume
- Never infer why someone changed roles or invent a project, motivation, customer, or responsibility
- 25-70 words per message
- Make Option A and Option B meaningfully different
- No em dashes
- Mention exactly one Avery detail in each message
- Refer to Avery only as a junior, never as a rising junior or rising senior
- Avoid generic praise such as "inspiring", "impressive", or "stood out"
- Return ONLY a valid JSON array in the same order

People:
${JSON.stringify(people)}

Return:
[
  {
    "name": "Exact input name",
    "message_a": "Option A text only",
    "message_b": "Option B text only"
  }
]`;
  const drafts = await completeJson<Partial<DraftPair>[]>(prompt, 3500);
  if (!Array.isArray(drafts)) throw new Error('Draft response was not an array');
  return drafts.map(draft => ({
    name: String(draft.name || '').trim(),
    message_a: cleanDraft(draft.message_a),
    message_b: cleanDraft(draft.message_b),
  }));
}

function validateMessage(message: string, person: string): string {
  const words = wordCount(message);
  if (!message || words < 15 || words > 85) {
    throw new Error(`Draft for ${person} was outside the required length`);
  }
  return message;
}

function discoveryDigest(discovery: DiscoveryData) {
  const date = new Date(discovery.generated_at).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const rows = discovery.people.map(person => `
    <li style="margin-bottom:16px">
      <strong>${escapeHtml(person.name)}</strong> - ${escapeHtml(person.role)} at ${escapeHtml(person.company)}<br>
      Why today: ${escapeHtml(person.why)}<br>
      Hook: ${escapeHtml(person.hook)}<br>
      Opening: "${escapeHtml(person.suggested_opening)}"
      <br>Source: <a href="${escapeHtml(person.source_url || '')}">${escapeHtml(person.source_title || person.source_url || '')}</a>
    </li>`).join('');
  const textRows = discovery.people.map((person, index) =>
    `${index + 1}. ${person.name} - ${person.role} at ${person.company}\nWhy today: ${person.why}\nHook: ${person.hook}\nOpening: "${person.suggested_opening}"\nSource: ${person.source_url}`,
  ).join('\n\n');
  return {
    subject: `${discovery.people.length} verified networking leads for ${date} - Network HQ`,
    html: `<p>Here are today's source-backed networking leads:</p><ol>${rows}</ol><p><a href="${APP_URL}/discovery">Open Network HQ to review drafts</a></p>`,
    text: `Here are today's source-backed networking leads:\n\n${textRows}\n\nOpen Network HQ: ${APP_URL}/discovery`,
  };
}

function createRun(
  kind: AgentKind,
  source: AgentRunSource,
  startedAt: string,
  stats: Record<string, number>,
  email: EmailResult,
  error?: string,
  drafts?: AgentDraft[],
): AgentRun {
  return {
    id: crypto.randomUUID(),
    kind,
    source,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    success: !error,
    stats,
    email_sent: email.sent,
    drafts,
    email_error: email.error,
    error,
  };
}

export async function runDiscovery(source: AgentRunSource): Promise<{
  discovery?: DiscoveryData;
  run: AgentRun;
}> {
  const startedAt = new Date().toISOString();
  try {
    const existingNames = getAllContacts().map(contact => contact.name);
    const seeds = await withRetry(() => discoverPeople(existingNames));
    const batches: DiscoverySeed[][] = [];
    for (let index = 0; index < seeds.length; index += 5) {
      batches.push(seeds.slice(index, index + 5));
    }
    const batchResults = await Promise.all(
      batches.map(batch => withRetry(() => draftBatch(batch))),
    );
    const draftsByName = new Map(batchResults.flat().map(draft => [draft.name.toLowerCase(), draft]));
    const people: DiscoveryPerson[] = seeds.map(seed => {
      const draft = draftsByName.get(seed.name.toLowerCase());
      if (!draft) throw new Error(`No drafts returned for ${seed.name}`);
      return {
        ...seed,
        id: crypto.randomUUID(),
        message_a: validateMessage(draft.message_a, seed.name),
        message_b: validateMessage(draft.message_b, seed.name),
        status: 'pending',
        saved_to_contacts: false,
        verified: true,
      };
    });
    const discovery: DiscoveryData = {
      date: isoDate(),
      generated_at: new Date().toISOString(),
      people,
      stats: { total: people.length, approved: 0, skipped: 0, saved: 0 },
    };
    const digest = discoveryDigest(discovery);
    const email = await sendDigest(digest.subject, digest.html, digest.text);
    if (email.error) discovery.email_error = email.error;
    saveDiscovery(discovery);
    const run = createRun('discovery', source, startedAt, {
      total: people.length,
      drafted: people.length,
    }, email);
    appendAgentRun(run);
    return { discovery, run };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown discovery error';
    const run = createRun('discovery', source, startedAt, {}, { sent: false }, message);
    appendAgentRun(run);
    return { run };
  }
}

export function getFollowupCandidates(now = new Date()): { contact: Contact; days: number }[] {
  return getAllContacts().flatMap(contact => {
    if (contact.status !== 'sent' || contact.followup_date) return [];
    const days = daysSince(contact.dateAdded, now);
    if (days <= 7) return [];
    const initialTime = new Date(contact.dateAdded).getTime();
    const hasLoggedFollowup = getMessages(contact.id).some(message =>
      message.direction === 'outgoing'
      && new Date(message.timestamp).getTime() > initialTime + 86400000,
    );
    return hasLoggedFollowup ? [] : [{ contact, days }];
  });
}

export function getReengagementCandidates(now = new Date()): { contact: Contact; days: number }[] {
  return getAllContacts().flatMap(contact => {
    if (contact.status !== 'completed') return [];
    const baseDate = contact.met_date || contact.dateAdded;
    const days = daysSince(baseDate, now);
    if (days <= 60) return [];
    if (contact.last_touch_date && contact.last_touch_date > baseDate) return [];
    const baseTime = new Date(baseDate).getTime();
    const hasReengaged = getMessages(contact.id).some(message =>
      message.direction === 'outgoing'
      && new Date(message.timestamp).getTime() > baseTime + 86400000,
    );
    return hasReengaged ? [] : [{ contact, days }];
  });
}

async function draftFollowups(
  candidates: { contact: Contact; days: number }[],
  mode: 'followup' | 'reengage',
): Promise<AgentDraft[]> {
  if (candidates.length === 0) return [];
  const instructions = mode === 'followup'
    ? 'Write one casual, no-pressure follow-up under 50 words. Do not add a subject line.'
    : 'Write one warm, casual check-in under 60 words. Do not add a subject line.';
  const input = candidates.map(({ contact, days }) => ({
    contact_id: contact.id,
    name: contact.name,
    company: contact.company,
    role: contact.role,
    days_since: days,
    hook: contact.hook,
    notes: contact.notes,
  }));
  const prompt = `${instructions}
No em dashes. Use only supplied facts. Return ONLY valid JSON:
[
  {
    "contact_id": "exact input id",
    "draft": "message text"
  }
]

Contacts:
${JSON.stringify(input)}`;
  const raw = await completeJson<{ contact_id?: string; draft?: string }[]>(prompt, Math.max(1500, candidates.length * 150));
  const byId = new Map(raw.map(item => [String(item.contact_id || ''), cleanDraft(item.draft)]));
  return candidates.map(({ contact, days }) => {
    const draft = byId.get(contact.id) || '';
    const maxWords = mode === 'followup' ? 55 : 65;
    if (!draft || wordCount(draft) > maxWords) {
      throw new Error(`Invalid ${mode} draft for ${contact.name}`);
    }
    return {
      contact_id: contact.id,
      name: contact.name,
      company: contact.company,
      role: contact.role,
      days_since: days,
      draft,
      notes: contact.notes,
    };
  });
}

function followupDigest(drafts: AgentDraft[], mode: 'followup' | 'reengage') {
  const isFollowup = mode === 'followup';
  const subject = isFollowup
    ? `${drafts.length} ${drafts.length === 1 ? 'person has' : 'people have'} not responded - follow-up drafts ready`
    : `${drafts.length} ${drafts.length === 1 ? 'person' : 'people'} to reconnect with this week`;
  const rows = drafts.map(draft => `
    <li style="margin-bottom:16px">
      <strong>${escapeHtml(draft.name)}</strong> at ${escapeHtml(draft.company)} - ${draft.days_since} days ago<br>
      ${!isFollowup && draft.notes ? `Notes: ${escapeHtml(draft.notes)}<br>` : ''}
      Draft: "${escapeHtml(draft.draft)}"
    </li>`).join('');
  const textRows = drafts.map((draft, index) =>
    `${index + 1}. ${draft.name} at ${draft.company} - ${draft.days_since} days ago\n${!isFollowup && draft.notes ? `Notes: ${draft.notes}\n` : ''}Draft: "${draft.draft}"`,
  ).join('\n\n');
  return {
    subject,
    html: `<p>${isFollowup ? 'These contacts have not responded in 7+ days:' : 'These contacts are due for a check-in:'}</p><ol>${rows}</ol><p><a href="${APP_URL}/follow-ups">Open Network HQ to review</a></p>`,
    text: `${isFollowup ? 'These contacts have not responded in 7+ days:' : 'These contacts are due for a check-in:'}\n\n${textRows}\n\nOpen Network HQ: ${APP_URL}/follow-ups`,
  };
}

async function runContactAgent(
  kind: 'followup' | 'reengage',
  source: AgentRunSource,
): Promise<{ drafts?: AgentDraft[]; run: AgentRun }> {
  const startedAt = new Date().toISOString();
  try {
    const candidates = kind === 'followup' ? getFollowupCandidates() : getReengagementCandidates();
    const drafts = await draftFollowups(candidates, kind);
    const digest = followupDigest(drafts, kind);
    const email = drafts.length > 0
      ? await sendDigest(digest.subject, digest.html, digest.text)
      : { sent: false, error: 'No eligible contacts; digest not sent' };
    const run = createRun(kind, source, startedAt, {
      eligible: candidates.length,
      drafted: drafts.length,
    }, email, undefined, drafts);
    appendAgentRun(run);
    return { drafts, run };
  } catch (error) {
    const message = error instanceof Error ? error.message : `Unknown ${kind} error`;
    const run = createRun(kind, source, startedAt, {}, { sent: false }, message);
    appendAgentRun(run);
    return { run };
  }
}

export function runFollowups(source: AgentRunSource) {
  return runContactAgent('followup', source);
}

export function runReengagements(source: AgentRunSource) {
  return runContactAgent('reengage', source);
}

export function saveDiscoveryPerson(person: DiscoveryPerson): Contact {
  if (!person.verified || !person.source_url) {
    throw new Error('A verified source is required before saving this person');
  }
  const existing = findContactByName(person.name);
  const data: Omit<Contact, 'id'> = {
    name: person.name,
    company: person.company,
    role: person.role,
    status: 'sent',
    tags: ['Agent discovery'],
    hook: person.hook,
    notes: `${person.why}\nVerified source: ${person.source_url}${person.source_evidence ? `\nEvidence: ${person.source_evidence}` : ''}`,
    dateAdded: isoDate(),
    message_sent: person.message_a,
    linkedin_url: '',
    last_touch_date: isoDate(),
  };
  if (existing) {
    return updateContact(existing.id, {
      ...data,
      status: existing.status === 'draft' ? 'sent' : existing.status,
    }) || existing;
  }
  return createContact(data);
}

export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
