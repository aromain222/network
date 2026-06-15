import { getAllContacts } from './db';
import type { Contact } from './types';

export const DORMANT_THRESHOLD_DAYS = 60;

export type MaintenanceAlert = {
  contact: Contact;
  days_since: number;
  recommendation: 'reconnect' | 'let_rest';
  suggested_message: string;
};

export function scanDormantRelationships(): MaintenanceAlert[] {
  const contacts = getAllContacts();
  const now = Date.now();
  const alerts: MaintenanceAlert[] = [];

  for (const c of contacts) {
    const lastTouch = c.last_touch_date || c.met_date || c.dateAdded;
    if (!lastTouch) continue;
    const days = Math.floor((now - new Date(lastTouch).getTime()) / 86400000);
    if (days < DORMANT_THRESHOLD_DAYS) continue;
    if (c.status !== 'completed' && c.status !== 'scheduled' && c.status !== 'replied') continue;

    alerts.push({
      contact: c,
      days_since: days,
      recommendation: (c.tier === 1 || c.warmth === 'warm' || c.status === 'completed') ? 'reconnect' : 'let_rest',
      suggested_message: writeReconnect(c, days),
    });
  }

  return alerts.sort((a, b) => b.days_since - a.days_since);
}

function writeReconnect(c: Contact, days: number): string {
  const first = c.name.split(' ')[0];
  return [
    `Hey ${first},`,
    '',
    `It's been ${days} days since we last talked. I've been deep in AI / FDE work and thought of you when I saw ${c.company || 'your team'} ship recently.`,
    '',
    'Open to a 15-minute catch-up in the next two weeks?',
    '',
    '— Avery',
  ].join('\n');
}
