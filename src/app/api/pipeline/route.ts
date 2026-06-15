import { NextResponse } from 'next/server';
import { getDay, weeklyReport } from '@/lib/pipeline-metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    today: getDay(),
    weekly: weeklyReport(),
  });
}
