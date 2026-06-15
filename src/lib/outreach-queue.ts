import { getDb } from './db';
import type { Contact, OutreachDraft } from './types';

export type DraftRequest = {
  contact_id: string;
  channel: 'email' | 'linkedin' | 'x';
};

export function draftFor(req: DraftRequest): OutreachDraft {
  const db = getDb();
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.contact_id) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Contact ${req.contact_id} not found`);
  const c = hydrateMinimal(row);

  const { subject, body, angle, ask } = composeDraft(c, req.channel);

  const info = db.prepare(
    `INSERT INTO outreach_queue (contact_id, channel, subject, body, angle, ask)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(c.id, req.channel, subject, body, angle, ask);

  return db.prepare('SELECT * FROM outreach_queue WHERE id = ?').get(info.lastInsertRowid) as OutreachDraft;
}

export function draftBatch(contactIds: string[], channel: 'email' | 'linkedin' | 'x' = 'linkedin'): OutreachDraft[] {
  return contactIds.map(id => draftFor({ contact_id: id, channel }));
}

export function listQueue(status: OutreachDraft['status'] = 'pending'): OutreachDraft[] {
  return getDb()
    .prepare('SELECT * FROM outreach_queue WHERE status = ? ORDER BY created_at DESC')
    .all(status) as OutreachDraft[];
}

export function approveDraft(id: number): OutreachDraft {
  getDb()
    .prepare("UPDATE outreach_queue SET status = 'approved', approved_at = datetime('now') WHERE id = ?")
    .run(id);
  return getDb().prepare('SELECT * FROM outreach_queue WHERE id = ?').get(id) as OutreachDraft;
}

export function rejectDraft(id: number): OutreachDraft {
  getDb().prepare("UPDATE outreach_queue SET status = 'rejected' WHERE id = ?").run(id);
  return getDb().prepare('SELECT * FROM outreach_queue WHERE id = ?').get(id) as OutreachDraft;
}

function hydrateMinimal(row: Record<string, unknown>): Contact {
  return {
    ...(row as unknown as Contact),
    tags: JSON.parse((row.tags as string) || '[]'),
  };
}

function composeDraft(c: Contact, channel: 'email' | 'linkedin' | 'x') {
  const first = c.name.split(' ')[0];
  const tier = c.tier ?? 3;

  const angle =
    c.warmth === 'warm'
      ? 'Reconnect on shared work + light update.'
      : c.shared_background ?? c.hook ?? 'Lead with something specific they shipped.';

  const ask =
    tier === 1
      ? 'Open to a 20-minute catch-up next week?'
      : tier === 2
      ? `Would you be open to 15 minutes to share how you got into ${c.role ? c.role.toLowerCase() : 'this work'}?`
      : `Curious — what's the one thing you wish more people asked you about ${c.company || 'your work'}?`;

  // Positioning: respects [[feedback-avery-positioning-to-sales]] — never use
  // "founder of an AI investing platform" for sales / SE / CSE / FDE / customer-facing recipients.
  const positioning = inferPositioning(c);

  const subject =
    channel === 'email'
      ? c.warmth === 'warm'
        ? `Catching up — ${c.company || 'you'}`
        : `Quick question about ${c.role || 'your work'} at ${c.company || 'your company'}`
      : null;

  const body =
    channel === 'x'
      ? `Hey ${first} — ${angle.toLowerCase()} ${positioning} Would love your take on one specific thing if you're up for it.`
      : [`Hi ${first},`, '', `${angle} ${positioning}`, '', ask, '', '— Avery'].join('\n');

  return { subject, body, angle, ask };
}

function inferPositioning(c: Contact): string {
  const haystack = [c.role, c.notes, c.hook, ...(c.tags ?? [])].filter(Boolean).join(' ').toLowerCase();
  const customerFacing = ['fde', 'forward deployed', 'solutions architect', 'customer engineer', 'sales engineer', 'cse', 'recruiter'];
  if (customerFacing.some(t => haystack.includes(t))) {
    return "I'm a junior at Amherst exploring customer-facing AI roles (FDE / SA / CE).";
  }
  if (haystack.includes('fintech') || haystack.includes('finance') || haystack.includes('invest')) {
    return "I'm a junior at Amherst with experience across fintech and investing.";
  }
  return "I'm a junior at Amherst.";
}
