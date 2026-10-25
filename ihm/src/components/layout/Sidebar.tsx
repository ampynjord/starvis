'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Bug,
  CalendarClock,
  Code2,
  Compass,
  Info,
  Orbit,
  Scale,
  Scroll,
  Shield,
  User,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEnv } from '@/contexts/EnvContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TranslationKey } from '@/lib/i18n';
import { ADMIN_ROLE, hasDeveloperAccess } from '@/lib/app-constants';

type DrawerLink = {
  to: string;
  icon: React.ElementType;
  labelKey: TranslationKey;
  exact?: boolean;
};

const DRAWER_LINKS: DrawerLink[] = [
  { to: '/', icon: Orbit, labelKey: 'nav_nexus', exact: true },
  { to: '/starmap', icon: Compass, labelKey: 'nav_starmap' },
  { to: '/developer', icon: Code2, labelKey: 'nav_developer' },
  { to: '/changelog', icon: Scroll, labelKey: 'nav_changelog' },
  { to: '/about', icon: Info, labelKey: 'menu_about' },
  { to: '/roadmap', icon: CalendarClock, labelKey: 'menu_roadmap' },
  { to: '/legal', icon: Scale, labelKey: 'menu_legal' },
];

function DrawerItem({ to, icon: Icon, labelKey, exact, onNavigate }: DrawerLink & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const isActive = exact ? pathname === to : pathname === to || pathname?.startsWith(`${to}/`);

  return (
    <Link
      href={to}
      onClick={onNavigate}
      className={[
        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150 group',
        isActive
          ? 'bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-semibold shadow-sm shadow-cyan-950'
          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60 border border-transparent',
      ].join(' ')}
    >
      <Icon
        size={15}
        className={`shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`}
        strokeWidth={isActive ? 2 : 1.5}
      />
      <span className="font-rajdhani font-semibold text-sm tracking-wide truncate flex-1">{t(labelKey)}</span>
      {isActive && (
        <motion.div layoutId="nav-indicator" className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400" />
      )}
    </Link>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { env, setEnv } = useEnv();
  const { user } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-50 w-72 sm:w-80',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0 shadow-2xl pointer-events-auto' : '-translate-x-full pointer-events-none',
        'shrink-0 flex flex-col border-r border-cyan-500/30 bg-slate-950/95 backdrop-blur-2xl text-slate-100',
      ].join(' ')}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 bg-slate-900/40 gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/brand/starvis.png" alt="STARVIS" className="w-7 h-7 rounded-lg object-cover shrink-0" />
          <div className="flex flex-col">
            <span className="font-rajdhani font-black tracking-widest text-white text-base leading-none">STARVIS</span>
            <span className="font-mono-sc text-[8px] uppercase tracking-wider text-cyan-400 mt-0.5">Universe Nexus</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label={t('close_menu')}
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80 bg-slate-900/30 shrink-0">
        <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[10px] font-mono-sc">
          <button
            onClick={() => setLanguage('fr')}
            className={`px-2 py-0.5 rounded transition-all ${
              language === 'fr' ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            FR
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 py-0.5 rounded transition-all ${
              language === 'en' ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            EN
          </button>
        </div>
        <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[10px] font-mono-sc">
          <button
            onClick={() => setEnv('live')}
            className={`px-2 py-0.5 rounded transition-all ${
              env === 'live' ? 'bg-cyan-950 text-cyan-400 border border-cyan-700/50 font-bold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            LIVE
          </button>
          <button
            onClick={() => setEnv('ptu')}
            className={`px-2 py-0.5 rounded transition-all ${
              env === 'ptu' ? 'bg-amber-950 text-amber-400 border border-amber-700/50 font-bold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            PTU
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {DRAWER_LINKS.map((item) => (
          <DrawerItem key={item.to} {...item} onNavigate={onClose} />
        ))}

        {mounted && user?.role === ADMIN_ROLE && (
          <div className="space-y-1 pt-3">
            <p className="px-2 pb-1 text-[9px] font-orbitron tracking-widest text-slate-500 uppercase select-none">
              {t('menu_admin')}
            </p>
            <DrawerItem to="/admin" icon={Shield} labelKey="menu_users" exact onNavigate={onClose} />
            <DrawerItem to="/admin/bug-reports" icon={Bug} labelKey="menu_bugs" onNavigate={onClose} />
            <DrawerItem to="/admin/monitoring" icon={Activity} labelKey="menu_monitoring" onNavigate={onClose} />
          </div>
        )}
      </nav>

      <div className="px-4 py-3 border-t border-slate-800/80 space-y-2.5 bg-slate-900/30">
        {mounted && user ? (
          <Link href="/profile" className="flex items-center gap-2 group">
            <div className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-800/50 flex items-center justify-center shrink-0 overflow-hidden">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <User size={11} className="text-cyan-500" />
              )}
            </div>
            <span className="font-mono-sc text-xs text-slate-400 group-hover:text-slate-200 transition-colors truncate flex-1">
              {user.username}
            </span>
            {hasDeveloperAccess(user.role) && (
              <span
                className={`text-[8px] font-orbitron tracking-widest px-1 py-0.5 rounded-sm border uppercase shrink-0 ${
                  user.role === ADMIN_ROLE
                    ? 'text-cyan-500 bg-cyan-950/40 border-cyan-800/50'
                    : 'text-violet-400 bg-violet-950/40 border-violet-800/50'
                }`}
              >
                {user.role === ADMIN_ROLE ? 'admin' : 'dev'}
              </span>
            )}
          </Link>
        ) : (
          <Link href="/login" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors">
            <User size={12} />
            <span className="font-mono-sc">{t('sign_in')}</span>
          </Link>
        )}
        <p className="text-[9px] text-slate-600 leading-tight">{t('disclaimer')}</p>
      </div>
    </aside>
  );
}
