'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  LogIn,
  User,
  LogOut,
  Settings,
  Menu,
  Orbit,
  Compass,
  Code2,
  Scroll,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

export function TopBar({
  onMenuToggle,
  onSearchClick,
}: {
  onMenuToggle?: () => void;
  onSearchClick?: () => void;
}) {
  const pathname = usePathname();
  const { env, setEnv } = useEnv();
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const navLinks = [
    { href: '/', label: t('nav_nexus'), icon: Orbit },
    { href: '/starmap', label: t('nav_starmap'), icon: Compass },
    { href: '/developer', label: t('nav_developer'), icon: Code2 },
    { href: '/changelog', label: t('nav_changelog'), icon: Scroll },
  ];

  return (
    <header className="sticky top-0 z-30 h-16 w-full border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-4">
      {/* Brand & Left Controls */}
      <div className="flex items-center gap-3 sm:gap-5 shrink-0">
        {/* Toggle Menu Button (Available anytime on both desktop & mobile) */}
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-xl border border-slate-800 hover:border-cyan-500/50 text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
          aria-label={t('open_menu')}
          title={t('open_menu')}
        >
          <Menu size={18} />
        </button>

        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:border-cyan-400 transition-all">
            <Orbit size={18} className="text-cyan-400 group-hover:rotate-45 transition-transform duration-500" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="font-rajdhani font-black tracking-widest text-lg text-white group-hover:text-cyan-400 transition-colors">
              STARVIS
            </span>
            <span className="font-mono-sc text-[9px] uppercase tracking-wider text-cyan-400 -mt-1">
              Universe Nexus
            </span>
          </div>
        </Link>

        {/* Aerial Cockpit Nav Links (Desktop) */}
        <nav className="hidden xl:flex items-center gap-1 ml-2">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono-sc transition-all ${
                  isActive
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/60 border border-transparent'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-cyan-400' : 'text-slate-500'} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Central Omni-Search Trigger Button */}
      <div className="flex-1 max-w-lg mx-auto">
        <button
          onClick={onSearchClick}
          aria-label={t('search_placeholder')}
          className="w-full flex items-center justify-between gap-3 px-3.5 py-2 bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 rounded-xl text-slate-400 hover:text-slate-200 transition-all shadow-inner group"
        >
          <div className="flex items-center gap-2.5 truncate">
            <Search size={15} className="text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-rajdhani truncate tracking-wide text-slate-400 group-hover:text-slate-200">
              {t('search_placeholder')}
            </span>
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[10px] font-mono-sc text-slate-400 shrink-0">
            <kbd className="text-cyan-400">Ctrl</kbd>
            <span>+</span>
            <kbd className="text-cyan-400">K</kbd>
          </div>
        </button>
      </div>

      {/* Right Cockpit Controls */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Language Switcher FR | EN */}
        <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[11px] font-mono-sc">
          <button
            onClick={() => setLanguage('fr')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              language === 'fr'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Afficher en Français"
          >
            FR
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              language === 'en'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Display in English"
          >
            EN
          </button>
        </div>

        {/* Environment Selector LIVE | PTU */}
        <div className="hidden sm:flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[11px] font-mono-sc">
          <button
            onClick={() => setEnv('live')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              env === 'live'
                ? 'bg-cyan-950 text-cyan-400 border border-cyan-700/50 font-bold'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            LIVE
          </button>
          <button
            onClick={() => setEnv('ptu')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              env === 'ptu'
                ? 'bg-amber-950 text-amber-400 border border-amber-700/50 font-bold'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            PTU
          </button>
        </div>

        {/* Version Badge */}
        {version && (
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-[11px] font-mono-sc text-slate-300">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>SC {version.game_version}</span>
          </div>
        )}

        {/* User Account / Sign in */}
        <div className="relative" ref={userMenuRef}>
          {mounted && user ? (
            <>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-800 hover:border-cyan-500/40 bg-slate-900/40 hover:bg-slate-900/80 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-700/50 flex items-center justify-center overflow-hidden shrink-0">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                  ) : (
                    <User size={14} className="text-cyan-400" />
                  )}
                </div>
                <span className="text-xs font-mono-sc text-slate-200 hidden md:block">{user.username}</span>
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-slate-950 border border-cyan-500/30 rounded-xl shadow-xl z-50 overflow-hidden backdrop-blur-xl"
                  >
                    <Link
                      href="/profile"
                      onMouseDown={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-mono-sc text-slate-300 hover:bg-cyan-950/50 hover:text-cyan-300 transition-colors"
                    >
                      <Settings size={14} />
                      {t('my_profile')}
                    </Link>
                    <button
                      onMouseDown={async () => {
                        setUserMenuOpen(false);
                        await logout();
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-mono-sc text-rose-400 hover:bg-rose-950/30 transition-colors border-t border-slate-800"
                    >
                      <LogOut size={14} />
                      {t('sign_out')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 border border-cyan-500/40 hover:border-cyan-400 bg-cyan-950/30 hover:bg-cyan-950/60 text-cyan-300 font-mono-sc text-xs rounded-xl transition-all shadow-sm shadow-cyan-950/50"
            >
              <LogIn size={13} />
              <span className="hidden sm:inline">{t('sign_in')}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
