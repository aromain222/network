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
