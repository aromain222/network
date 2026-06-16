import type { Contact, Goal, Tier, Warmth } from './types';

const WARMTH_WEIGHT: Record<Warmth, number> = {
  warm: 1.0,
  second_degree: 0.7,
  cold: 0.4,
};

const TIER_WEIGHT: Record<Tier, number> = {
  1: 1.0,
  2: 0.75,
  3: 0.55,
};

/** Warmth derived from existing app status when warmth column isn't explicitly set. */
function inferWarmth(c: Contact): Warmth {
  if (c.warmth) return c.warmth;
  if (c.status === 'completed' || c.status === 'scheduled' || c.status === 'replied') return 'warm';
  return 'cold';
}

function inferTier(c: Contact): Tier {
  if (c.tier) return c.tier;
  // Existing contacts inherit Tier 1 if warm; Tier 2 if they have a hook; else Tier 3
  if (c.status === 'completed' || c.status === 'scheduled' || c.status === 'replied') return 1;
  if (c.hook && c.hook.trim().length > 0) return 2;
  return 3;
}

/** Goal-aware relevance score in [0, 1]: 50% goal overlap + 30% warmth + 20% tier. */
export function scoreContact(c: Contact, goals: Goal[]): number {
  const haystack = [c.role, c.company, c.notes, c.hook, c.shared_background, ...(c.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let goalScore = 0;
  let weightSum = 0;
  for (const g of goals) {
    if (!g.active) continue;
    weightSum += g.weight;
    if (haystack.includes(g.label.toLowerCase())) goalScore += g.weight;
    else {
      const tokens = g.label.toLowerCase().split(/\s+/).filter(t => t.length > 3);
      if (tokens.some(t => haystack.includes(t))) goalScore += g.weight * 0.6;
    }
  }
  const goalComponent = weightSum > 0 ? goalScore / weightSum : 0.5;
  const warmth = WARMTH_WEIGHT[inferWarmth(c)];
  const tier = TIER_WEIGHT[inferTier(c)];

  return clamp01(0.5 * goalComponent + 0.3 * warmth + 0.2 * tier);
}

/** Sort tier → warmth → score so warm dormant contacts surface above cold high-score leads. */
export function rankContacts(contacts: Contact[], goals: Goal[]): Array<Contact & { tier: Tier; warmth: Warmth }> {
  return contacts
    .map(c => ({ ...c, tier: inferTier(c), warmth: inferWarmth(c), relevance_score: scoreContact(c, goals) }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const order: Record<Warmth, number> = { warm: 0, second_degree: 1, cold: 2 };
      if (order[a.warmth] !== order[b.warmth]) return order[a.warmth] - order[b.warmth];
      return (b.relevance_score ?? 0) - (a.relevance_score ?? 0);
    });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Leadership signal — anyone with a senior title regardless of industry.
 * Covers C-suite, VP/Director/Head/Chief, Managers, Partners, Founders, Principals, Leads.
 */
const LEADERSHIP_RE = /\b(c(eo|fo|oo|to|mo|ro|po|so|io)|chief|president|vp|vice president|head of|director|managing director|md\b|partner|principal|founder|co[- ]?founder|owner|svp|evp|gm|general manager|manager|lead|senior lead|board)\b/i;

export function isLeadership(c: Contact): boolean {
  return LEADERSHIP_RE.test(c.role || '') || LEADERSHIP_RE.test(c.notes || '');
}

/**
 * Graduated seniority — higher means more powerful target.
 * Per Avery's strategy: as a student, cold outreach to senior people has a
 * surprisingly high response rate, so leadership-level dominates connection
 * in the broaden ranking. Keeps connection as a meaningful tiebreaker only.
 */
export function leadershipScore(c: Contact): number {
  const text = `${c.role || ''} ${c.notes || ''}`.toLowerCase();
  if (!text.trim()) return 0;
  if (/\b(ceo|cfo|coo|cto|cmo|cro|cpo|cso|cio|chief|president|founder|co[- ]?founder|managing partner|general partner)\b/.test(text)) return 1.0;
  if (/\b(vp|vice president|svp|evp|managing director|md|partner)\b/.test(text)) return 0.85;
  if (/\b(head of|director|principal|gm|general manager)\b/.test(text)) return 0.75;
  if (/\b(senior manager|senior lead|staff)\b/.test(text)) return 0.65;
  if (/\b(manager|lead)\b/.test(text)) return 0.55;
  return 0;
}

/**
 * Connection strength in [0, 1] — how warm/anchored a relationship is regardless of goal fit.
 * Used for the "broaden" half of the Top 25 where role-relevance matters less than relationship.
 */
export function connectionStrength(c: Contact): number {
  let score = 0;
  // Warmth column (already backfilled from status)
  if (c.warmth === 'warm') score += 0.45;
  else if (c.warmth === 'second_degree') score += 0.30;
  // Pipeline status signals an active or completed interaction
  if (c.status === 'completed') score += 0.25;
  else if (c.status === 'scheduled' || c.status === 'replied') score += 0.20;
  else if (c.status === 'followup' || c.status === 'sent') score += 0.10;
  // Shared background / mutuals
  if (c.shared_background && c.shared_background.length > 0) score += 0.15;
  // Hook (alumni / network anchor) — Amherst, Menlo, Black at X, BLCK VC, NESCAC, MLT, NSBE, etc.
  if (c.hook && c.hook.length > 0) score += 0.15;
  return clamp01(score);
}

/**
 * Rank contacts for the "broaden" half. Seniority dominates; connection is a tiebreaker.
 *
 * As a student, cold outreach to powerful people has a surprisingly high response rate,
 * so we don't want the rank to collapse to "only warm contacts" once we leave the
 * goal-aligned half. Cold C-suite / Founder / Partner should still surface above
 * warm middle-management.
 *
 * combined = 0.7 * leadershipScore + 0.3 * connectionStrength
 */
export function rankBroaden(contacts: Contact[]): Array<Contact & { connection_score: number; is_leadership: boolean; leadership_score: number; broaden_score: number }> {
  return contacts
    .map(c => {
      const leadership_score = leadershipScore(c);
      const connection_score = connectionStrength(c);
      return {
        ...c,
        leadership_score,
        connection_score,
        is_leadership: leadership_score > 0,
        broaden_score: 0.7 * leadership_score + 0.3 * connection_score,
      };
    })
    .sort((a, b) => {
      if (a.broaden_score !== b.broaden_score) return b.broaden_score - a.broaden_score;
      // Tiebreak: by raw seniority, then warmth
      if (a.leadership_score !== b.leadership_score) return b.leadership_score - a.leadership_score;
      const order: Record<Warmth, number> = { warm: 0, second_degree: 1, cold: 2 };
      const aW = a.warmth ?? 'cold';
      const bW = b.warmth ?? 'cold';
      return order[aW] - order[bW];
    });
}
