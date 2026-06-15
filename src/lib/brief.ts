import { getDb, today, getAllContacts } from './db';
import { activeGoals } from './goals';
import { rankContacts } from './scoring';
import { scanDormantRelationships } from './maintenance';
import type { CareerBrief, Contact, Goal, Opportunity } from './types';

export async function generateBrief(day = today()): Promise<CareerBrief> {
  const db = getDb();
  const goals = activeGoals();

  const contacts = getAllContacts();

  // Section 1 — meetings (STUB: replace with Google Calendar via existing /api/google integration)
  const meetings = upcomingMeetings(contacts);

  // Section 2 — follow-ups (between 14d and 60d since last touch, status reflects active pipeline)
  const now = Date.now();
  const follow_ups = contacts.filter(c => {
    if (c.status !== 'followup' && c.status !== 'replied' && c.status !== 'sent') return false;
    const last = c.last_touch_date || c.dateAdded;
    const days = Math.floor((now - new Date(last).getTime()) / 86400000);
    return days >= 14 && days < 60;
  });

  // Section 3 — relationship health alerts (60+ days dormant on warm contacts)
  const dormant = scanDormantRelationships();
  const health_alerts = dormant.map(a => ({
    contact: a.contact,
    days_since: a.days_since,
    suggested_message: a.suggested_message,
  }));

  // Sections 4 & 5 — opportunities
  const opps = db
    .prepare("SELECT * FROM opportunities WHERE status = 'open' ORDER BY relevance_score DESC")
    .all() as Opportunity[];
  const internships = opps.filter(o => o.kind === 'internship').slice(0, 10);
  const fulltime = opps.filter(o => o.kind === 'fulltime').slice(0, 10);

  // Section 6 — Top 25 recommended targets
  const ranked = rankContacts(contacts, goals).slice(0, 25);
  const recommended = ranked.map(c => ({
    ...c,
    reason: reasonFor(c, goals),
    angle: angleFor(c),
  }));

  const brief: CareerBrief = { day, meetings, follow_ups, health_alerts, internships, fulltime, recommended };

  db.prepare(
    `INSERT INTO briefs (day, payload) VALUES (?, ?)
     ON CONFLICT(day) DO UPDATE SET payload = excluded.payload, generated_at = datetime('now')`
  ).run(day, JSON.stringify(brief));

  return brief;
}

function upcomingMeetings(contacts: Contact[]): CareerBrief['meetings'] {
  const todayStr = new Date().toISOString().slice(0, 10);
  return contacts
    .filter(c => c.status === 'scheduled' && (c.followup_date ?? '') >= todayStr)
    .slice(0, 6)
    .map(c => ({
      time: c.followup_date ? c.followup_date : 'TBD',
      with: `${c.name}${c.company ? ` (${c.company})` : ''}`,
      topic: c.notes?.slice(0, 80) || c.hook || 'Catch-up',
    }));
}

function reasonFor(c: Contact, goals: Goal[]): string {
  const hit = goals.find(g => (c.tags ?? []).some(t => t.toLowerCase().includes(g.label.toLowerCase().split(' ')[0])));
  const role = c.role ? `${c.role} at ${c.company || '—'}` : (c.company || '—');
  return hit ? `${role} — overlaps with ${hit.label} goal` : role;
}

function angleFor(c: Contact): string {
  if (c.warmth === 'warm' || c.status === 'completed') return 'Reconnect on shared context, propose 20-min chat.';
  if (c.warmth === 'second_degree' && c.shared_background) return `Lead with mutual: ${c.shared_background}.`;
  if (c.hook) return `Open with: ${c.hook}`;
  return c.notes ? `Reference: ${c.notes.slice(0, 80)}` : 'Open with what they shipped most recently.';
}
