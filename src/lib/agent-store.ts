import fs from 'fs';
import path from 'path';
import type { AgentLog, AgentRun, DiscoveryData } from './agent-types';

const DATA_DIR = process.env.AGENT_DATA_DIR
  ? path.resolve(process.env.AGENT_DATA_DIR)
  : path.join(process.cwd(), 'data');

const DISCOVERY_PATH = path.join(DATA_DIR, 'discovery.json');
const LOG_PATH = path.join(DATA_DIR, 'agent_log.json');

const EMPTY_LOG: AgentLog = { runs: [] };

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureDataDir();
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

export function getDiscovery(): DiscoveryData | null {
  const discovery = readJson<DiscoveryData | null>(DISCOVERY_PATH, null);
  if (!discovery) return null;
  return {
    ...discovery,
    people: discovery.people.map(person => ({
      ...person,
      verified: Boolean(person.source_url && person.verified),
    })),
  };
}

export function saveDiscovery(discovery: DiscoveryData): DiscoveryData {
  writeJson(DISCOVERY_PATH, discovery);
  return discovery;
}

export function updateDiscovery(
  updater: (current: DiscoveryData) => DiscoveryData,
): DiscoveryData | null {
  const current = getDiscovery();
  if (!current) return null;
  const updated = updater(current);
  writeJson(DISCOVERY_PATH, updated);
  return updated;
}

export function getAgentLog(): AgentLog {
  return readJson<AgentLog>(LOG_PATH, EMPTY_LOG);
}

export function appendAgentRun(run: AgentRun): AgentRun {
  const log = getAgentLog();
  log.runs.unshift(run);
  log.runs = log.runs.slice(0, 200);
  writeJson(LOG_PATH, log);
  return run;
}

export function getLastAgentRuns(): AgentLog['runs'] {
  const runs = getAgentLog().runs;
  const seen = new Set<string>();
  const result = runs.filter(run => {
    if (!run.success || seen.has(run.kind)) return false;
    seen.add(run.kind);
    return true;
  });
  for (const run of runs) {
    if (seen.has(run.kind)) continue;
    seen.add(run.kind);
    result.push(run);
  }
  return result;
}

export function getPersistenceWarning(): string | undefined {
  if (process.env.VERCEL && !process.env.AGENT_DATA_DIR) {
    return 'Agent files and the current SQLite database are not durable on Vercel serverless storage. Configure persistent storage before relying on scheduled production runs.';
  }
  return undefined;
}
