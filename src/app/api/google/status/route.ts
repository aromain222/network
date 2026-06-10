import { NextResponse } from 'next/server';
import { getGoogleTokens } from '@/lib/db';

export async function GET() {
  const tokens = getGoogleTokens();
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!tokens) return NextResponse.json({ connected: false, configured });
  return NextResponse.json({ connected: true, configured, email: tokens.email, connected_at: tokens.connected_at });
}
