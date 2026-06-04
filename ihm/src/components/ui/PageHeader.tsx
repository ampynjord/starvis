import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  count?: number | null;
  countLabel?: string;
  search?: string;
  searchPlaceholder?: string;
  onSearch?: (v: string) => void;
  actions?: ReactNode;
  eyebrow?: string;
}

export function PageHeader({
  title,
  subtitle,
  count,
  countLabel = 'results',
  search,
  searchPlaceholder = 'Search…',
  onSearch,
  actions,
  eyebrow,
}: Props) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/70 pb-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 font-mono-sc text-[9px] uppercase tracking-[0.28em] text-cyan-700">
            {eyebrow}
          </p>
        )}
        <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 max-w-2xl text-xs text-slate-600 font-mono-sc">{subtitle}</p>
        )}
        {count != null && (
          <p className="mt-0.5 text-sm text-slate-500 font-mono-sc">
            {count.toLocaleString('en-US')} {countLabel}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {onSearch && (
          <div className="relative w-full sm:w-72">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
              size={13}
            />
            <input
              type="text"
              value={search ?? ''}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="sci-input w-full pl-8 text-xs"
            />
          </div>
        )}
      </div>
    </header>
  );
}
