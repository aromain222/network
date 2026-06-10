import { NextRequest, NextResponse } from 'next/server';
import { getMessages, createMessage, deleteMessage } from '@/lib/db';
import type { MessageChannel, MessageDirection } from '@/lib/types';

export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get('contact_id');
  if (!contactId) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
  return NextResponse.json(getMessages(contactId));
}

export async function POST(req: NextRequest) {
  let body: { contact_id: string; direction: MessageDirection; channel: MessageChannel; body: string; timestamp?: string; meta?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  if (!body.contact_id || !body.direction || !body.channel || !body.body) {
    return NextResponse.json({ error: 'contact_id, direction, channel, body required' }, { status: 400 });
  }
  const m = createMessage({
    contact_id: body.contact_id,
    direction: body.direction,
    channel: body.channel,
    body: body.body,
    timestamp: body.timestamp || new Date().toISOString(),
    meta: body.meta,
  });
  return NextResponse.json(m);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteMessage(id);
  return NextResponse.json({ ok: true });
}
