'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export function GoalChart({ contacted }: { contacted: number }) {
  const goal = 50;
  const pct = Math.round((contacted / goal) * 100);
  const data = [
    { value: contacted },
    { value: Math.max(0, goal - contacted) },
  ];

  return (
    <div className="rounded-lg border border-edge bg-surface p-4 flex flex-col items-center">
      <h3 className="text-xs text-secondary mb-2 self-start">Monthly Goal</h3>
      <div className="relative">
        <ResponsiveContainer width={130} height={130}>
          <PieChart>
            <Pie data={data} innerRadius={42} outerRadius={58} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
              <Cell fill="#4f8ef7" />
              <Cell fill="#2a2a35" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl text-primary font-light">{pct}%</span>
        </div>
      </div>
      <p className="text-[10px] text-muted mt-2">{contacted} of {goal} outreach actions</p>
    </div>
  );
}
