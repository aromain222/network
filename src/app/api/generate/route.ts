import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NETWORKING_SYSTEM_PROMPT } from '@/lib/system-prompt';
import {
  cleanDraft,
  getText,
  OUTREACH_RESPONSE_SCHEMA,
  PROFILE_ANALYSIS_SCHEMA,
} from '@/lib/ai-response';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  let body: { profile: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.profile?.trim()) {
    return NextResponse.json({ error: 'Profile text is required' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey, maxRetries: 3 });

  const friendlyError = (label: string, err: unknown): string => {
    if (err instanceof Anthropic.APIConnectionTimeoutError) return `${label}: request to Anthropic timed out — try again in a moment.`;
    if (err instanceof Anthropic.APIConnectionError) return `${label}: couldn't reach Anthropic (network blip) — try again in a moment.`;
    if (err instanceof Anthropic.RateLimitError) return `${label}: rate-limited — wait a few seconds and retry.`;
    if (err instanceof Anthropic.APIError) return `${label}: Anthropic returned ${err.status} — ${err.message}`;
    return `${label}: ${err instanceof Error ? err.message : 'Unknown error'}`;
  };

  const contextLine = body.context?.trim() ? `\n\nAdditional context from Avery: ${body.context.trim()}` : '';
  const analysisPrompt = `Analyze this LinkedIn profile before writing any outreach.

Rank shared connections using this exact priority:
1. Compound direct connection: same school plus same sport/team, same school plus same organization, or another two-part overlap
2. Same school and same specific activity separately supported by the profile
3. Same school
4. Same former school, hometown, or regional connection
5. Shared racial or cultural identity — Avery is Black. Treat this as a real, high-priority hook whenever the recipient is plausibly Black. Trigger this on any of: (a) named affiliations with Black professional communities (NSBE, NBMBAA, MLT, Management Leadership for Tomorrow, Jopwell, BLCK VC, AfroTech, HBCU attendance, Black @ Company ERGs, Divine Nine fraternity or sorority, etc.); (b) a culturally specific name indicating Black or African diasporic heritage — Akan day names (Kwame, Kofi, Kwesi, Kwabena, Kweku, Yaw, Akua, Ama, Adwoa, Abena, Afia, Esi, Akosua), Yoruba/Igbo/other West African names (Adebayo, Adaeze, Chinwe, Chidi, Chinedu, Chioma, Nneka, Ngozi, Ifeoma, Olumide, Olufemi, Tunde, Babatunde, Oluwaseun, Kehinde, Taiwo, Emeka, Nkechi, Uchenna, Ifeanyi, Obinna), or other clearly African/African-diasporic names; (c) Avery's context explicitly notes shared Black identity. A culturally specific name alone is sufficient — do not require additional corroboration. If applying this category, set strongest_connection to "Black professional community" and put the supporting evidence (name origin, affiliation, etc.) in connection_evidence.
6. Same professional or identity-based organization (non-racial)
7. Direct overlap with Avery's actual building, investing, or work experience
8. Broad role or industry interest

Critical rules:
- If the person attended Amherst and played football there, strongest_connection must be "Amherst football," not merely "Amherst."
- Never infer football from Amherst attendance alone. Require explicit football evidence.
- Select exactly one Avery background that mirrors the strongest connection.
- option_a_detail must be one concrete profile fact that creates a natural question Avery would genuinely ask.
- Prioritize professional relevance over novelty. Current responsibilities, a specific promotion, a clear career move, or a named area of work beat an unusual major or minor.
- Do not select a degree combination, certification, award, or hobby merely because it is rare. Use it only when Avery shares it or it directly explains the conversation topic.
- option_b_detail must describe only the broad hook or field. It must not contain a profile-specific project, transition, responsibility, employer history, or achievement.
- The question suggested by each detail must directly follow from that detail. Never select an education detail and then ask an unrelated career question.
- Use only facts in the profile or Avery's supplied context.

Profile:
${body.profile}${contextLine}`;

  console.log('[generate] Profile length:', body.profile.length, '| First 200 chars:', body.profile.slice(0, 200));

  let analysis;
  try {
    const analysisResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: analysisPrompt }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: PROFILE_ANALYSIS_SCHEMA },
      },
    });
    analysis = JSON.parse(getText(analysisResponse));
  } catch (err) {
    console.error('[generate] Profile analysis failed:', err);
    return NextResponse.json({ error: friendlyError('Profile analysis failed', err) }, { status: 502 });
  }

  const role = String(analysis.person?.role ?? '').toLowerCase();
  const company = String(analysis.person?.company ?? '').toLowerCase();
  const strongestConnectionLower = String(analysis.strongest_connection ?? '').toLowerCase();
  const contextLower = String(body.context ?? '').toLowerCase();
  const personName = String(analysis.person?.name ?? '');
  const firstName = personName.split(/\s+/)[0] || 'there';
  const profileLower = body.profile.toLowerCase();

  // ---- Alum vs current student detection ----
  // Take the earliest 4-digit year in the profile. If they have 5+ years of work
  // history, treat them as an alum so the message doesn't falsely call them a
  // "fellow student."
  const currentYear = new Date().getFullYear();
  const years = [...body.profile.matchAll(/\b(19[89]\d|20\d{2})\b/g)]
    .map(m => parseInt(m[1]))
    .filter(y => y >= 1985 && y <= currentYear);
  const earliestYear = years.length ? Math.min(...years) : currentYear;
  const yearsExperience = currentYear - earliestYear;
  const isCurrentStudent = yearsExperience <= 2;
  const isRecentGrad = yearsExperience >= 3 && yearsExperience <= 6;
  const isAlum = !isCurrentStudent; // anyone clearly out of school

  // ---- Signal detection ----
  const blackNameSignal = /\b(kwame|kofi|kwesi|kwabena|kweku|akwesi|yaw|akua|ama|adwoa|abena|afia|esi|akosua|adaeze|chinwe|chidi|chinedu|chioma|nneka|ngozi|ifeoma|olumide|olabisi|olufemi|adebayo|adebola|adesina|tunde|babatunde|oluwaseun|kehinde|taiwo|chibueze|emeka|nkechi|uchenna|ifeanyi|obinna|amara|amadi|jamaal|jabari|kwamena|kojo|nana|abeni|ayodele|adanna|oluchi|chukwuemeka|ekene|sade|funmi|aisha|imani|zora|aaliyah|malik|kareem|tariq|rashid|jelani)\b/i.test(personName);
  const blackOrgSignal = /\b(nsbe|nbmbaa|jopwell|mlt|management leadership for tomorrow|blck vc|afrotech|divine nine|alpha phi alpha|kappa alpha psi|omega psi phi|phi beta sigma|aka alpha kappa alpha|delta sigma theta|zeta phi beta|sigma gamma rho|black @|black at |black professionals|hbcu|howard university|morehouse|spelman|hampton university|florida a&m|north carolina a&t|jackson state|grambling|tuskegee|fisk university|black student|naacp|urban league)\b/i.test(profileLower);

  const hasAmherst = /\bamherst\s+college\b/.test(profileLower) || /\bamherst\b/.test(strongestConnectionLower);
  const hasAmherstFootball = hasAmherst && /\bamherst football\b/i.test(strongestConnectionLower);
  // "menlo school" is the high school. "menlo park" alone is NOT a Menlo School signal.
  // "menlo ventures" / "menlo college" are also NOT Menlo School.
  const hasMenlo = /\bmenlo\s+school\b/.test(profileLower);

  const NESCAC_OTHER = /\b(williams\s+college|middlebury|bowdoin|colby\s+college|bates\s+college|trinity\s+college|wesleyan\s+university|colgate\s+university|hamilton\s+college|tufts\s+university)\b/;
  const hasOtherNescac = !hasAmherst && NESCAC_OTHER.test(profileLower);

  // Athlete: profile mentions a college sport explicitly tied to a team or D1/D3 context
  const hasCollegeAthlete = /\b(varsity|d1|d3|division\s+(i|iii)|ncaa|college\s+football|college\s+basketball|college\s+lacrosse|college\s+soccer|college\s+baseball|college\s+hockey|college\s+rugby|college\s+track|football\s+team|basketball\s+team|lacrosse\s+team|soccer\s+team)\b/i.test(profileLower);

  // VC / investor / founder buckets — only here is the "founder of AI investing platform" framing allowed
  const isVCInvestor = /\b(venture\s+capital|venture\s+partner|general\s+partner|managing\s+partner|principal,?\s+ventures|principal\s+at\s+\w+\s+(ventures|capital)|partner\s+at\s+\w+\s+(ventures|capital)|angel\s+investor|seed\s+investor|growth\s+investor|investor\s+at|vc\s+associate|venture\s+associate|chief\s+investment)/i.test(role + ' ' + company)
    || /\b(ventures|capital\s+partners|equity\s+partners)\b/.test(company);
  const isFounderType = /\b(founder|co[- ]?founder|ceo|cto|chief\s+executive|chief\s+technology)\b/i.test(role);
  const isFounderOrInvestor = isVCInvestor || isFounderType;

  // FDE / Solutions / Sales engineering / Customer-facing technical
  const isFDESolutions = /\b(forward[- ]?deployed|fde|solutions\s+(engineer|architect)|solutions\s+consultant|sales\s+engineer|customer\s+engineer|implementation\s+engineer|technical\s+account\s+manager|developer\s+relations|devrel)\b/i.test(role);
  // Other customer-facing (sales, AE, CSM) — Avery is curious about customer-facing AI roles
  const isCustomerFacing = isFDESolutions || /\b(sales|account\s+executive|\bae\b|sdr|bdr|customer\s+success|account\s+manager|gtm|go[- ]to[- ]market|enterprise\s+sales|sales\s+director|regional\s+director)\b/i.test(role);

  // Pure finance / banking / PE with NO AI angle in the role or company text
  const aiSignalInRoleOrCompany = /\b(ai|artificial\s+intelligence|machine\s+learning|ml\b|llm|gen(?:erative)?\s*ai|data\s+science|nlp|llms|agents?|forward[- ]?deployed|forward\s+deployed)\b/i.test(role + ' ' + company + ' ' + profileLower.slice(0, 2000));
  const isPureFinance = !aiSignalInRoleOrCompany && /\b(investment\s+banking|m&a\b|managing\s+director,?\s+banking|private\s+equity|wealth\s+management|asset\s+management|equity\s+research|sell[- ]?side|buy[- ]?side|hedge\s+fund|portfolio\s+manager|credit\s+analyst|associate,?\s+banking|vp,?\s+banking)\b/i.test(role + ' ' + company);

  const isFintech = !isPureFinance && /\b(fintech|payments?|stripe|brex|ramp|plaid|mercury|chime|sofi|wealthfront|robinhood|coinbase|crypto|defi|trading\s+platform|capital\s+markets\s+tech|banking\s+software)\b/i.test(role + ' ' + company);

  const isIdentityConnection = /\b(black|hbcu|nsbe|nbmbaa|jopwell|mlt|management leadership for tomorrow|blck vc|afrotech|divine nine|african american|african diaspora)\b/.test(strongestConnectionLower)
    || /\b(black|hbcu|nsbe|jopwell|mlt|afrotech|divine nine|we'?re both black|same background|same community)\b/.test(contextLower)
    || blackNameSignal
    || blackOrgSignal;

  // ---- Hook priority resolver (matches the system prompt) ----
  type Hook = 'amherst-football' | 'amherst' | 'menlo' | 'black' | 'nescac' | 'athlete' | 'fde-solutions' | 'fintech-ai' | 'none';
  let hook: Hook = 'none';
  if (hasAmherstFootball) hook = 'amherst-football';
  else if (hasAmherst) hook = 'amherst';
  else if (hasMenlo) hook = 'menlo';
  else if (isIdentityConnection) hook = 'black';
  else if (hasOtherNescac) hook = 'nescac';
  else if (hasCollegeAthlete) hook = 'athlete';
  else if (isFDESolutions || isCustomerFacing) hook = 'fde-solutions';
  else if (isFintech || aiSignalInRoleOrCompany) hook = 'fintech-ai';

  // ---- Avery background by role bucket (see system prompt rules) ----
  let averyBackground = 'a junior at Amherst';
  if (isFounderOrInvestor) {
    averyBackground = "a junior at Amherst who's been building an AI investing platform";
  } else if (isPureFinance) {
    averyBackground = 'a junior at Amherst exploring finance';
  } else if (isFDESolutions || isCustomerFacing) {
    averyBackground = 'a junior at Amherst interning in AI this summer';
  } else if (isFintech) {
    averyBackground = 'a junior at Amherst interning in fintech this summer';
  }
  analysis.avery_background = averyBackground;

  // ---- Strongest connection label for the UI badge ----
  const hookLabel: Record<Hook, string> = {
    'amherst-football': 'Amherst football',
    'amherst': 'Amherst College',
    'menlo': 'Menlo School',
    'black': 'Black professional community',
    'nescac': 'NESCAC connection',
    'athlete': 'College athlete',
    'fde-solutions': 'Customer-facing AI roles',
    'fintech-ai': 'AI + fintech intersection',
    'none': analysis.strongest_connection || 'Shared interest',
  };
  if (hook !== 'none') analysis.strongest_connection = hookLabel[hook];

  const tone = contextLower;
  const wantsNetworky = /more networky|warmer|less salesy|more casual|less formal|softer|peer/i.test(tone);

  // ---- Hook-specific voice templates (drives both Type 1 and Type 2 openers) ----
  const voiceByHook: Record<Hook, string> = {
    'amherst-football': isAlum
      ? `AMHERST FOOTBALL VOICE (ALUM RECIPIENT) — hook MUST be the opening line:
- Type 1: "Hey ${firstName}, saw you played football at Amherst — I'm a current player. [One specific career detail in a single sentence, then one question that follows from it.] Open to chatting?"
- Type 2: "Hey ${firstName}, Amherst football alum here — well, I'm a current player. Always good to connect with former players doing interesting work. Open to connecting?"
- Type 3: "Hey ${firstName}, I'm ${averyBackground}. [One genuine curiosity question about their work that any student could ask.] Open to a quick chat?"
- Type 4: "Hey ${firstName}, ${averyBackground} here — would you be open to a quick 15-min chat? Happy to work around your schedule."
- NEVER say "fellow Amherst football player" — Avery is the only current player; recipient is an alum.`
      : `AMHERST FOOTBALL VOICE — hook MUST be the opening line:
- Type 1: "Hey ${firstName}, fellow Amherst football player here. [One specific career detail in a single sentence, then one question or interest statement that follows from it.] Would you be open to a quick chat?"
- Type 2: "Hey ${firstName}, Amherst football alum here too. Always good to connect with former players doing interesting work after school. Would you be open to connecting?"
- Type 3: "Hey ${firstName}, I'm ${averyBackground}. [One curiosity question about their work.] Open to a quick chat?"
- Type 4: "Hey ${firstName}, ${averyBackground} here — would you be open to a quick 15-min chat?"`,
    'amherst': isAlum
      ? `AMHERST VOICE (ALUM RECIPIENT) — hook MUST be the opening line, alum-aware:
- Type 1: "Hey ${firstName}, saw you went to Amherst — I'm ${averyBackground} there now. [One specific career fact in one sentence, then a related question.] Open to a quick chat?"
- Type 2: "Hey ${firstName}, ${averyBackground} reaching out — saw you went to Amherst. Always like learning from alums doing interesting work. Open to connecting?"
- Type 3: "Hey ${firstName}, I'm ${averyBackground}. [One genuine curiosity question grounded in their current role or company — works even without the Amherst connection.] Open to a quick chat?"
- Type 4: "Hey ${firstName}, ${averyBackground} — would you be open to a quick 15-min chat about your work at ${analysis.person?.company || 'your company'}?"
- CRITICAL: NEVER write "fellow Amherst student" — recipient is an alum, not a current student. Always frame as "saw you went to Amherst" or "Amherst alum, I'm a current student."`
      : `AMHERST VOICE (STUDENT RECIPIENT) — hook MUST be the opening line:
- Type 1: "Hey ${firstName}, fellow Amherst student here — I'm ${averyBackground}. [One specific career fact, then a related question.] Open to a quick chat?"
- Type 2: "Hey ${firstName}, fellow Amherst student here — always like meeting other students doing interesting things. Open to connecting?"
- Type 3: "Hey ${firstName}, I'm ${averyBackground}. [One genuine curiosity question.] Open to a quick chat?"
- Type 4: "Hey ${firstName}, ${averyBackground} here — would you be open to a quick 15-min chat?"`,
    'menlo': `MENLO SCHOOL VOICE — hook MUST be the opening line:
- Type 1: "Hey ${firstName}, went to Menlo too and I'm ${averyBackground} now. [One broad reference to their work.] Open to a quick chat?"
- Type 2: "Hey ${firstName}, Menlo alum here. I'm ${averyBackground}. Always like connecting with other Menlo people. Open to connecting?"
- Type 3: "Hey ${firstName}, I'm ${averyBackground}. [One curiosity question about their work — works without the Menlo hook.] Open to a quick chat?"
- Type 4: "Hey ${firstName}, ${averyBackground} here — would you be open to a quick 15-min chat?"
- If a Menlo hook is detected and the message does not start with "Menlo" or "went to Menlo," that is a bug.`,
    'black': `BLACK PROFESSIONAL COMMUNITY VOICE — community is the hook, not a research call:
- Type 1: "Hey ${firstName}, I'm ${averyBackground}. Always good to see another Black professional doing serious work in ${isFintech ? 'fintech' : isCustomerFacing ? 'customer-facing AI' : 'this space'} — [one broad reference to their current work or move]. Open to a quick chat?"
- Type 2: "Hey ${firstName}, I'm ${averyBackground}. Trying to learn from more Black professionals working in ${isFintech ? 'fintech and enterprise software' : isCustomerFacing ? 'customer-facing AI roles' : 'this space'}. Open to connecting?"
- Type 3: "Hey ${firstName}, I'm ${averyBackground}. [One curiosity question about their current work or career arc.] Open to a quick chat?"
- Type 4: "Hey ${firstName}, ${averyBackground} — would you be open to a quick 15-min chat?"
- Never say "person of color," "POC," or "diverse." Say "Black."`,
    'nescac': `NESCAC VOICE — acknowledge the connection warmly:
- Type 1: "Hey ${firstName}, ${isAlum ? 'saw you went to [their school]' : 'fellow NESCAC student here — saw you went to [their school]'} and I'm ${averyBackground}. [One broad reference to their work.] Open to a quick chat?"
- Type 2: "Hey ${firstName}, saw you went to [their school] — I'm ${averyBackground} so we're NESCAC neighbors. Open to connecting?"
- Type 3: "Hey ${firstName}, I'm ${averyBackground}. [One curiosity question — works without the NESCAC hook.] Open to a quick chat?"
- Type 4: "Hey ${firstName}, ${averyBackground} — would you be open to a quick 15-min chat?"`,
    'athlete': `SHARED ATHLETE VOICE — acknowledge the shared world first:
- Type 1: "Hey ${firstName}, saw you played [their sport] at [their school] — I'm ${averyBackground} and play football here. [One broad reference to their work.] Open to a quick chat?"
- Type 2: "Hey ${firstName}, saw you played [their sport] in college. I'm ${averyBackground} and play football here. Always good to connect with former student-athletes. Open to connecting?"
- Type 3: "Hey ${firstName}, I'm ${averyBackground}. [One curiosity question.] Open to a quick chat?"
- Type 4: "Hey ${firstName}, ${averyBackground} — would you be open to a quick 15-min chat?"`,
    'fde-solutions': `CUSTOMER-FACING / FDE / SOLUTIONS VOICE — shared interest in the space:
- Type 1: "Hey ${firstName}, I'm ${averyBackground}. [Acknowledge their company or current role, then one direct curious question about their career move or what the role looks like up close.] Open to a quick chat?"
- Type 2: "Hey ${firstName}, I'm ${averyBackground}. Curious how customer-facing AI roles work up close and your background looks a lot like the path I'd want to be on. Open to connecting?"
- Type 3: "Hey ${firstName}, I'm ${averyBackground}. [One genuine curiosity question grounded in their company or industry.] Open to a quick chat?"
- Type 4: "Hey ${firstName}, ${averyBackground} — would you be open to a quick 15-min chat about your role at ${analysis.person?.company || 'your company'}?"
- Never lead with "founder of an AI investing platform" for these recipients.`,
    'fintech-ai': `FINTECH / AI VOICE — shared-interest opener:
- Type 1: "Hey ${firstName}, I'm ${averyBackground}. Spending a lot of time in the AI and fintech world and [one broad reference to their work]. Open to a quick chat?"
- Type 2: "Hey ${firstName}, I'm ${averyBackground}. Always like connecting with people in fintech and AI. Open to connecting?"
- Type 3: "Hey ${firstName}, I'm ${averyBackground}. [One curiosity question about their work or industry.] Open to a quick chat?"
- Type 4: "Hey ${firstName}, ${averyBackground} — would you be open to a quick 15-min chat?"`,
    'none': `NO STRONG HOOK — be direct about who Avery is:
- Type 1: "Hey ${firstName}, I'm ${averyBackground}. [One direct, plain-language reference to their work, then one question.] Open to a quick chat?"
- Type 2: "Hey ${firstName}, I'm ${averyBackground} and always like meeting people doing interesting work. Open to connecting?"
- Type 3: "Hey ${firstName}, I'm ${averyBackground}. [One curiosity question about their current role or company.] Open to a quick chat?"
- Type 4: "Hey ${firstName}, ${averyBackground} — would you be open to a quick 15-min chat about your work at ${analysis.person?.company || 'your company'}?"`,
  };
  const connectionGuidance = voiceByHook[hook];
  void isRecentGrad;

  // ---- Sanity flags passed into the writing contract ----
  const founderFramingAllowed = isFounderOrInvestor;
  const dropAIMurjMention = isPureFinance;

  const toneGuidance = wantsNetworky
    ? `NETWORKY TONE OVERRIDE (Avery asked for it):
- Sound like a 21-year-old sending a real DM. Casual, peer, warm.
- Drop credential framing. Lead with shared world or honest student curiosity.
- Two short sentences plus the ask. Three sentences max.`
    : '';

  const founderRule = founderFramingAllowed
    ? `- Founder framing is allowed here ONLY because the recipient is a VC, investor, or other founder. You MAY use "${averyBackground}" or "I'm Avery, founder of an AI investing platform." Pick one and use it exactly once.`
    : `- Founder framing is BANNED for this recipient. NEVER write "founder of an AI investing platform," "founder of CapitalBase," "building an AI hedge fund," or any variation. Use "${averyBackground}" exactly. The recipient is not a VC or founder — peer-to-peer founder framing is wrong here.`;

  const aiMurjRule = dropAIMurjMention
    ? `- This recipient is in pure finance with no AI angle. Do NOT mention AI, Murj, CapitalBase, or any "AI investing" framing. Use "${averyBackground}" exactly. Stay in the finance lane.`
    : '';

  const userContent = `Write EXACTLY FOUR first-touch LinkedIn messages using the completed profile analysis below. Each one takes a different angle so Avery can pick what fits.

Important product goal: Avery likes the outreach quality, but he does NOT want every option to feel over-researched. Give him one clearly personalized option, then give him a few options that are still interested, warm, and specific to the broad role/field, but generic enough that they don't feel like he studied the person's whole profile.

PROFILE ANALYSIS:
${JSON.stringify(analysis)}

RECIPIENT STATUS:
- Years of work experience (heuristic): ${yearsExperience}
- Treat as ${isCurrentStudent ? 'CURRENT STUDENT (peer)' : isAlum ? 'ALUM / professional (NOT a student)' : 'recent grad'}.
- ${isAlum ? 'NEVER call them a "fellow student." They are not a current student. Use alum-aware phrasing only.' : ''}

WRITING CONTRACT:
- Return EXACTLY 4 options with these exact labels in this order:
  1. "Type 1 — Personalized"  (hook-led + one specific career fact + one related question)
  2. "Type 2 — Hook-only"     (generic but interested: hook-led, short, no specific recipient detail)
  3. "Type 3 — Curiosity"     (generic but not bland: one broad honest question about their role/field)
  4. "Type 4 — Direct ask"    (super short: who Avery is + direct ask, no researched detail)
- Word counts: Type 1 ≤ 90 words. Type 2 ≤ 60 words. Type 3 ≤ 70 words. Type 4 ≤ 35 words.

HOOK RULE (highest priority — violating this is a bug):
- The detected hook in strongest_connection is "${hookLabel[hook]}". This MUST open Type 1 AND Type 2.
- Type 3 is the EXCEPTION: it MUST NOT rely on the hook. Treat it as if no hook existed — pure honest curiosity.
- Type 4 is the EXCEPTION: short and direct, hook optional.
- ${hook === 'amherst-football' ? 'Type 1/2 first words must establish Amherst football. Do not bury it.' : ''}
- ${hook === 'amherst' && isAlum ? 'Type 1/2 must use alum-aware framing ("saw you went to Amherst — I\'m a current student"). NEVER write "fellow Amherst student" — recipient is an alum.' : ''}
- ${hook === 'amherst' && !isAlum ? 'Type 1/2 must establish the Amherst connection ("fellow Amherst student").' : ''}
- ${hook === 'menlo' ? 'Type 1/2 first words must establish Menlo School ("went to Menlo too", "Menlo alum here").' : ''}
- ${hook === 'black' ? 'Type 1/2 weave in the shared Black community framing.' : ''}
- ${hook === 'nescac' ? 'Type 1/2 first words must name their NESCAC school and the connection.' : ''}
- ${hook === 'fde-solutions' ? 'Type 1/2 open with shared interest in customer-facing AI roles.' : ''}
- ${hook === 'fintech-ai' ? 'Type 1/2 open with shared interest in fintech/AI.' : ''}
- Follow the voice template below exactly. Adapt only the specific names and one career fact.

VOICE TEMPLATE:
${connectionGuidance}

AVERY INTRODUCTION RULE:
- Use exactly "${averyBackground}" as Avery's self-description. No other credentials.
${founderRule}
${aiMurjRule}
- Introduce Avery once. Never add a second introduction later in the note.

PERSONALIZATION RULES:
- Type 1 — Personalized: reference ONE broad fact about their career (current role, recent company change, the field they work in). Do NOT reference hyper-specific technical details from the profile — no OCR layers, chunking strategies, FHIR pipelines, eval setups, embedding models, retrieval methods, agent frameworks, or anything Avery would not plausibly know from building CapitalBase or interning at Murj.
- Type 2 — Hook-only: NO specific recipient-profile detail. Use only the shared hook plus a warm, low-pressure reason to connect. It should still feel interested, not like a template.
- Type 3 — Curiosity: NO specific recipient-profile detail and NO shared-hook dependency. Use a broad role/field curiosity Avery would genuinely have. Good examples: "I'm trying to understand what customer-facing AI roles look like up close" or "I'm curious how people in fintech infrastructure think about the customer side." Bad examples: "your path," "your experience," or any detailed profile recap.
- Type 4 — Direct ask: NO specific recipient-profile detail. No researched detail. No hook required. Just a clean, confident ask.
- Type 1 must STILL feel like Avery, not a researcher. If the detail makes the note feel performative, drop it and lean harder on the broad career/role hook.

GENERIC BUT INTERESTED STYLE:
- Generic options should sound like Avery is genuinely curious about their world, not like he is pretending to know their work deeply.
- It is okay for Type 2/3/4 to be broadly applicable to people in the same role/field.
- Avoid empty generic lines like "always looking to connect" or "doing interesting work." Generic does not mean lazy.
- Prefer broad but real angles: customer-facing AI roles, fintech infrastructure, building with customers, investing in AI/fintech, moving from school/athletics into tech or finance.

CTA RULE (don't combine):
- The message ends with EXACTLY ONE of: "Would you be open to connecting?" / "Would you be open to a quick chat?" / "Would you be open to a quick conversation?"
- If Type 1 asks a question about their work, that IS the message — DO NOT then add "would you be open to a quick conversation?" on top. Pick one: ask the question and end with "Open to chatting?" / "Curious to hear your take if you're open to it." OR drop the question and end with the standard CTA.
- Never combine a technical question with the standard CTA. That reads as a sales pitch.

BANNED PATTERNS:
- "founder of an AI investing platform" UNLESS founderRule explicitly allows it above.
- Hyper-specific technical references the user did not write themselves.
- "intersect in practice," "actually intersect," "fit together in practice," "actually fit together," "where X and Y meet," "staying in that lane," "the right next move," "experience across [field] and [field]," "background across," "thinking a lot about," "your path," "hear a bit about," "caught my eye," "stood out," "always looking to connect," "saw you went to Amherst" (use "fellow Amherst student" instead).
- "actually" as filler. "your experience," "your journey," "that space."
- Em dashes. Bullet points. Multiple Avery credentials.
- Combining two industries with "and" as a credential ("fintech and investing," "AI and finance").

WRITE LIKE:
- A direct 21-year-old student. Plain English. If you can imagine Avery saying it out loud at a party, it works. If it sounds like a cover letter or a sales pitch, rewrite.

${toneGuidance}

Return only the requested structured output.`;

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1400,
      system: NETWORKING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: OUTREACH_RESPONSE_SCHEMA },
      },
    });
  } catch (err) {
    console.error('[generate] Message generation failed:', err);
    return NextResponse.json({ error: friendlyError('Message generation failed', err) }, { status: 502 });
  }

  const text = getText(response);

  console.log('[generate] Response length:', text.length, '| Stop reason:', response.stop_reason);
  console.log('[generate] Raw response:', text.slice(0, 500));

  try {
    const parsed = JSON.parse(text);
    const result = {
      options: Array.isArray(parsed.options)
        ? parsed.options.map((option: { label?: unknown; message?: unknown }) => ({
            label: typeof option.label === 'string' ? option.label : '',
            message: cleanDraft(option.message),
          }))
        : [],
      hook_used: analysis.strongest_connection || parsed.hook_used || '',
      person: {
        name: parsed.person?.name ?? '',
        company: parsed.person?.company ?? '',
        role: parsed.person?.role ?? '',
      },
      reasoning: `${analysis.strongest_connection}: ${analysis.connection_evidence}`,
    };
    if (result.options.length < 2) {
      return NextResponse.json({ error: 'AI returned fewer than two message options', raw: text }, { status: 502 });
    }
    if (result.options.some((option: { label: string; message: string }) => !option.message?.trim())) {
      return NextResponse.json({ error: 'AI returned an empty message', raw: text }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw: text }, { status: 502 });
  }
}
