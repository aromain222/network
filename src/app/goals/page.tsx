'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Goal } from '@/lib/types';

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [label, setLabel] = useState('');
  const [weight, setWeight] = useState('1.0');

  const load = useCallback(async () => {
    const res = await fetch('/api/goals', { cache: 'no-store' });
    if (res.ok) setGoals(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim(), weight: Number(weight), active: true }),
    });
    setLabel('');
    setWeight('1.0');
    load();
  }

  async function remove(id: number) {
    await fetch('/api/goals', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function toggle(g: Goal) {
    await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: g.label, weight: g.weight, active: !g.active }),
    });
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Career Goals</h1>
        <p className="page-subtitle">Recommendations adapt as these shift. Weights between 0.0 and 1.0.</p>
      </div>

      <form onSubmit={add} className="flex gap-2 rounded-lg border border-edge bg-surface p-3">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="New goal (e.g. Robotics)"
          className="flex-1 rounded-md border border-edge bg-bg/40 px-3 py-1.5 text-xs text-primary placeholder:text-muted"
        />
        <input
          value={weight}
          onChange={e => setWeight(e.target.value)}
          type="number"
          step="0.05"
          min="0"
          max="1"
          className="w-20 rounded-md border border-edge bg-bg/40 px-2 py-1.5 text-xs text-primary"
        />
        <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent/90">
          Add
        </button>
      </form>

      <ul className="rounded-lg border border-edge bg-surface divide-y divide-edge/60">
        {goals.map(g => (
          <li key={g.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
            <button
              onClick={() => toggle(g)}
              className={`flex-1 text-left ${g.active ? 'text-primary' : 'text-muted line-through'}`}
            >
              {g.label}
            </button>
            <span className="font-mono text-[10px] text-secondary mr-3">w {g.weight.toFixed(2)}</span>
            <button onClick={() => remove(g.id)} className="text-muted hover:text-red">
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
