import type { ReactNode } from 'react';
export default function Badge({
  children,
  tone = 'green',
}: {
  children: ReactNode;
  tone?: 'green' | 'neutral' | 'amber';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
