import type { Contact } from './types';

export function contactsToCsv(contacts: Contact[]): string {
  const headers = ['Name', 'Company', 'Role', 'Status', 'Hook', 'Tags', 'Notes', 'Date Added'];
  const rows = contacts.map(c => [
    c.name,
    c.company,
    c.role,
    c.status,
    c.hook,
    `"${(c.tags ?? []).join(', ')}"`,
    `"${(c.notes || '').replace(/"/g, '""')}"`,
    c.dateAdded,
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}
