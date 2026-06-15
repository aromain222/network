import { NextRequest, NextResponse } from 'next/server';
import { deleteGoal, listGoals, setGoal } from '@/lib/goals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(listGoals());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.label || typeof body.weight !== 'number') {
    return NextResponse.json({ error: 'label and weight required' }, { status: 400 });
  }
  setGoal(body.label, body.weight, body.active ?? true);
  return NextResponse.json(listGoals());
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteGoal(Number(id));
  return NextResponse.json(listGoals());
}
