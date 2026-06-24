'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2, ArrowRight } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useEnv } from '@/contexts/EnvContext';

// Simple types based on typical unifiedSearch response structure
type SearchResult = {
  ships: { uuid: string; name: string }[];
  components: { uuid: string; name: string }[];
  items: { uuid: string; name: string }[];
  commodities: { uuid: string; name: string }[];
  missions: { uuid: string; name: string }[];
  recipes: { uuid: string; name: string }[];
};

export function SearchOmnibar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const debouncedQuery = useDebounce(query, 300);
  const router = useRouter();
  const { env } = useEnv();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults(null);
    }
  }, [open]);

  // Handle escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Fetch results
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults(null);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);

    fetch(`/api/v1/search?search=` + encodeURIComponent(debouncedQuery) + '&env=' + env)
      .then(res => res.json())
      .then(res => {
        if (!isCancelled && res.success) {
          setResults(res.data);
        }
      })
      .catch(err => console.error('Search failed', err))
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [debouncedQuery, env]);

  if (!open) return null;

  const navigateTo = (url: string) => {
    router.push(url);
    onClose();
  };

  const hasResults = results && (
    results.ships.length > 0 ||
    results.components.length > 0 ||
    results.items.length > 0 ||
    results.commodities.length > 0
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start pt-[15vh] px-4 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Input area */}
        <div className="flex items-center px-4 py-3 border-b border-slate-800 bg-slate-950">
          <Search size={20} className="text-cyan-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-slate-200 placeholder-slate-600 px-3 py-1 font-rajdhani text-lg"
            placeholder="Search ships, items, components... (Ctrl+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isLoading && <Loader2 size={18} className="text-slate-500 animate-spin shrink-0" />}
          <button onClick={onClose} className="ml-2 text-slate-500 hover:text-slate-300 p-1 rounded-xs hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Results area */}
        <div className="overflow-y-auto p-2">
          {query.length < 2 && (
            <div className="p-8 text-center text-slate-500 font-mono-sc text-[11px] uppercase tracking-widest">
              Type at least 2 characters to search
            </div>
          )}

          {query.length >= 2 && !isLoading && !hasResults && (
            <div className="p-8 text-center text-slate-500 font-mono-sc text-[11px] uppercase tracking-widest">
              No matching database entries found for "{query}"
            </div>
          )}

          {hasResults && (
            <div className="space-y-1 pb-2">
              {results.ships?.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-1 text-[10px] font-orbitron font-bold text-cyan-700 tracking-widest uppercase">Ships & Vehicles</div>
                  {results.ships.map(s => (
                    <button
                      key={s.uuid}
                      onClick={() => navigateTo(`/ships/${s.uuid}`)}
                      className="w-full text-left px-3 py-2 flex items-center justify-between text-slate-300 hover:bg-cyan-950/40 hover:text-cyan-400 group rounded-xs transition-colors"
                    >
                      <span className="font-rajdhani">{s.name}</span>
                      <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}

              {results.items?.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-1 text-[10px] font-orbitron font-bold text-teal-700 tracking-widest uppercase">FPS Items</div>
                  {results.items.map(i => (
                    <button
                      key={i.uuid}
                      onClick={() => navigateTo(`/items/${i.uuid}`)}
                      className="w-full text-left px-3 py-2 flex items-center justify-between text-slate-300 hover:bg-teal-950/40 hover:text-teal-400 group rounded-xs transition-colors"
                    >
                      <span className="font-rajdhani">{i.name}</span>
                      <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}

              {results.components?.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-1 text-[10px] font-orbitron font-bold text-purple-700 tracking-widest uppercase">Components</div>
                  {results.components.map(c => (
                    <button
                      key={c.uuid}
                      onClick={() => navigateTo(`/components/${c.uuid}`)}
                      className="w-full text-left px-3 py-2 flex items-center justify-between text-slate-300 hover:bg-purple-950/40 hover:text-purple-400 group rounded-xs transition-colors"
                    >
                      <span className="font-rajdhani">{c.name}</span>
                      <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}

              {results.commodities?.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-1 text-[10px] font-orbitron font-bold text-amber-700 tracking-widest uppercase">Commodities</div>
                  {results.commodities.map(c => (
                    <button
                      key={c.uuid}
                      onClick={() => navigateTo(`/commodities/${c.uuid}`)}
                      className="w-full text-left px-3 py-2 flex items-center justify-between text-slate-300 hover:bg-amber-950/40 hover:text-amber-400 group rounded-xs transition-colors"
                    >
                      <span className="font-rajdhani">{c.name}</span>
                      <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
