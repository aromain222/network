import { NextResponse } from 'next/server';
import { clearGoogleTokens } from '@/lib/db';

export async function POST() {
  clearGoogleTokens();
  return NextResponse.json({ ok: true });
}
