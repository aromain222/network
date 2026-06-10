import { google } from 'googleapis';
import { getGoogleTokens, saveGoogleTokens } from './db';

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback';
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured — missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Returns an authed OAuth2 client using stored tokens, or null if not connected.
export async function getAuthedClient() {
  const tokens = getGoogleTokens();
  if (!tokens) return null;
  const client = getOAuth2Client();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || undefined,
    expiry_date: tokens.expiry_date || undefined,
    scope: tokens.scope || undefined,
  });

  // Auto-refresh: googleapis handles this if refresh_token is present; capture new access tokens
  client.on('tokens', (newTokens) => {
    saveGoogleTokens({
      access_token: newTokens.access_token || tokens.access_token,
      refresh_token: newTokens.refresh_token,
      expiry_date: newTokens.expiry_date,
      scope: newTokens.scope,
    });
  });

  return client;
}

export type GoogleEvent = {
  id: string;
  summary: string;
  start: string;       // ISO
  end: string;         // ISO
  location?: string;
  meetLink?: string;
  attendees?: { email?: string; name?: string }[];
  organizer?: string;
};

// Fetch full event objects from Google Calendar (for display)
export async function getCalendarEvents(daysAhead = 60): Promise<GoogleEvent[]> {
  const auth = await getAuthedClient();
  if (!auth) return [];
  const calendar = google.calendar({ version: 'v3', auth });
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + daysAhead * 86400000).toISOString();
  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });
    const items = res.data.items || [];
    return items
      .filter(e => e.start?.dateTime && e.end?.dateTime)
      .map(e => ({
        id: e.id || '',
        summary: e.summary || '(no title)',
        start: e.start!.dateTime!,
        end: e.end!.dateTime!,
        location: e.location || undefined,
        meetLink: e.hangoutLink || undefined,
        attendees: e.attendees?.map(a => ({ email: a.email || undefined, name: a.displayName || undefined })),
        organizer: e.organizer?.email || undefined,
      }));
  } catch (err) {
    console.error('[google] events.list failed:', err);
    return [];
  }
}

// Fetch busy time blocks from Google Calendar between now and `daysAhead` days out.
export async function getCalendarBusy(daysAhead = 30): Promise<{ start: string; end: string }[]> {
  const auth = await getAuthedClient();
  if (!auth) return [];
  const calendar = google.calendar({ version: 'v3', auth });
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + daysAhead * 86400000).toISOString();
  try {
    const res = await calendar.freebusy.query({
      requestBody: { timeMin, timeMax, items: [{ id: 'primary' }] },
    });
    return (res.data.calendars?.primary?.busy as { start: string; end: string }[]) || [];
  } catch (err) {
    console.error('[google] freebusy failed:', err);
    return [];
  }
}

// Insert a new event on the user's primary calendar. Returns the created event id or null.
export async function createCalendarEvent(args: {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  location?: string;
  attendeeEmail?: string;
}): Promise<string | null> {
  const auth = await getAuthedClient();
  if (!auth) return null;
  const calendar = google.calendar({ version: 'v3', auth });
  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: args.summary,
        description: args.description,
        location: args.location,
        start: { dateTime: args.startISO },
        end: { dateTime: args.endISO },
        attendees: args.attendeeEmail ? [{ email: args.attendeeEmail }] : undefined,
      },
    });
    return res.data.id || null;
  } catch (err) {
    console.error('[google] create event failed:', err);
    return null;
  }
}
