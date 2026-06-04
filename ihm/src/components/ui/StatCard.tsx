import type { ElementType, ReactNode } from 'react';

interface StatCardProps {
  icon?: ElementType;
  label: string;
  value: number | string | ReactNode;
  accent?: 'cyan' | 'purple' | 'amber' | 'emerald' | 'rose' | 'slate';
}

const ACCENT_CLASS = {
  cyan: 'text-cyan-400',
  purple: 'text-purple-400',
  amber: 'text-amber-400',
  emerald: 'text-emerald-400',
  rose: 'text-rose-400',
  slate: 'text-slate-300',
} as const;

export function StatCard({ icon: Icon, label, value, accent = 'slate' }: StatCardProps) {
  return (
    <div className="sci-panel border border-slate-800/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
        {Icon && <Icon size={10} />}
        {label}
      </p>
      <p className={`mt-0.5 font-orbitron text-lg font-black ${ACCENT_CLASS[accent]}`}>{value}</p>
    </div>
  );
}

export function StatGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${className}`}>{children}</div>;
}
