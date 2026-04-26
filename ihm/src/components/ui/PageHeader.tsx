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
}: Props) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-slate-600 mt-0.5 font-mono-sc">{subtitle}</p>
        )}
        {count != null && (
          <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">
            {count.toLocaleString('en-US')} {countLabel}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {actions}
        {onSearch && (
          <div className="relative w-72">
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
    </div>
  );
}
