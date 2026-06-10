# Network HQ

Personal networking CRM with AI-assisted outreach, scheduling, and autonomous discovery/follow-up agents.

## Getting Started

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js.

## Autonomous Agents

Network HQ includes three routines:

- Discovery: daily at 10:00 AM Pacific
- Follow-up: Monday at 9:00 AM Pacific
- Re-engagement: Sunday at 9:00 AM Pacific

Required server environment variables:

```bash
ANTHROPIC_API_KEY=
RESEND_API_KEY=
AGENT_EMAIL=averyromain5@gmail.com
AGENT_FROM_EMAIL="Network HQ <network@your-verified-domain.com>"
APP_URL=http://localhost:3001
CRON_SECRET=
```

`AGENT_FROM_EMAIL` must use a sender or domain verified in Resend. Without `RESEND_API_KEY`, agent runs still save results and show an email warning in the app.

Vercel schedules are configured in `vercel.json`. The fixed UTC schedules match Pacific daylight time; during Pacific standard time they run one hour earlier. For a DST-aware local scheduler, run:

```bash
npm run agent:scheduler
```

The local scheduler expects the Next.js app to already be running at `APP_URL`.

## Persistence

The CRM currently uses SQLite at `data/network.db`; agent output uses `data/discovery.json` and `data/agent_log.json`. These local files work for local or persistent-server deployments, but Vercel serverless filesystems are not durable. Scheduled production use on Vercel requires moving CRM and agent storage to a persistent database or object store.
