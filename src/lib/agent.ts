import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';
import { appendAgentRun, getDiscovery, saveDiscovery } from './agent-store';
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
  DiscoveryCategory,
  DiscoveryData,
  DiscoveryPerson,
} from './agent-types';
import type { Contact } from './types';

const MODEL = 'claude-sonnet-4-6';
const DISCOVERY_MODEL = process.env.AGENT_DISCOVERY_MODEL || 'claude-haiku-4-5';
const DISCOVERY_EXTRACTION_MODEL = process.env.AGENT_DISCOVERY_EXTRACTION_MODEL || MODEL;
const APP_URL = process.env.APP_URL || 'http://localhost:3001';
const TARGET_EMAIL = process.env.AGENT_EMAIL || 'averyromain5@gmail.com';
const FROM_EMAIL = process.env.AGENT_FROM_EMAIL || 'Network HQ <onboarding@resend.dev>';
const DAILY_DISCOVERY_TARGET = 25;

export const AGENT_SYSTEM_PROMPT = `You are a networking agent for Avery Romain, a junior (Class of 2027) at Amherst College studying Political Science. He is Black, plays football at Amherst, and is from the Bay Area (attended Menlo School). He is interning at Murj as an AI Finance Architect this summer.

His interests: Forward Deployed Engineering, Solutions Architecture, Sales Engineering, fintech, AI, and customer-facing product roles.

Relevant background from Avery's resume:
- Founder and lead developer of CapitalBase, an AI hedge fund research platform
- Built multi-agent investment research, AI analyst chat, and live market-data workflows
- Experience in private equity at Caprae Capital, fintech at Weel and SoFi, and private wealth management at Robertson Stephens
- NCAA football student-athlete at Amherst
- Leads Black alumni business outreach for the Amherst Black Business Club
- Studies Political Science and Black Studies

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
- Introduce the sender naturally with his name and exactly one relevant background detail
- For AI builders, engineers, FDEs, founders, or product leaders, prefer "I'm Avery, founder of an AI investing platform"
- For fintech or investing contacts, prefer "I'm Avery, a junior at Amherst with experience across fintech and investing"
- For Amherst contacts, prefer "I'm Avery, a junior at Amherst"
- Use Menlo, football, Black alumni outreach, or Murj only when directly relevant
- Never combine more than one Avery background description
- Introduce Avery exactly once, in the first sentence
- Open with the strongest hook
- Never use em dashes
- Never say "I came across your profile", "pick your brain", "synergize", or "hope this finds you well"
- Sound like a real person, not a marketing email
- End with a low-friction request to connect or have a quick conversation
- Mention no more than one thing about Avery; choose the strongest hook
- Refer to Avery as a junior at Amherst, never as a rising junior or rising senior
- Avoid generic praise such as "inspiring", "impressive", or "stood out" unless tied to one specific supplied fact
- Do not invent personal details that are not in the supplied data

Background-agent quality bar:
- Every draft must have one obvious reason it is being sent today.
- Prefer a concrete question over a generic "would love to connect".
- Do not write "checking in", "touching base", "following up on my note", or "wanted to circle back" unless the user explicitly asked for that phrasing.
- If there is no real new hook, write a simple low-pressure bump instead of pretending there is new context.
- For re-engagement, reference the last known conversation or notes if supplied. If notes are thin, ask one small update-oriented question.
- If the draft could be sent unchanged to 50 people, rewrite it.`;

type DiscoverySeed = Omit<
  DiscoveryPerson,
  'id' | 'message_a' | 'message_b' | 'status' | 'saved_to_contacts' | 'verified'
>;

type DraftPair = {
  name: string;
  message_a: string;
  message_b: string;
};

type DiscoveryCandidate = {
  seed: DiscoverySeed;
  draft: DraftPair;
};

type DiscoveryLeadResponse = Partial<DiscoverySeed> | Partial<DiscoverySeed>[] | null;

type DiscoverySearchResult = {
  company: string;
  leads: DiscoverySeed[];
  model_candidates: number;
  search_sources: number;
};

