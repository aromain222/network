import { NextResponse } from 'next/server';
import { isAuthorizedCron, runDiscovery } from '@/lib/agent';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runDiscovery('cron');
  const status = result.run.success ? 200 : result.discovery ? 207 : 502;
  return NextResponse.json(result, { status });
}

export async function POST() {
  const result = await runDiscovery('manual');
  const status = result.run.success ? 200 : result.discovery ? 207 : 502;
  return NextResponse.json(result, { status });
}
