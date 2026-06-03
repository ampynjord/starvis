'use client';

import { Building2, Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface Corporation { id: number; name: string; tag: string | null }

interface CorpPickerProps {
  selected: Corporation | null;
  onSelect: (corp: Corporation | null) => void;
  /** Called after a new corp is created and selected (optional) */
  onCreated?: (corp: Corporation) => void;
  disabled?: boolean;
}

export function CorpPicker({ selected, onSelect, onCreated, disabled }: CorpPickerProps) {
  const [corps, setCorps] = useState<Corporation[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTag, setNewTag] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/corporations')
      .then((r) => r.json())
      .then((d) => setCorps(d.data ?? []))
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && !creating) inputRef.current?.focus();
  }, [open, creating]);

  const filtered = corps.filter((c) => {
    const q = query.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.tag ?? '').toLowerCase().includes(q);
  });

  const handleSelect = (corp: Corporation) => {
    onSelect(corp);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
    setQuery('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreateLoading(true);
    setCreateError('');
    try {
      const res = await fetch('/api/corporations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), tag: newTag.trim().toUpperCase() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Creation failed');
      const corp = data.data as Corporation;
      setCorps((prev) => [...prev, corp]);
      onSelect(corp);
      onCreated?.(corp);
      setOpen(false);
      setCreating(false);
      setQuery('');
      setNewName('');
      setNewTag('');
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((v) => !v); setCreating(false); }}
        className="sci-input w-full flex items-center gap-2 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Building2 size={13} className="text-slate-600 shrink-0" />
        {selected ? (
          <span className="flex-1 text-sm text-slate-200 font-rajdhani truncate">
            {selected.tag ? `[${selected.tag}] ` : ''}{selected.name}
          </span>
        ) : (
          <span className="flex-1 text-sm text-slate-600">Search or create a corporation…</span>
        )}
        {selected ? (
          <X
            size={13}
            className="text-slate-600 hover:text-red-400 shrink-0 transition-colors"
            onClick={handleClear}
          />
        ) : (
          <ChevronDown size={13} className="text-slate-600 shrink-0" />
        )}
      </button>

      {/* Dropdown */}
      {open && !creating && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-slate-700/80 rounded-sm shadow-2xl">
          {/* Search input */}
          <div className="p-2 border-b border-slate-800">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or tag…"
                className="w-full bg-slate-800/80 border border-slate-700 rounded-sm pl-6 pr-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-700 transition-colors"
              />
            </div>
          </div>

          {/* Results */}
          <div className="max-h-44 overflow-y-auto">
            {filtered.length > 0 ? (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors group"
                >
                  {selected?.id === c.id && <Check size={11} className="text-cyan-400 shrink-0" />}
                  {selected?.id !== c.id && <span className="w-[11px] shrink-0" />}
                  <span className="text-sm font-rajdhani text-slate-200 flex-1 truncate">{c.name}</span>
                  {c.tag && (
                    <span className="text-[9px] font-orbitron text-slate-500 border border-slate-700 px-1 py-0.5 rounded-sm shrink-0">
                      [{c.tag}]
                    </span>
                  )}
                </button>
              ))
            ) : (
              <p className="px-3 py-2.5 text-xs text-slate-600 font-mono-sc text-center">No corporation found</p>
            )}
          </div>

          {/* Create new option */}
          <div className="border-t border-slate-800">
            <button
              type="button"
              onClick={() => { setCreating(true); setNewName(query); setNewTag(''); setCreateError(''); }}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-left text-xs text-cyan-500 hover:text-cyan-300 hover:bg-white/5 transition-colors font-mono-sc"
            >
              <Plus size={11} />
              {query ? `Create "${query}"` : 'Create a new corporation'}
            </button>
          </div>
        </div>
      )}

      {/* Inline create form */}
      {open && creating && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-slate-700/80 rounded-sm shadow-2xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-orbitron text-slate-500 uppercase tracking-widest">New Corporation</p>
            <button type="button" onClick={() => setCreating(false)} className="text-slate-600 hover:text-slate-300 transition-colors">
              <X size={13} />
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name *  (must be unique)"
              required
              minLength={2}
              className="sci-input w-full text-sm"
            />
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value.toUpperCase())}
              placeholder="Tag (e.g. STAR)  — optional, ≤10 chars"
              maxLength={10}
              className="sci-input w-full text-xs font-mono-sc"
            />
            {createError && (
              <p className="text-[10px] text-red-400 font-mono-sc">{createError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={createLoading || !newName.trim()}
                className="flex-1 py-1.5 bg-cyan-900/40 border border-cyan-700/50 hover:border-cyan-500/70 text-cyan-300 font-mono-sc text-xs rounded transition-colors disabled:opacity-40"
              >
                {createLoading ? 'Creating…' : 'Create & Join'}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="py-1.5 px-3 border border-slate-700 text-slate-500 hover:text-slate-300 font-mono-sc text-xs rounded transition-colors"
              >
                Back
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
