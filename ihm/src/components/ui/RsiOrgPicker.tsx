'use client';

import { ChevronDown, Search, Users, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface RsiOrg {
  symbol: string;
  name: string;
  logoUrl: string | null;
  archetype: string | null;
  language: string | null;
  commitment: string | null;
  recruiting: boolean;
  roleplay: boolean;
  memberCount: number | null;
}

interface RsiOrgPickerProps {
  selected: RsiOrg | null;
  onSelect: (org: RsiOrg | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ARCHETYPE_COLOR: Record<string, string> = {
  Organization: 'text-cyan-400',
  Corporation:  'text-blue-400',
  PMC:          'text-orange-400',
  Syndicate:    'text-red-400',
  Faith:        'text-violet-400',
  Club:         'text-green-400',
};

function OrgLogo({ org, size = 8 }: { org: RsiOrg; size?: number }) {
  const [err, setErr] = useState(false);
  const cls = `w-${size} h-${size} rounded-sm object-cover bg-slate-800`;
  if (org.logoUrl && !err) {
    return <img src={org.logoUrl} alt={org.symbol} className={cls} onError={() => setErr(true)} />;
  }
  return (
    <div className={`${cls} flex items-center justify-center`}>
      <span className="text-[9px] font-orbitron text-slate-500 font-bold truncate px-0.5">{org.symbol.slice(0, 3)}</span>
    </div>
  );
}

function OrgRow({ org, onSelect, compact }: { org: RsiOrg; onSelect: () => void; compact?: boolean }) {
  const archetypeColor = ARCHETYPE_COLOR[org.archetype ?? ''] ?? 'text-slate-500';
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors group"
    >
      <OrgLogo org={org} size={7} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{org.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[9px] font-orbitron text-slate-600 border border-slate-800 px-1 py-0.5 rounded-sm">[{org.symbol}]</span>
          {org.archetype && <span className={`text-[9px] font-mono-sc ${archetypeColor}`}>{org.archetype}</span>}
        </div>
      </div>
      {!compact && org.memberCount !== null && (
        <div className="flex items-center gap-1 text-[10px] text-slate-600 shrink-0">
          <Users size={10} />
          {org.memberCount.toLocaleString()}
        </div>
      )}
    </button>
  );
}

export function RsiOrgPicker({ selected, onSelect, disabled, placeholder = 'Search your RSI org by name or tag…' }: RsiOrgPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RsiOrg[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rsi-orgs?q=${encodeURIComponent(q)}&pageSize=10`);
      const data = await res.json();
      setResults(data?.data?.orgs ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 400);
  };

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    if (results.length === 0) doSearch(query);
  };

  const handleSelect = (org: RsiOrg) => {
    onSelect(org);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
    setResults([]);
    setQuery('');
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className="sci-input w-full flex items-center gap-2 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[38px]"
      >
        {selected ? (
          <>
            <OrgLogo org={selected} size={6} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-rajdhani font-semibold text-slate-200 truncate block">{selected.name}</span>
              <span className="text-[9px] font-orbitron text-slate-500">[{selected.symbol}]</span>
            </div>
            <X
              size={13}
              className="text-slate-600 hover:text-red-400 shrink-0 transition-colors"
              onClick={handleClear}
            />
          </>
        ) : (
          <>
            <Search size={13} className="text-slate-600 shrink-0" />
            <span className="flex-1 text-sm text-slate-600 truncate">{placeholder}</span>
            <ChevronDown size={13} className="text-slate-600 shrink-0" />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-slate-700/80 rounded-sm shadow-2xl">
          {/* Search input */}
          <div className="p-2 border-b border-slate-800">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                ref={inputRef}
                value={query}
                onChange={handleQueryChange}
                placeholder="Name or tag (e.g. TEST)…"
                className="w-full bg-slate-800/80 border border-slate-700 rounded-sm pl-6 pr-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-700 transition-colors"
              />
              {loading && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-600 font-mono-sc">…</span>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="max-h-64 overflow-y-auto">
            {results.length === 0 && !loading ? (
              <p className="px-3 py-4 text-xs text-slate-600 font-mono-sc text-center">
                {query ? 'No organization found' : 'Type to search RSI organizations…'}
              </p>
            ) : (
              results.map((org) => (
                <OrgRow key={org.symbol} org={org} onSelect={() => handleSelect(org)} />
              ))
            )}
          </div>

          <div className="border-t border-slate-800 px-3 py-1.5">
            <p className="text-[9px] text-slate-700 font-mono-sc">Live data from RSI — 80 000+ organizations</p>
          </div>
        </div>
      )}
    </div>
  );
}
