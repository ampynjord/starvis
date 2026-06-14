import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

type EarlyAccessNoticeProps = {
  title?: string;
  children?: ReactNode;
  className?: string;
};

export function EarlyAccessNotice({
  title = 'Early access data',
  children = 'Some values can be incomplete, outdated or inaccurate while extraction, normalization and validation improve.',
  className = '',
}: EarlyAccessNoticeProps) {
  return (
    <div className={`rounded-sm border border-amber-800/45 bg-amber-950/10 px-3 py-2 ${className}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
        <div className="min-w-0">
          <p className="font-orbitron text-[9px] font-bold uppercase tracking-widest text-amber-300">{title}</p>
          <p className="mt-1 font-rajdhani text-xs leading-relaxed text-slate-500">{children}</p>
        </div>
      </div>
    </div>
  );
}
