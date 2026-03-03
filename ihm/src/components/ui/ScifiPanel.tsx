import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function ScifiPanel({ children, className = '', title, subtitle, actions }: Props) {
  return (
    <div className={`sci-panel p-4 ${className}`}>
      {(title ?? actions) && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            {title && (
              <h2 className="font-orbitron text-sm font-bold text-cyan-400 tracking-widest uppercase">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5 font-mono-sc">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
