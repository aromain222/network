import { NextRequest, NextResponse } from 'next/server';
import { draftFor, listQueue } from '@/lib/outreach-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const status = (req.nextUrl.searchParams.get('status') as 'pending' | 'approved' | 'sent' | 'rejected') ?? 'pending';
  return NextResponse.json(listQueue(status));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.contact_id || !body?.channel) {
    return NextResponse.json({ error: 'contact_id and channel are required' }, { status: 400 });
  }
  if (!['email', 'linkedin', 'x'].includes(body.channel)) {
    return NextResponse.json({ error: 'channel must be email|linkedin|x' }, { status: 400 });
  }
  const draft = draftFor({ contact_id: body.contact_id, channel: body.channel });
  return NextResponse.json(draft, { status: 201 });
}
