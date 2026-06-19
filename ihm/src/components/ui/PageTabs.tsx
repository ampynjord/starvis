import type { ReactNode } from 'react';

export interface PageTabItem {
  value: string;
  label: string;
  count?: number | null;
  icon?: ReactNode;
}

interface PageTabsProps {
  items: PageTabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function PageTabs({ items, value, onChange, className = '' }: PageTabsProps) {
  return (
    <div className={`min-w-0 overflow-x-auto border-b border-slate-800 ${className}`}>
      <div className="flex w-max min-w-full gap-1">
        {items.map((item) => {
          const active = value === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2 text-xs font-mono-sc uppercase tracking-wider transition-colors ${
                active ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {item.icon}
              {item.label}
              {item.count != null && (
                <span className={active ? 'text-cyan-600' : 'text-slate-700'}>
                  {item.count.toLocaleString('en-US')}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
