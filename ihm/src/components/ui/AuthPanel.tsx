import type { ElementType, ReactNode } from 'react';

interface AuthPanelProps {
  icon: ElementType;
  title: string;
  subtitle?: string;
  children: ReactNode;
  accent?: 'cyan' | 'green' | 'red';
  className?: string;
}

const ACCENT = {
  cyan: 'bg-cyan-950 border-cyan-700/40 text-cyan-400',
  green: 'bg-green-950 border-green-700/40 text-green-400',
  red: 'bg-red-950 border-red-700/40 text-red-400',
} as const;

export function AuthPanel({ icon: Icon, title, subtitle, children, accent = 'cyan', className = '' }: AuthPanelProps) {
  return (
    <div className={`sci-panel p-8 space-y-6 ${className}`}>
      <div className="text-center space-y-1">
        <div className={`w-12 h-12 rounded-sm border flex items-center justify-center mx-auto mb-4 ${ACCENT[accent]}`}>
          <Icon size={20} />
        </div>
        <h1 className="text-xl font-orbitron font-bold text-cyan-400 tracking-widest uppercase">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 font-mono-sc uppercase tracking-widest">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
