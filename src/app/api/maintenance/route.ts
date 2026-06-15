import { NextResponse } from 'next/server';
import { scanDormantRelationships } from '@/lib/maintenance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(scanDormantRelationships());
}
