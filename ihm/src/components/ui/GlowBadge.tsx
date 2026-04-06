import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  color?: 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate';
  className?: string;
  size?: 'xs' | 'sm';
}

const COLOR_MAP = {
  cyan:   'text-cyan-400 border-cyan-800 bg-cyan-950/50',
  amber:  'text-amber-400 border-amber-800 bg-amber-950/50',
  green:  'text-green-400 border-green-800 bg-green-950/50',
  red:    'text-red-400 border-red-800 bg-red-950/50',
  purple: 'text-purple-400 border-purple-800 bg-purple-950/50',
  slate:  'text-slate-400 border-slate-700 bg-slate-900/50',
};

export function GlowBadge({ children, color = 'slate', className = '', size = 'xs' }: Props) {
  return (
    <span className={`sci-badge ${COLOR_MAP[color]} ${size === 'xs' ? 'text-xs' : 'text-sm'} ${className}`}>
      {children}
    </span>
  );
}
