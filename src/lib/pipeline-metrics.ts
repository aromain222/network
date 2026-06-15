import { getDb, today } from './db';
import type { PipelineMetrics } from './types';

export type MetricKey = keyof Omit<PipelineMetrics, 'day'>;

export function incrementMetric(key: MetricKey, by = 1, day = today()): void {
  const db = getDb();
  db.prepare('INSERT INTO metrics_daily (day) VALUES (?) ON CONFLICT(day) DO NOTHING').run(day);
  db.prepare(`UPDATE metrics_daily SET ${key} = ${key} + ? WHERE day = ?`).run(by, day);
}

export function getDay(day = today()): PipelineMetrics {
  const row = getDb()
    .prepare('SELECT * FROM metrics_daily WHERE day = ?')
    .get(day) as PipelineMetrics | undefined;
  return row ?? {
    day,
    prospects_discovered: 0,
    outreach_sent: 0,
    replies_received: 0,
    meetings_scheduled: 0,
    meetings_completed: 0,
    referrals_received: 0,
    opportunities_generated: 0,
  };
}

export function weeklyReport(): {
  week_of: string;
  totals: Omit<PipelineMetrics, 'day'>;
  by_day: PipelineMetrics[];
} {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const rows = getDb()
    .prepare('SELECT * FROM metrics_daily WHERE day BETWEEN ? AND ? ORDER BY day ASC')
    .all(startStr, endStr) as PipelineMetrics[];

  const totals = rows.reduce(
    (acc, r) => {
      acc.prospects_discovered += r.prospects_discovered;
      acc.outreach_sent += r.outreach_sent;
      acc.replies_received += r.replies_received;
      acc.meetings_scheduled += r.meetings_scheduled;
      acc.meetings_completed += r.meetings_completed;
      acc.referrals_received += r.referrals_received;
      acc.opportunities_generated += r.opportunities_generated;
      return acc;
    },
    {
      prospects_discovered: 0,
      outreach_sent: 0,
      replies_received: 0,
      meetings_scheduled: 0,
      meetings_completed: 0,
      referrals_received: 0,
      opportunities_generated: 0,
    }
  );

  return { week_of: startStr, totals, by_day: rows };
}
