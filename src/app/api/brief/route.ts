import { NextResponse } from 'next/server';
import { generateBrief } from '@/lib/brief';
import { scanDormantRelationships } from '@/lib/maintenance';
import { draftBatch } from '@/lib/outreach-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const brief = await generateBrief();
  return NextResponse.json(brief);
}

/**
 * POST = run the full 8:30 AM morning routine.
 * Generates the brief, pre-drafts outreach for the top 10 recommended, and surfaces dormant alerts.
 * Never auto-sends — all outreach lands in /api/outreach/queue for approval.
 */
export async function POST() {
  const brief = await generateBrief();
  const dormant = scanDormantRelationships();
  const top10 = brief.recommended.slice(0, 10).map(c => c.id);
  const drafts = draftBatch(top10, 'linkedin');

  return NextResponse.json({
    brief_day: brief.day,
    recommended_count: brief.recommended.length,
    dormant_alerts: dormant.length,
    drafted_outreach: drafts.length,
  });
}
