import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ChevronRight } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import { useEnv } from '@/contexts/EnvContext';

export function TopBar() {
  const { env } = useEnv();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results } = useQuery({
    queryKey: ['search', debouncedQuery, env],
    queryFn: () => api.search(debouncedQuery, 5, env),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const { data: version } = useQuery({
    queryKey: ['version', env],
    queryFn: () => api.stats.version(env),
    staleTime: 10 * 60_000,
  });

  const handleSelect = useCallback((type: string, uuid: string) => {
    setQuery('');
    setOpen(false);
    navigate(`/${type}/${uuid}`);
  }, [navigate]);

  const handleSeeAll = useCallback(() => {
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }, [navigate, query]);

  const hasResults = results && (
    results.ships.length + results.components.length + results.items.length +
    (results.commodities?.length ?? 0) + (results.missions?.length ?? 0) + (results.recipes?.length ?? 0) > 0
  );

  return (
    <header className="h-14 flex items-center gap-4 px-4 border-b border-border bg-panel/60 backdrop-blur z-10">
      {/* Search */}
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search ships, components, items…"
          className="sci-input w-full pl-8 pr-8 text-xs"
        />
        {query && (
          <button onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
            <X size={13} />
          </button>
        )}

        <AnimatePresence>
          {open && hasResults && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full mt-1 left-0 right-0 sci-panel z-50 overflow-hidden"
            >
              {results.ships.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-mono-sc text-cyan-700 border-b border-border/50">
                    SHIPS
                  </div>
                  {results.ships.map(s => (
                    <button
                      key={s.uuid}
                      onMouseDown={() => handleSelect('ships', s.uuid)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-cyan-950/40 text-left transition-colors"
                    >
                      <span className="text-sm text-slate-300">{s.name}</span>
                      <ChevronRight size={12} className="text-slate-600" />
                    </button>
                  ))}
                </>
              )}
              {results.components.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-mono-sc text-cyan-700 border-t border-b border-border/50">
                    COMPONENTS
                  </div>
                  {results.components.map(c => (
                    <button
                      key={c.uuid}
                      onMouseDown={() => handleSelect('components', c.uuid)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-cyan-950/40 text-left transition-colors"
                    >
                      <span className="text-sm text-slate-300">{c.name}</span>
                      <ChevronRight size={12} className="text-slate-600" />
                    </button>
                  ))}
                </>
              )}
              {results.items.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-mono-sc text-cyan-700 border-t border-b border-border/50">
                    ITEMS
                  </div>
                  {results.items.map(i => (
                    <button
                      key={i.uuid}
                      onMouseDown={() => handleSelect('items', i.uuid)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-cyan-950/40 text-left transition-colors"
                    >
                      <span className="text-sm text-slate-300">{i.name}</span>
                      <ChevronRight size={12} className="text-slate-600" />
                    </button>
                  ))}
                </>
              )}
              {results.commodities && results.commodities.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-mono-sc text-cyan-700 border-t border-b border-border/50">
                    COMMODITIES
                  </div>
                  {results.commodities.map(c => (
                    <button
                      key={c.uuid}
                      onMouseDown={() => handleSelect('commodities', c.uuid)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-cyan-950/40 text-left transition-colors"
                    >
                      <span className="text-sm text-slate-300">{c.name}</span>
                      <ChevronRight size={12} className="text-slate-600" />
                    </button>
                  ))}
                </>
              )}
              {results.missions && results.missions.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-mono-sc text-cyan-700 border-t border-b border-border/50">
                    MISSIONS
                  </div>
                  {results.missions.map(m => (
                    <button
                      key={m.uuid}
                      onMouseDown={() => handleSelect('missions', m.uuid)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-cyan-950/40 text-left transition-colors"
                    >
                      <span className="text-sm text-slate-300">{m.name}</span>
                      <ChevronRight size={12} className="text-slate-600" />
                    </button>
                  ))}
                </>
              )}
              {results.recipes && results.recipes.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-mono-sc text-cyan-700 border-t border-b border-border/50">
                    CRAFTING
                  </div>
                  {results.recipes.map(r => (
                    <button
                      key={r.uuid}
                      onMouseDown={() => { setQuery(''); setOpen(false); navigate(`/crafting?search=${encodeURIComponent(r.name)}`); }}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-cyan-950/40 text-left transition-colors"
                    >
                      <span className="text-sm text-slate-300">{r.name}</span>
                      <ChevronRight size={12} className="text-slate-600" />
                    </button>
                  ))}
                </>
              )}
              <button
                onMouseDown={handleSeeAll}
                className="w-full px-3 py-2 text-xs text-cyan-500 hover:bg-cyan-950/40 text-center border-t border-border/50 font-mono-sc"
              >
                See all results →
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Version badge */}
      {version && (
        <div className="hidden md:flex items-center gap-2 text-xs font-mono-sc text-slate-600">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
          <span>{version.game_version}</span>
        </div>
      )}
    </header>
  );
}
