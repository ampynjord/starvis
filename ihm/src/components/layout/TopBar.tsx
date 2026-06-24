'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, LogIn, User, LogOut, Settings, Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { useAuth } from '@/contexts/AuthContext';

export function TopBar({ onMenuToggle, onSearchClick }: { onMenuToggle?: () => void, onSearchClick?: () => void }) {
  const { env } = useEnv();
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const { data: version } = useQuery({
    queryKey: ['version', env],
    queryFn: () => api.stats.version(env),
    staleTime: 10 * 60_000,
  });



  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (userMenuRef.current?.contains(event.target as Node)) return;
      setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  return (
    <header className="h-14 flex items-center gap-2 sm:gap-4 px-3 sm:px-4 border-b border-border bg-panel/60 backdrop-blur-sm z-10">
      {/* Hamburger (mobile only) */}
      <button
        onClick={onMenuToggle}
        className="md:hidden p-1.5 text-slate-500 hover:text-slate-200 transition-colors shrink-0"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>
      {/* Search Button (Triggers Omnibar) */}
      <div className="relative flex-1 max-w-xl">
        <button
          onClick={onSearchClick}
          className="w-full flex items-center gap-2 pl-3 pr-2 py-1.5 bg-slate-900/50 hover:bg-slate-800/80 border border-slate-700/50 rounded text-slate-400 hover:text-slate-300 transition-colors group"
        >
          <Search size={14} className="text-slate-500 group-hover:text-cyan-500 transition-colors" />
          <span className="text-xs font-rajdhani flex-1 text-left">Search ships, components, items...</span>
          <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono-sc border border-slate-700">
            <span className="text-slate-400">CTRL</span>
            <span className="text-slate-500">+</span>
            <span className="text-slate-400">K</span>
          </div>
        </button>
      </div>

      {/* Version badge */}
      {version && (
        <div className="hidden md:flex items-center gap-2 text-xs font-mono-sc text-slate-600">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
          <span>{version.game_version}</span>
        </div>
      )}

      {/* User menu */}
      <div className="relative ml-auto shrink-0" ref={userMenuRef}>
        {user ? (
          <>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
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
                    My profile
                  </Link>
                  <button
                    onMouseDown={async () => { setUserMenuOpen(false); await logout(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-500 hover:bg-red-950/30 hover:text-red-400 transition-colors border-t border-border/50"
                  >
                    <LogOut size={13} />
                    Sign out
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
            SIGN IN
          </Link>
        )}
      </div>
    </header>
  );
}
