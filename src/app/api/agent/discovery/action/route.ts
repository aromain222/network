import { NextRequest, NextResponse } from 'next/server';
import { saveDiscoveryPerson } from '@/lib/agent';
import { updateDiscovery } from '@/lib/agent-store';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest) {
  const body = await req.json() as { id?: string; action?: 'skip' | 'save' | 'pending' };
  if (!body.id || !body.action || !['skip', 'save', 'pending'].includes(body.action)) {
    return NextResponse.json({ error: 'A valid id and action are required' }, { status: 400 });
  }

  let savedContactId: string | undefined;
  let found = false;
  let discovery;
  try {
    discovery = updateDiscovery(current => {
      const people = current.people.map(person => {
        if (person.id !== body.id) return person;
        found = true;
        if (body.action === 'save') {
          if (!person.verified || !person.source_url) {
            throw new Error('This person does not have a verified source and cannot be saved');
          }
          const contact = saveDiscoveryPerson(person);
          savedContactId = contact.id;
          return {
            ...person,
            status: 'saved' as const,
            saved_to_contacts: true,
          };
        }
        if (body.action === 'pending') {
          return {
            ...person,
            status: 'pending' as const,
            saved_to_contacts: false,
          };
        }
        return {
          ...person,
          status: 'skipped' as const,
        };
      });
      const saved = people.filter(person => person.status === 'saved').length;
      const skipped = people.filter(person => person.status === 'skipped').length;
      return {
        ...current,
        people,
        stats: {
          total: people.length,
          approved: saved,
          saved,
          skipped,
        },
      };
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Could not update person',
    }, { status: 400 });
  }

  if (!discovery || !found) {
    return NextResponse.json({ error: 'Discovery person not found' }, { status: 404 });
  }
  return NextResponse.json({ discovery, saved_contact_id: savedContactId });
}
