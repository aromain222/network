import { NextResponse } from 'next/server';
import { isAuthorizedCron, runReengagements } from '@/lib/agent';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runReengagements('cron');
  return NextResponse.json(result, { status: result.run.success ? 200 : 502 });
}

export async function POST() {
  const result = await runReengagements('manual');
  return NextResponse.json(result, { status: result.run.success ? 200 : 502 });
}
