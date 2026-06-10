import { NextRequest, NextResponse } from 'next/server';
import { getAllContacts, createContact, updateContact, deleteContact, findContactByName } from '@/lib/db';

export async function GET() {
  return NextResponse.json(getAllContacts());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const today = new Date().toISOString().slice(0, 10);

  const existing = body.name ? findContactByName(body.name) : null;
  if (existing) {
    const updated = updateContact(existing.id, {
      last_touch_date: today,
      message_sent: body.message_sent || existing.message_sent,
      status: existing.status === 'draft' ? 'sent' : existing.status,
    });
    return NextResponse.json(updated);
  }

  const contact = createContact({
    ...body,
    tags: body.tags ?? [],
    message_sent: body.message_sent ?? '',
    linkedin_url: body.linkedin_url ?? '',
    last_touch_date: today,
  });
  return NextResponse.json(contact, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json();
  const today = new Date().toISOString().slice(0, 10);
  if (updates.status) updates.last_touch_date = today;
  if (updates.status === 'completed' && !updates.met_date) updates.met_date = today;
  const contact = updateContact(id, updates);
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(contact);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  deleteContact(id);
  return NextResponse.json({ ok: true });
}
