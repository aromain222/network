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

export async function POST(request: Request) {
  // Manual triggers force a fresh batch by default; cron continues to top up.
  let force = true;
  try {
    if (request.headers.get('content-type')?.includes('json')) {
      const body = await request.json();
      if (body?.force === false) force = false;
    }
  } catch {
    // empty body is fine — default to force = true for manual triggers
  }
  const result = await runDiscovery('manual', { force });
  const status = result.run.success ? 200 : result.discovery ? 207 : 502;
  return NextResponse.json(result, { status });
}
