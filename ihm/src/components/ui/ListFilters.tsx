import type { ReactNode } from 'react';

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

export function ListFilterSelect({ value, onChange, options, allLabel, showAllOption = true, className = '' }: ListFilterSelectProps) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`bg-panel border border-border text-slate-400 text-xs rounded-sm px-2 py-1 min-h-8 ${className}`}
    >
      {showAllOption && <option value="">{allLabel}</option>}
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
          {typeof option.count === 'number' ? ` (${option.count.toLocaleString('en-US')})` : ''}
        </option>
      ))}
    </select>
  );
}

export function ListFilterBar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mb-4 min-w-0 overflow-x-auto pb-1 ${className}`}>
      <div className="flex w-max min-w-full gap-2 sm:flex-wrap">{children}</div>
    </div>
  );
}

export function ListFilterResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-mono-sc text-slate-400 border border-slate-800 rounded-sm hover:border-cyan-700 hover:text-cyan-300 transition-colors"
    >
      Reset
    </button>
  );
}

export function ListFilterChips({ items, selected, onSelect, allLabel = 'All', className = '' }: ListFilterChipsProps) {
  return (
    <div className={`mb-4 min-w-0 overflow-x-auto pb-1 ${className}`}>
      <div className="flex w-max min-w-full gap-1.5 sm:flex-wrap">
        <button
          type="button"
          onClick={() => onSelect('')}
          className={`px-3 py-1 rounded-sm text-xs font-mono-sc uppercase tracking-wide border transition-colors ${
            !selected
              ? 'bg-cyan-950/40 border-cyan-700 text-cyan-300'
              : 'border-border text-slate-500 hover:text-slate-300 hover:border-slate-600'
          }`}
        >
          {allLabel}
        </button>
        {items.map((item) => (
          <button
            type="button"
            key={item.key}
            onClick={() => onSelect(selected === item.key ? '' : item.key)}
            className={`px-3 py-1 rounded-sm text-xs font-mono-sc uppercase tracking-wide border transition-colors ${
              selected === item.key
                ? 'bg-cyan-950/40 border-cyan-700 text-cyan-300'
                : 'border-border text-slate-500 hover:text-slate-300 hover:border-slate-600'
            }`}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span className={selected === item.key ? 'ml-1 text-cyan-600' : 'ml-1 text-slate-700'}>
                {item.count.toLocaleString('en-US')}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
