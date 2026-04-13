'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ChevronRight, LogIn, User, LogOut, Settings } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import { useEnv } from '@/contexts/EnvContext';
import { useAuth } from '@/contexts/AuthContext';

export function TopBar() {
  const { env } = useEnv();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const router = useRouter();
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
    router.push(`/${type}/${uuid}`);
  }, [router]);

  const handleSeeAll = useCallback(() => {
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }, [router, query]);

  const hasResults = results && (
    results.ships.length + results.components.length + results.items.length +
    (results.commodities?.length ?? 0) + (results.missions?.length ?? 0) + (results.recipes?.length ?? 0) > 0
  );

  return (
    <header className="h-14 flex items-center gap-4 px-4 border-b border-border bg-panel/60 backdrop-blur-sm z-10">
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
                    BLUEPRINTS
                  </div>
                  {results.recipes.map(r => (
                    <button
                      key={r.uuid}
                      onMouseDown={() => { setQuery(''); setOpen(false); router.push(`/blueprints?search=${encodeURIComponent(r.name)}`); }}
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

      {/* User menu */}
      <div className="relative ml-auto shrink-0">
        {user ? (
          <>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              onBlur={() => setTimeout(() => setUserMenuOpen(false), 150)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-transparent hover:border-cyan-700/40 hover:bg-cyan-950/30 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-700/40 flex items-center justify-center overflow-hidden shrink-0">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  <User size={12} className="text-cyan-400" />
                )}
              </div>
              <span className="text-xs font-mono-sc text-slate-300 hidden sm:block">{user.username}</span>
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1 w-44 sci-panel z-50 overflow-hidden"
                >
                  <Link
                    href="/profile"
                    onMouseDown={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-300 hover:bg-cyan-950/40 hover:text-cyan-300 transition-colors"
                  >
                    <Settings size={13} />
                    Mon profil
                  </Link>
                  <button
                    onMouseDown={async () => { setUserMenuOpen(false); await logout(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-500 hover:bg-red-950/30 hover:text-red-400 transition-colors border-t border-border/50"
                  >
                    <LogOut size={13} />
                    Déconnexion
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-cyan-700/50 hover:border-cyan-500/70 bg-cyan-900/20 hover:bg-cyan-900/40 text-cyan-400 hover:text-cyan-300 font-mono-sc text-xs rounded transition-colors"
          >
            <LogIn size={13} />
            CONNEXION
          </Link>
        )}
      </div>
    </header>
  );
}