type DiscoveryTarget = {
  company: string;
  role: string;
  category: DiscoveryCategory;
  hook?: string;
  thesis?: string;
  priority?: number;
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

async function withDiscoveryRateRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const rateLimited = error instanceof Anthropic.RateLimitError
        || (
          typeof error === 'object'
          && error !== null
          && 'status' in error
          && error.status === 429
        );
      if (!rateLimited || attempt === 2) throw error;
      await sleep(20000 * (attempt + 1));
    }
  }
  throw new Error('Discovery retry exhausted');
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
    if (error) {
      const testRecipient = error.message.match(/own email address \(([^)]+)\)/i)?.[1];
      if (testRecipient && testRecipient.toLowerCase() !== TARGET_EMAIL.toLowerCase()) {
        const retry = await resend.emails.send({
          from: FROM_EMAIL,
          to: testRecipient,
          subject,
          html,
          text,
        });
        if (!retry.error) return { sent: true };
        return { sent: false, error: retry.error.message };
      }
      return { sent: false, error: error.message };
    }
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
  if (!name || !company || !role || !sourceEvidence) return null;
  return {
    name,
    company,
    role,
    why: String(value.why || '').trim(),
    hook: String(value.hook || 'Other').trim(),
    category: value.category,
    interesting_score: clampScore(value.interesting_score),
    conversation_angle: String(value.conversation_angle || '').trim(),
    novelty_reason: String(value.novelty_reason || '').trim(),
    linkedin_search: String(value.linkedin_search || `${name} ${company}`).trim(),
    suggested_opening: cleanDraft(value.suggested_opening),
    source_url: sourceUrl,
    source_title: String(value.source_title || '').trim(),
    source_date: String(value.source_date || '').trim(),
    source_evidence: sourceEvidence,
  };
}

function clampScore(value: unknown): number | undefined {
  const score = Number(value);
  if (!Number.isFinite(score)) return undefined;
  return Math.max(1, Math.min(100, Math.round(score)));
}

