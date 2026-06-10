import { NextRequest, NextResponse } from 'next/server';
import { getOAuth2Client, SCOPES } from '@/lib/google';

export async function GET(req: NextRequest) {
  try {
    const client = getOAuth2Client();
    const hint = req.nextUrl.searchParams.get('email') || undefined;
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account consent', // force account picker every time
      scope: SCOPES,
      login_hint: hint,
    });
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
