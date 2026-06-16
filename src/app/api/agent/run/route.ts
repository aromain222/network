import { NextResponse } from 'next/server';
import { runDiscovery, runFollowups, runReengagements } from '@/lib/agent';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST() {
  const [discovery, followup, reengage] = await Promise.all([
    runDiscovery('manual', { force: true }),
    runFollowups('manual'),
    runReengagements('manual'),
  ]);
  const success = discovery.run.success && followup.run.success && reengage.run.success;
  return NextResponse.json(
    { discovery, followup, reengage },
    { status: success ? 200 : 207 },
  );
}
