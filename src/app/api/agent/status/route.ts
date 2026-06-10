import { NextResponse } from 'next/server';
import {
  getFollowupCandidates,
  getReengagementCandidates,
} from '@/lib/agent';
import {
  getAllContacts,
} from '@/lib/db';
import {
  getDiscovery,
  getLastAgentRuns,
  getPersistenceWarning,
} from '@/lib/agent-store';
import type { AgentStatus } from '@/lib/agent-types';

export const runtime = 'nodejs';

export async function GET() {
  const latest = getLastAgentRuns();
  const lastRuns = Object.fromEntries(
    latest.map(run => [run.kind, run]),
  ) as AgentStatus['last_runs'];
  const discovery = getDiscovery();
  const status: AgentStatus = {
    discovery: discovery?.generated_at ? discovery : null,
    last_runs: lastRuns,
    followups_due: getFollowupCandidates().length,
    reengagements_due: getReengagementCandidates().length,
    email_configured: Boolean(process.env.RESEND_API_KEY),
    legacy_discovery_contacts: getAllContacts().filter(contact =>
      contact.tags.includes('Agent discovery')
      && contact.notes.includes('AI-suggested lead'),
    ).length,
    persistence_warning: getPersistenceWarning(),
  };
  return NextResponse.json(status);
}