function scoreDiscoverySeed(seed: DiscoverySeed): number {
  let score = seed.interesting_score ?? 50;
  const haystack = `${seed.company} ${seed.role} ${seed.hook} ${seed.why} ${seed.source_evidence} ${seed.conversation_angle} ${seed.novelty_reason}`.toLowerCase();

  if (/\b(founder|co-founder|chief|cto|cpo|head of|first\s+(?:solutions|sales|gtm|product)|founding)\b/.test(haystack)) score += 12;
  if (/\b(forward[- ]?deployed|fde|solutions engineer|solutions architect|customer engineer|sales engineer|developer relations|devrel|implementation)\b/.test(haystack)) score += 10;
  if (/\b(ai agents?|llm|generative ai|voice ai|vertical ai|workflow automation|data infra|fintech infrastructure|payments?|risk|fraud|capital markets|healthcare ai)\b/.test(haystack)) score += 8;
  if (/\b(amherst|menlo|football|student-athlete|black|afrotech|blck vc|mlt|nsbe|nescac)\b/.test(haystack)) score += 10;
  if (/\b(spoke|speaker|podcast|authored|wrote|published|launched|built|scaled|led|operator)\b/.test(haystack)) score += 8;

  if (/\b(analyst|associate|recruiter|talent acquisition|human resources|generic|unknown)\b/.test(haystack)) score -= 12;
  if (!seed.conversation_angle && !seed.novelty_reason) score -= 8;
  if (!seed.source_evidence || seed.source_evidence.length < 50) score -= 5;

  return Math.max(1, Math.min(100, Math.round(score)));
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

function getResponseText(response: Anthropic.Message): string {
  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
}

function parseDiscoveryResponse(response: Anthropic.Message): DiscoveryLeadResponse {
  const text = getResponseText(response);
  try {
    return parseJson<DiscoveryLeadResponse>(text);
  } catch {
    const arrayStart = text.indexOf('[');
    const arrayEnd = text.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      return parseJson<Partial<DiscoverySeed>[]>(text.slice(arrayStart, arrayEnd + 1));
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    return parseJson<Partial<DiscoverySeed>>(text.slice(start, end + 1));
  }
}

async function searchVerifiedLeads(
  targetCompany: string,
  targetRole: string,
  existingNames: string[],
  targetCategory?: DiscoveryCategory,
  targetThesis?: string,
): Promise<DiscoverySearchResult> {
  const searchQuery = `site:linkedin.com/in "${targetCompany}" "${targetRole}"`;
  const researchPrompt = `Run exactly ONE web search using this people-specific query:
${searchQuery}

Do not search for general company information or open jobs. From the results, identify up to THREE named people currently working at ${targetCompany} as a ${targetRole} or a clearly equivalent title.

Target thesis for why this search is interesting:
${targetThesis || 'Find people with a sharp operating, technical, investing, alumni, or identity-based angle Avery could ask about.'}

Use company pages, conference speaker bios, podcast guest pages, authored articles, and public professional profiles. Include only results that explicitly state both the person's current title and ${targetCompany}. Prefer people with a distinctive conversation angle: founder/operator, first GTM or solutions hire, AI/fintech infrastructure builder, FDE/solutions leader, Amherst/Menlo/NESCAC/Black-network connection, student-athlete path, public writing/speaking, unusual career transition, or senior person at a non-obvious company. Do not infer or guess. Do not select any of these people: ${existingNames.slice(0, 60).join(', ') || 'none'}.

Write concise research notes for every supported person you find. For each person state their full name, exact current title, company, the evidence, the source, and why Avery would have a real conversation with them. If you find at least one supported person, you must report them. Do not return JSON yet.`;
  const client = anthropicClient();
  const researchResponse = await withDiscoveryRateRetry(() => client.messages.create({
    model: DISCOVERY_MODEL,
    max_tokens: 700,
    messages: [{ role: 'user', content: researchPrompt }],
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
  }));
  const sources = extractSearchSources(researchResponse);
  const researchNotes = getResponseText(researchResponse);
  const sourceList = [...sources.values()].map(source => ({
    url: source.url,
    title: source.title,
    date: source.page_age,
  }));
  const extractionPrompt = `Convert the research notes into a verified JSON array.

Target company: ${targetCompany}
Research notes:
${researchNotes}

Allowed sources:
${JSON.stringify(sourceList)}

Include up to three people only when the notes explicitly support their full name, current title, and current company. source_url must exactly match one URL in Allowed sources. Do not add facts or people.

Return only this JSON shape:
[
  {
    "name": "Full Name",
    "company": "${targetCompany}",
    "role": "Exact current title stated by the source",
    "why": "Why this person is worth Avery's time, not just why the role is relevant",
    "hook": "FDE or Fintech",
    "interesting_score": 1-100,
    "conversation_angle": "The specific question Avery should ask this person",
    "novelty_reason": "What makes this person non-obvious or unusually valuable",
    "linkedin_search": "Full Name ${targetCompany}",
    "suggested_opening": "A short opening using only the verified role",
    "source_url": "Exact result URL",
    "source_title": "Exact result title",
    "source_date": "Date if available",
    "source_evidence": "A concise statement of exactly what the source confirms"
  }
]

Scoring guide:
- 90-100: unusually strong, e.g. direct Amherst/Menlo/Black network plus AI/fintech/operator angle, founder/operator at a relevant company, or senior person with a concrete public angle.
- 75-89: clearly useful conversation with a specific role question.
- 60-74: relevant but common.
- Below 60: generic title, unclear conversation angle, or weak evidence.

Return [] only if the research notes contain no supported person.`;
  const extractionResponse = await withDiscoveryRateRetry(() => client.messages.create({
    model: DISCOVERY_EXTRACTION_MODEL,
    max_tokens: 1000,
    messages: [{ role: 'user', content: extractionPrompt }],
    output_config: { effort: 'low' },
  }, {
    timeout: 60000,
    maxRetries: 0,
  }));
  const raw = parseDiscoveryResponse(extractionResponse);
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const onlySource = sources.size === 1 ? [...sources.values()][0] : undefined;
  const verified = new Map<string, DiscoverySeed>();
  for (const item of items) {
    const normalized = normalizeDiscoverySeed(item);
    if (!normalized) continue;
    const requestedUrl = normalizeUrl(normalized.source_url || '');
    const source = sources.get(requestedUrl) || onlySource;
    if (!source) continue;
    if (normalized.company.toLowerCase() !== targetCompany.toLowerCase()) continue;
    if (existingNames.some(name => name.toLowerCase() === normalized.name.toLowerCase())) continue;
    const key = normalized.name.toLowerCase();
    if (verified.has(key)) continue;
    verified.set(key, {
      ...normalized,
      source_url: source.url,
      source_title: source.title,
      source_date: source.page_age || normalized.source_date,
      category: targetCategory ?? normalized.category,
    });
  }
  return {
    company: targetCompany,
    leads: [...verified.values()].slice(0, 3),
    model_candidates: items.length,
    search_sources: sources.size,
  };
}

function fallbackDiscoveryDraft(seed: DiscoverySeed): DraftPair {
  const firstName = seed.name.split(/\s+/)[0];
  const roleQuestion = /solutions|forward|deployed|sales engineer|customer/i.test(seed.role)
    ? 'how much of the role is technical problem-solving versus working directly with customers'
    : /invest|venture|capital|partner|principal|private equity/i.test(seed.role)
      ? 'how you evaluate AI or fintech companies from your seat'
      : 'what the work actually looks like up close';
  return {
    name: seed.name,
    message_a: `Hey ${firstName}, I'm Avery, a junior at Amherst exploring customer-facing AI and fintech roles. I saw you're a ${seed.role} at ${seed.company}, and I'm curious ${roleQuestion}. Would you be open to a quick chat?`,
    message_b: `Hey ${firstName}, I'm Avery, a junior at Amherst. I'm trying to learn from people doing ${seed.role.toLowerCase()} work at companies like ${seed.company}. Would you be open to connecting?`,
  };
}

async function draftDiscoveryMessages(seeds: DiscoverySeed[]): Promise<DraftPair[]> {
  const prompt = `Write two concise LinkedIn messages from Avery Romain to each verified person below.

Verified people:
${JSON.stringify(seeds)}

Avery is a junior at Amherst who built an AI investing platform and is interested in customer-facing AI and fintech roles.

Rules:
- message_a is 30-65 words, personalized around one concrete fact in source_evidence, and asks a natural question that follows from that fact.
- message_b is 25-55 words, lightly personalized around their role and company. It should still sound human, not generic.
- Both messages must introduce him exactly once using the words "I'm Avery" plus one relevant background detail.
- No em dashes, resume recaps, generic praise such as "impressive" or "I'm impressed", or invented facts.
- Avoid "your background caught my eye", "your work stood out", "pick your brain", "touch base", "circle back", and "hope you're well".
- Do not mention source_evidence unless it gives a specific product, responsibility, title, event, or career move.
- End with a low-friction request to connect or chat.

Return only a JSON array with one object per input:
[{"name":"Exact input name","message_a":"...","message_b":"..."}]`;
  const client = anthropicClient();
  const response = await withRetry(() => client.messages.create({
    model: DISCOVERY_MODEL,
    max_tokens: Math.max(700, seeds.length * 300),
    messages: [{ role: 'user', content: prompt }],
  }, {
    timeout: 60000,
    maxRetries: 0,
  }));
  let raw: Partial<DraftPair>[] = [];
  try {
    raw = parseJson<Partial<DraftPair>[]>(getResponseText(response));
  } catch {
    raw = [];
  }
  const byName = new Map(raw.map(item => [String(item.name || '').toLowerCase(), item]));
  return seeds.map(seed => {
    const generated = byName.get(seed.name.toLowerCase());
    const fallback = fallbackDiscoveryDraft(seed);
    const messageA = cleanDraft(generated?.message_a);
    const messageB = cleanDraft(generated?.message_b);
    return {
      name: seed.name,
      message_a: isValidMessage(messageA) ? messageA : fallback.message_a,
      message_b: isValidMessage(messageB) ? messageB : fallback.message_b,
    };
  });
}

async function planDiscoveryTargets(
  existingNames: string[],
  recentTargets: Array<{ company: string; role: string }>,
  desiredCount: number,
): Promise<DiscoveryTarget[]> {
  const recentList = recentTargets.map(t => `${t.company} (${t.role})`).slice(0, 40).join('; ');
  const existingCompanies = Array.from(new Set(existingNames.slice(0, 80))).join(', ');
  const seed = `${new Date().toISOString().slice(0, 10)} run-${recentTargets.length}`;

  const prompt = `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Seed: ${seed}.

Plan ${desiredCount + 14} distinct (company, role, category) targets for Avery's outreach today.

Avery is a junior at Amherst College (Political Science & Black Studies), a Black student-athlete who played NCAA football, attended Menlo School (Menlo Park CA), and is interning at Murj as an AI Finance Architect this summer. He's interested in Forward Deployed Engineering, Solutions Architecture, fintech, AI, venture capital, private equity, and customer-facing product roles. As a student doing cold outreach, his response rate from senior people is high — so prefer powerful targets across any industry.

The goal is NOT "find anyone at a target company." The goal is "find people Avery would be excited to talk to for 20 minutes." Optimize for:
- Distinctive operators: founders, first GTM/sales/solutions hires, heads of product/solutions/FDE, customer-facing AI leaders, developer relations, implementation leaders.
- Non-obvious companies: vertical AI, fintech infrastructure, workflow automation, healthcare/industrial AI, data infra, capital markets tech, compliance/risk/fraud infra.
- Strong personal hooks: Amherst, Menlo, football/student-athlete, Black professional networks, NESCAC, Bay Area.
- Conversation quality: a clear question Avery can ask that is more specific than "tell me about your path."
- Reachability: people senior enough to help but still likely to respond to a strong student note.

Deprioritize generic analysts, recruiters, mega-cap employees with no hook, broad "partner at huge firm" targets, and roles where Avery cannot ask a specific question.

Pull from ALL of these 8 categories, mixing seniority and fields widely:

1. **Senior Executive** — VPs, SVPs, CROs, CFOs, COOs, Managing Directors, Partners, and C-suite at mid-size companies (not mega-cap Google/Apple, but real and reachable — Series B-D startups, mid-market PE/VC, regional investment banks). People 10-25 years into their career, in a position to mentor.
2. **Amherst Alum** — alumni in ANY relevant field (finance, tech, VC, PE, consulting, AI, entrepreneurship). Mix recent grads (0-5 years out) AND senior alumni (15+ years). Include founders of early-stage companies.
3. **Menlo Alum** — same breadth as Amherst. Especially interesting if they played a sport.
4. **Similar Trajectory** — student-athletes who went into finance/tech/venture. Poli sci or humanities majors who broke into AI/fintech/FDE without a technical background. People who interned at similar places (PE firms, wealth mgmt, YC) and where they ended up. Recent FDEs / SAs from non-technical backgrounds.
5. **Black Network** — BLCK VC members, AfroTech speakers, MLT fellows, NSBE members, "Black at <Company>" ERG leads, Black founders in fintech or AI, senior Black executives at finance/tech.
6. **Target Company** — people at Avery's targets in FDE, Solutions Engineering, or customer-facing AI roles. Targets: Ramp, Retool, Palantir, Stripe, Anthropic, Cohere, Glean, Databricks, Snowflake, Harvey, Brex, Plaid, Rippling, Scale AI, Modern Treasury, Carta, Bland AI, Decagon, Writer AI, HappyRobot, dbt Labs, Voiceflow, Samsara, Notion, Airtable.
7. **VC/PE** — VC and PE people at mid-size or boutique firms, especially investing in AI/fintech or with an Amherst/Menlo connection.
8. **NESCAC** — alumni from Williams, Bowdoin, Middlebury, Colby, Bates, Trinity, Wesleyan, Colgate, Hamilton, Tufts in relevant fields.

Distribute the ~${desiredCount + 14} targets roughly:
- 5-6 Target Company / adjacent company operators in FDE, solutions, customer engineering, DevRel, implementation, or GTM strategy
- 4-5 founders or early operators in AI/fintech/vertical software
- 4-5 Amherst/Menlo/NESCAC/athlete/alumni hooks
- 3-4 Black Network / Black operators or investors
- 3-4 VC/PE people only if they invest in AI, fintech, vertical software, or have a personal hook
- 2-3 senior executives at non-obvious companies with a crisp question

Hard rules:
- Do NOT propose targets at these companies, since Avery already has contacts there: ${existingCompanies}
- Do NOT repeat any (company, role) from his recent runs: ${recentList || 'none yet'}
- Vary roles. Don't pick 8 different "Solutions Architect" or 8 different "Partner" picks in a row.
- At least half should be people at companies outside the obvious target list.
- Each target must include a thesis explaining why this target is interesting for Avery.
- Add priority 1-100. 100 = most interesting and most likely to lead to a real conversation.

Return ONLY a JSON array of objects, no prose, no markdown:
[
  {
    "company": "Exact company name",
    "role": "Specific senior or customer-facing title",
    "category": "Senior Executive|Amherst Alum|Menlo Alum|Similar Trajectory|Black Network|Target Company|VC/PE|NESCAC",
    "hook": "Amherst / Menlo / NESCAC / FDE / Fintech / Black Network / Founder / Senior Leader / Similar Path",
    "thesis": "Why this target is interesting enough for Avery to talk to",
    "priority": 1-100
  }
]`;

  const client = anthropicClient();
  const response = await withRetry(() => client.messages.create({
    model: DISCOVERY_MODEL,
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  }, { timeout: 60000, maxRetries: 0 }));

  const text = getResponseText(response);
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let raw: Array<{ company?: string; role?: string; category?: string; hook?: string; thesis?: string; priority?: number }> = [];
  try {
    raw = parseJson<Array<{ company?: string; role?: string; category?: string; hook?: string; thesis?: string; priority?: number }>>(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const planned: DiscoveryTarget[] = [];
  for (const item of raw) {
    const company = String(item.company || '').trim();
    const role = String(item.role || '').trim();
    if (!company || !role) continue;
    const key = `${company.toLowerCase()}|${role.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    planned.push({
      company,
      role,
      category: normalizeCategory(item.category) ?? 'Other',
      hook: item.hook ? String(item.hook).trim() : undefined,
      thesis: item.thesis ? String(item.thesis).trim() : undefined,
      priority: clampScore(item.priority) ?? 50,
    });
  }
  return planned.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

function normalizeCategory(raw: unknown): DiscoveryCategory | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (s.includes('senior') || s.includes('exec')) return 'Senior Executive';
  if (s.includes('amherst')) return 'Amherst Alum';
  if (s.includes('menlo')) return 'Menlo Alum';
  if (s.includes('similar') || s.includes('trajectory')) return 'Similar Trajectory';
  if (s.includes('black')) return 'Black Network';
  if (s.includes('target')) return 'Target Company';
  if (s.includes('vc') || s.includes('pe')) return 'VC/PE';
  if (s.includes('nescac')) return 'NESCAC';
  return null;
}

async function discoverPeople(existingNames: string[], desiredCount: number): Promise<{
  candidates: DiscoveryCandidate[];
  searches: DiscoverySearchResult[];
}> {
  // Pull recently discovered companies from the last discovery payload so the planner
  // explicitly avoids retargeting the same companies on consecutive runs.
  const prior = getDiscovery();
  const recentTargets: Array<{ company: string; role: string }> = prior?.people
    ? prior.people.slice(0, 40).map(p => ({ company: p.company, role: p.role }))
    : [];

  let attempts: DiscoveryTarget[];
  try {
    attempts = await planDiscoveryTargets(existingNames, recentTargets, desiredCount);
  } catch {
    attempts = [];
  }
  if (attempts.length < Math.max(8, Math.floor(desiredCount / 2))) {
    // Fallback so a planner failure doesn't kill the run — small static seed.
    const fallback: DiscoveryTarget[] = [
      { company: 'Clay', role: 'Solutions Engineer', category: 'Target Company', hook: 'FDE', thesis: 'Customer-facing automation work with a technical GTM motion.', priority: 88 },
      { company: 'LangChain', role: 'Developer Relations', category: 'Target Company', hook: 'AI', thesis: 'Agent infrastructure plus developer-facing work Avery can ask about.', priority: 87 },
      { company: 'Hebbia', role: 'Forward Deployed Engineer', category: 'Target Company', hook: 'FDE', thesis: 'AI workflow deployment in financial services maps directly to Avery’s interests.', priority: 86 },
      { company: 'Rillet', role: 'Head of Solutions', category: 'Target Company', hook: 'Fintech', thesis: 'Finance automation and solutions leadership gives a concrete customer-facing fintech angle.', priority: 84 },
      { company: 'Mercury', role: 'Product Lead, Risk', category: 'Senior Executive', hook: 'Fintech', thesis: 'Fintech infrastructure plus risk gives Avery a sharper question than generic banking.', priority: 80 },
      { company: 'Blck VC', role: 'Investor', category: 'Black Network', hook: 'Black Network', thesis: 'Black investor community with a direct identity and investing hook.', priority: 89 },
      { company: 'Modern Treasury', role: 'Implementation Lead', category: 'Target Company', hook: 'Fintech', thesis: 'Implementation work in payments infrastructure is a strong solutions-style path.', priority: 82 },
      { company: 'Decagon', role: 'Forward Deployed Engineer', category: 'Target Company', hook: 'FDE', thesis: 'Customer-facing AI agent deployment is exactly the role Avery is testing.', priority: 85 },
    ];
    const known = new Set(attempts.map(t => `${t.company.toLowerCase()}|${t.role.toLowerCase()}`));
    for (const f of fallback) {
      const key = `${f.company.toLowerCase()}|${f.role.toLowerCase()}`;
      if (!known.has(key)) attempts.push(f);
    }
  }

  const seeds: DiscoverySeed[] = [];
  const searches: DiscoverySearchResult[] = [];
  const excludedNames = [...existingNames];
  for (const target of attempts) {
    try {
      const result = await searchVerifiedLeads(target.company, target.role, excludedNames, target.category, target.thesis);
      searches.push(result);
      for (const seed of result.leads) {
        if (excludedNames.some(name => name.toLowerCase() === seed.name.toLowerCase())) continue;
        seeds.push({
          ...seed,
          hook: seed.hook || target.hook || 'Other',
          category: seed.category ?? target.category,
          novelty_reason: seed.novelty_reason || target.thesis || '',
          interesting_score: Math.max(scoreDiscoverySeed(seed), target.priority ?? 0),
        });
        excludedNames.unshift(seed.name);
      }
    } catch {
      searches.push({
        company: target.company,
        leads: [],
        model_candidates: 0,
        search_sources: 0,
      });
    }
    if (seeds.length >= desiredCount + 8) break;
    await sleep(1200);
  }
  if (seeds.length === 0) return { candidates: [], searches };
  const selected = seeds
    .map(seed => ({ ...seed, interesting_score: scoreDiscoverySeed(seed) }))
    .sort((a, b) => (b.interesting_score ?? 0) - (a.interesting_score ?? 0))
    .slice(0, desiredCount);
  const drafts: DraftPair[] = [];
  for (let index = 0; index < selected.length; index += 8) {
    const batch = selected.slice(index, index + 8);
    try {
      drafts.push(...await draftDiscoveryMessages(batch));
    } catch {
      drafts.push(...batch.map(fallbackDiscoveryDraft));
    }
  }
  const draftsByName = new Map(drafts.map(draft => [draft.name.toLowerCase(), draft]));
  const candidates = selected.flatMap(seed => {
    const draft = draftsByName.get(seed.name.toLowerCase());
    return draft ? [{ seed, draft }] : [];
  });
  return { candidates, searches };
}

function isValidMessage(message: string): boolean {
  const words = wordCount(message);
  return Boolean(message)
    && words >= 15
    && words <= 85
    && /\bI['’]m Avery\b/i.test(message)
    && !/\b(pick your brain|hope (?:this finds you|you're well|you are well)|synergize|circle back|touching base|your background caught my eye|your work stood out|really impressive|super impressive)\b/i.test(message)
    && !/[—]/.test(message);
}

function validateMessage(message: string, person: string): string {
  if (!isValidMessage(message)) throw new Error(`Draft for ${person} was invalid`);
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
      Score: ${escapeHtml(String(person.interesting_score ?? 'n/a'))}/100<br>
      Why today: ${escapeHtml(person.why)}<br>
      Hook: ${escapeHtml(person.hook)}<br>
      ${person.conversation_angle ? `Ask about: ${escapeHtml(person.conversation_angle)}<br>` : ''}
      ${person.novelty_reason ? `Interesting because: ${escapeHtml(person.novelty_reason)}<br>` : ''}
      Opening: "${escapeHtml(person.suggested_opening)}"
      <br>Source: <a href="${escapeHtml(person.source_url || '')}">${escapeHtml(person.source_title || person.source_url || '')}</a>
    </li>`).join('');
  const textRows = discovery.people.map((person, index) =>
    `${index + 1}. ${person.name} - ${person.role} at ${person.company}\nScore: ${person.interesting_score ?? 'n/a'}/100\nWhy today: ${person.why}\nHook: ${person.hook}${person.conversation_angle ? `\nAsk about: ${person.conversation_angle}` : ''}${person.novelty_reason ? `\nInteresting because: ${person.novelty_reason}` : ''}\nOpening: "${person.suggested_opening}"\nSource: ${person.source_url}`,
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

export async function runDiscovery(source: AgentRunSource, opts?: { force?: boolean }): Promise<{
  discovery?: DiscoveryData;
  run: AgentRun;
}> {
  const startedAt = new Date().toISOString();
  try {
    const currentDiscovery = getDiscovery();
    // force=true wipes today's retained list so we always plan a fresh batch.
    // The cron path leaves force unset, so daily top-up behavior is unchanged.
    const retainedPeople = !opts?.force && currentDiscovery?.date === isoDate()
      ? currentDiscovery.people
      : [];
    const currentDiscoveryNames = retainedPeople.map(person => person.name);
    const existingNames = [
      ...currentDiscoveryNames,
      ...getAllContacts().map(contact => contact.name),
    ];
    const missingCount = Math.max(0, DAILY_DISCOVERY_TARGET - retainedPeople.length);
    if (missingCount === 0) {
      const run = createRun('discovery', source, startedAt, {
        total: retainedPeople.length,
        drafted: 0,
        retained: retainedPeople.length,
      }, { sent: false });
      appendAgentRun(run);
      return { discovery: currentDiscovery || undefined, run };
    }
    const discoveryResult = await withRetry(() => discoverPeople(existingNames, missingCount));
    const { candidates, searches } = discoveryResult;
    if (candidates.length === 0) {
      const run = createRun('discovery', source, startedAt, {
        total: 0,
        drafted: 0,
        retained: currentDiscovery?.people.length || 0,
        model_candidates: searches.reduce((sum, result) => sum + result.model_candidates, 0),
        search_sources: searches.reduce((sum, result) => sum + result.search_sources, 0),
      }, { sent: false });
      run.error = `No new verified people found after searching ${searches.map(result => result.company).join(', ') || 'target companies'}. The previous verified list was kept.`;
      run.success = false;
      appendAgentRun(run);
      return { discovery: currentDiscovery || undefined, run };
    }
    const newPeople: DiscoveryPerson[] = candidates.map(({ seed, draft }) => {
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
    const people = [...retainedPeople, ...newPeople].slice(0, 25);
    const saved = people.filter(person => person.status === 'saved').length;
    const skipped = people.filter(person => person.status === 'skipped').length;
    const discovery: DiscoveryData = {
      date: isoDate(),
      generated_at: new Date().toISOString(),
      people,
      stats: { total: people.length, approved: saved, skipped, saved },
    };
    const digest = discoveryDigest(discovery);
    const email = await sendDigest(digest.subject, digest.html, digest.text);
    if (email.error) discovery.email_error = email.error;
    saveDiscovery(discovery);
    const run = createRun('discovery', source, startedAt, {
      total: people.length,
      drafted: newPeople.length,
      retained: retainedPeople.length,
    }, email);
    if (people.length < DAILY_DISCOVERY_TARGET) {
      run.success = false;
      run.error = `Found ${people.length} of ${DAILY_DISCOVERY_TARGET} verified people. The partial list was saved; run discovery again to continue filling it.`;
    }
    appendAgentRun(run);
    return { discovery, run };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Unknown discovery error';
    const message = /rate_limit_error|status.?429|\b429\b/i.test(rawMessage)
      ? 'Anthropic discovery rate limit reached. The previous verified list was kept; try again in about a minute.'
      : rawMessage;
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
    recent_messages: getMessages(contact.id).slice(-4).map(message => ({
      direction: message.direction,
      channel: message.channel,
      body: message.body,
      timestamp: message.timestamp,
    })),
  }));
  const prompt = `${instructions}
Use the contact's notes and recent_messages to avoid generic bumps.
Quality rules:
- No em dashes.
- Use only supplied facts.
- Do not say "checking in", "touching base", "circle back", or "following up on my note".
- Do not ask a broad "would love to connect" question unless no prior context exists.
- If mode is followup, make the message a light bump on the original outreach with one specific reason to respond.
- If mode is reengage, reference the prior relationship or notes and ask one small update-oriented question.
- Sound like Avery typed it himself.

Return ONLY valid JSON:
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
    if (!draft || wordCount(draft) > maxWords || /[—]/.test(draft) || /\b(checking in|touching base|circle back|pick your brain|hope (?:you're|you are) well)\b/i.test(draft)) {
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
    notes: `${person.why}${person.interesting_score ? `\nRecommendation score: ${person.interesting_score}/100` : ''}${person.conversation_angle ? `\nConversation angle: ${person.conversation_angle}` : ''}${person.novelty_reason ? `\nInteresting because: ${person.novelty_reason}` : ''}\nVerified source: ${person.source_url}${person.source_evidence ? `\nEvidence: ${person.source_evidence}` : ''}`,
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
