'use client';

import { getInitials, getAvatarColor } from '@/lib/utils';

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = getInitials(name);
  const color = getAvatarColor(name);
  const fontSize = size < 28 ? 9 : size < 36 ? 11 : 13;

  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-medium shrink-0"
      style={{ width: size, height: size, backgroundColor: color, fontSize }}
    >
      {initials}
    </div>
  );
}
