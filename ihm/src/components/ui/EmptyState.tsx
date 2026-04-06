import type { ReactNode } from 'react';

interface Props { icon?: ReactNode; title?: string; message?: string; }

export function EmptyState({ icon, title = 'No results', message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {icon && <div className="text-slate-700 text-4xl">{icon}</div>}
      <p className="font-orbitron text-slate-500 text-sm tracking-widest uppercase">{title}</p>
      {message && <p className="text-xs text-slate-600 max-w-xs">{message}</p>}
    </div>
  );
}
