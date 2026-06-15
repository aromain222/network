import { NextRequest, NextResponse } from 'next/server';
import { approveDraft, listQueue, rejectDraft } from '@/lib/outreach-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const status = (req.nextUrl.searchParams.get('status') as 'pending' | 'approved' | 'sent' | 'rejected') ?? 'pending';
  return NextResponse.json(listQueue(status));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (body.action === 'approve') return NextResponse.json(approveDraft(id));
  if (body.action === 'reject') return NextResponse.json(rejectDraft(id));
  return NextResponse.json({ error: 'action must be approve|reject' }, { status: 400 });
}
