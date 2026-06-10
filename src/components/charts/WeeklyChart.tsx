'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const data = [
  { week: 'W1', Messages: 8, Replies: 2, Calls: 1 },
  { week: 'W2', Messages: 12, Replies: 4, Calls: 2 },
  { week: 'W3', Messages: 10, Replies: 3, Calls: 2 },
  { week: 'W4', Messages: 15, Replies: 5, Calls: 3 },
  { week: 'W5', Messages: 11, Replies: 4, Calls: 2 },
  { week: 'W6', Messages: 14, Replies: 6, Calls: 4 },
];

export function WeeklyChart() {
  return (
    <div className="rounded-lg border border-edge bg-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs text-secondary">Weekly Outreach Performance</h3>
        <span className="text-[10px] text-green bg-green/10 px-2 py-0.5 rounded-full">+18% reply lift</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={30} />
          <Tooltip
            contentStyle={{ background: '#1e1e24', border: '1px solid #2a2a35', borderRadius: 8, fontSize: 12 }}
            itemStyle={{ color: '#f0f0f5' }}
            labelStyle={{ color: '#8888aa' }}
          />
          <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Line type="monotone" dataKey="Messages" stroke="#4f8ef7" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Replies" stroke="#22c55e" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Calls" stroke="#a855f7" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
