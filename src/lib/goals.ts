import { getDb } from './db';
import type { Goal } from './types';

export function listGoals(): Goal[] {
  return getDb().prepare('SELECT * FROM goals ORDER BY weight DESC').all() as Goal[];
}

export function activeGoals(): Goal[] {
  return getDb().prepare('SELECT * FROM goals WHERE active = 1 ORDER BY weight DESC').all() as Goal[];
}

export function setGoal(label: string, weight: number, active = true): void {
  getDb().prepare(
    `INSERT INTO goals (label, weight, active) VALUES (?, ?, ?)
     ON CONFLICT(label) DO UPDATE SET weight = excluded.weight, active = excluded.active`
  ).run(label, weight, active ? 1 : 0);
}

export function deleteGoal(id: number): void {
  getDb().prepare('DELETE FROM goals WHERE id = ?').run(id);
}
