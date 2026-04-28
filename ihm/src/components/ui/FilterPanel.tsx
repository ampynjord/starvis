import { ChevronDown, ChevronUp, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';

interface FilterOption { label: string; value: string | number; }

interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
  value: string | number | undefined;
  onChange: (v: string) => void;
  defaultOpen?: boolean;
}

interface Props {
  groups: FilterGroup[];
  onReset?: () => void;
  hasFilters?: boolean;
  className?: string;
}

function FilterGroup({ label, options, value, onChange, defaultOpen = false }: FilterGroup) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono-sc text-slate-500 hover:text-slate-300 uppercase tracking-wider"
        onClick={() => setOpen(o => !o)}
      >
        {label}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-0.5">
          <button
            onClick={() => onChange('')}
            className={`w-full text-left px-2 py-1.5 rounded-sm text-xs transition-colors ${!value ? 'text-cyan-400 bg-cyan-950/40' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            Tous
          </button>
          {options.map((opt, idx) => (
            <button
              key={`${String(opt.value)}-${idx}`}
              onClick={() => onChange(String(opt.value))}
              className={`w-full text-left px-2 py-1.5 rounded-sm text-xs truncate transition-colors ${String(value) === String(opt.value) ? 'text-cyan-400 bg-cyan-950/40' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterPanel({ groups, onReset, hasFilters, className = '' }: Props) {
  return (
    <div className={`sci-panel overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-orbitron text-cyan-600 tracking-widest uppercase">Filtres</span>
        {hasFilters && onReset && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            <X size={10} /> Reset
          </button>
        )}
      </div>
      {groups.map(g => <FilterGroup key={g.key} label={g.label} options={g.options} value={g.value} onChange={g.onChange} />)}
    </div>
  );
}

/**
 * Wrapper mobile pour les panels de filtres.
 * Sur mobile : affiche un bouton toggle. Sur desktop (md+) : rendu inline.
 */
export function MobileFilterWrapper({ children, hasFilters }: { children: React.ReactNode; hasFilters?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className={[
          'md:hidden flex items-center gap-2 mb-3 px-3 py-1.5 rounded-sm text-xs font-mono-sc uppercase tracking-wider border transition-colors',
          open || hasFilters
            ? 'border-cyan-700 text-cyan-400 bg-cyan-950/40'
            : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500',
        ].join(' ')}
      >
        <SlidersHorizontal size={13} />
        Filtres
        {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 ml-0.5" />}
      </button>
      <div className={open ? 'block md:block' : 'hidden md:block'}>
        {children}
      </div>
    </>
  );
}
