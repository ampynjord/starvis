import type { ReactNode } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';

export interface ListFilterOption {
  value: string | number;
  label: ReactNode;
  count?: number | null;
}

interface ListFilterSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: ListFilterOption[];
  allLabel: string;
  showAllOption?: boolean;
  className?: string;
}

interface ListFilterChipsProps {
  items: { key: string; label: ReactNode; count?: number | null }[];
  selected: string;
  onSelect: (value: string) => void;
  allLabel?: string;
  className?: string;
}

export function ListFilterSelect({
  value,
  onChange,
  options,
  allLabel,
  showAllOption = true,
  className = '',
}: ListFilterSelectProps) {
  const isSelected = value !== '' && value !== undefined;

  return (
    <div className={`relative inline-flex items-center min-w-[140px] sm:min-w-[160px] ${className}`}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full appearance-none pl-3 pr-8 py-2 rounded-lg text-xs font-mono-sc transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-500/50 ${
          isSelected
            ? 'bg-cyan-950/70 border border-cyan-500/60 text-cyan-200 font-semibold shadow-sm shadow-cyan-950/50'
            : 'bg-slate-950/80 border border-slate-800/90 text-slate-300 hover:border-cyan-500/40 hover:text-white'
        }`}
      >
        {showAllOption && <option value="" className="bg-slate-950 text-slate-300">{allLabel}</option>}
        {options.map((option) => (
          <option
            key={String(option.value)}
            value={String(option.value)}
            className="bg-slate-950 text-slate-200"
          >
            {option.label}
            {typeof option.count === 'number' ? ` (${option.count.toLocaleString('en-US')})` : ''}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className={`absolute right-2.5 pointer-events-none transition-colors ${
          isSelected ? 'text-cyan-400' : 'text-slate-500'
        }`}
      />
    </div>
  );
}

export function ListFilterBar({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`p-3 rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md mb-6 shadow-sm overflow-x-auto ${className}`}
    >
      <div className="flex w-max min-w-full items-center gap-2.5 sm:flex-wrap">
        {children}
      </div>
    </div>
  );
}

export function ListFilterResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono-sc text-slate-400 hover:text-red-300 bg-slate-950/60 border border-slate-800 hover:border-red-500/50 hover:bg-red-950/30 transition-all shrink-0 ml-auto"
      title="Reset all filters"
    >
      <RotateCcw size={12} />
      <span>Reset</span>
    </button>
  );
}

export function ListFilterChips({
  items,
  selected,
  onSelect,
  allLabel = 'All',
  className = '',
}: ListFilterChipsProps) {
  return (
    <div className={`mb-5 min-w-0 overflow-x-auto pb-1 ${className}`}>
      <div className="flex w-max min-w-full gap-1.5 sm:flex-wrap items-center">
        <button
          type="button"
          onClick={() => onSelect('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono-sc uppercase tracking-wider border transition-all ${
            !selected
              ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300 font-bold shadow-sm shadow-cyan-950/50'
              : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-white hover:border-slate-700'
          }`}
        >
          {allLabel}
        </button>
        {items.map((item) => {
          const isItemActive = selected === item.key;
          return (
            <button
              type="button"
              key={item.key}
              onClick={() => onSelect(isItemActive ? '' : item.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono-sc uppercase tracking-wider border transition-all ${
                isItemActive
                  ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300 font-bold shadow-sm shadow-cyan-950/50'
                  : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <span>{item.label}</span>
              {typeof item.count === 'number' && (
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] tabular-nums font-bold ${
                    isItemActive
                      ? 'bg-cyan-500/30 text-cyan-200'
                      : 'bg-slate-900 text-slate-500'
                  }`}
                >
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
