import cron from 'node-cron';

const appUrl = process.env.APP_URL || 'http://localhost:3001';
const cronSecret = process.env.CRON_SECRET;

async function run(path) {
  const response = await fetch(`${appUrl}${path}`, {
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`[agent scheduler] ${path} failed (${response.status}): ${body}`);
    return;
  }
  console.log(`[agent scheduler] ${path} completed at ${new Date().toISOString()}`);
}

const options = { timezone: 'America/Los_Angeles' };
const briefOptions = { timezone: process.env.BRIEF_TZ || 'America/New_York' };

async function runBrief() {
  const response = await fetch(`${appUrl}/api/brief`, {
    method: 'POST',
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`[agent scheduler] /api/brief failed (${response.status}): ${body}`);
    return;
  }
  console.log(`[agent scheduler] /api/brief completed at ${new Date().toISOString()}: ${body}`);
}

cron.schedule('0 10 * * *', () => run('/api/agent/discovery'), options);
cron.schedule('0 9 * * 1', () => run('/api/agent/followup'), options);
cron.schedule('0 9 * * 0', () => run('/api/agent/reengage'), options);
cron.schedule('30 8 * * 1-5', runBrief, briefOptions);

console.log(`[agent scheduler] running against ${appUrl}`);
console.log('[agent scheduler] discovery daily at 10:00 AM PT');
console.log('[agent scheduler] follow-up Monday at 9:00 AM PT');
console.log('[agent scheduler] re-engagement Sunday at 9:00 AM PT');
console.log(`[agent scheduler] morning brief weekdays at 8:30 AM ${briefOptions.timezone}`);
