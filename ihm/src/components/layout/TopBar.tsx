'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, Menu } from 'lucide-react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';

export function TopBar({ onMenuToggle, onSearchClick }: { onMenuToggle?: () => void, onSearchClick?: () => void }) {
  const { env } = useEnv();
  const { data: version } = useQuery({
    queryKey: ['version', env],
    queryFn: () => api.stats.version(env),
    staleTime: 10 * 60_000,
  });

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
        <div className="hidden md:flex items-center gap-2 ml-auto shrink-0 text-xs font-mono-sc text-slate-600">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
          <span>{version.game_version}</span>
        </div>
      )}
    </header>
  );
}
