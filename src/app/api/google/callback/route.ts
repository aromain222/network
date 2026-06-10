import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getOAuth2Client } from '@/lib/google';
import { saveGoogleTokens } from '@/lib/db';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');
  if (error || !code) {
    return NextResponse.redirect(new URL(`/settings?google=error&msg=${error || 'no_code'}`, req.url));
  }

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    let email: string | null = null;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const userInfo = await oauth2.userinfo.get();
      email = userInfo.data.email || null;
    } catch { /* email is optional */ }

    saveGoogleTokens({
      access_token: tokens.access_token || '',
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      email,
    });

    return NextResponse.redirect(new URL('/settings?google=connected', req.url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.redirect(new URL(`/settings?google=error&msg=${encodeURIComponent(msg)}`, req.url));
  }
}
