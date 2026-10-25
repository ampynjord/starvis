'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bug,
  ExternalLink,
  Home,
  Info,
  Lock,
  Scale,
  Shield,
  User,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEnv } from '@/contexts/EnvContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { NAV_GROUPS, type NavItemDef } from '@/components/layout/navigation';
import { ADMIN_ROLE, hasDeveloperAccess, PUBLIC_RSI_URL } from '@/lib/app-constants';

const LOCALIZED_LABELS: Record<string, { fr: string; en: string }> = {
  '/': { fr: 'Tableau de bord', en: 'Dashboard' },
  '/developer': { fr: 'API & Datasets', en: 'API & Datasets' },
  '/changelog': { fr: 'Notes de Version', en: 'Patch Changelog' },
  '/about': { fr: 'À propos de STARVIS', en: 'About Starvis' },
  '/roadmap': { fr: 'Feuille de Route', en: 'Roadmap' },
  '/ships': { fr: 'Flotte & Véhicules', en: 'Ships & Vehicles' },
  '/components': { fr: 'Composants de Véhicule', en: 'Vehicle Components' },
  '/manufacturers': { fr: 'Constructeurs', en: 'Manufacturers' },
  '/items': { fr: 'Tous les Objets FPS', en: 'All FPS Items' },
  '/weapons': { fr: 'Armes FPS', en: 'Weapons' },
  '/armor': { fr: 'Armures', en: 'Armor' },
  '/loot': { fr: 'Tables de Butin', en: 'Loot Tables' },
  '/commodities': { fr: 'Marchandises', en: 'Commodities' },
  '/missions': { fr: 'Missions', en: 'Missions' },
  '/factions': { fr: 'Factions', en: 'Factions' },
  '/starmap': { fr: 'Starmap 3D', en: '3D Starmap' },
  '/galactapedia': { fr: 'Galactapedia', en: 'Galactapedia' },
  '/comm-links': { fr: 'Comm-Links', en: 'Comm-Links' },
  '/admin': { fr: 'Utilisateurs', en: 'Users' },
  '/admin/bug-reports': { fr: 'Signalements de Bug', en: 'Bug Reports' },
  '/admin/monitoring': { fr: 'Supervision API', en: 'Monitoring' },
};

const GROUP_LABELS: Record<string, { fr: string; en: string }> = {
  platform: { fr: 'Plateforme', en: 'Platform' },
  ships: { fr: 'Flotte & Véhicules', en: 'Ships & Vehicles' },
  equipment: { fr: 'Équipement FPS', en: 'FPS & Equipment' },
  economy: { fr: 'Économie & Industrie', en: 'Economy & Industry' },
  universe: { fr: 'Univers', en: 'Universe' },
  administration: { fr: 'Administration', en: 'Administration' },
};

function NavItem({ to, icon: Icon, label, earlyAccess, auth: requiresAuth, exact, onNavigate }: NavItemDef & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { language } = useLanguage();
  const isActive = to === '/' ? pathname === '/' : exact ? pathname === to : pathname?.startsWith(to);
  const locked = requiresAuth && !user;
  const displayLabel = LOCALIZED_LABELS[to]?.[language] || label;

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
      <span className="font-rajdhani font-semibold text-sm tracking-wide truncate flex-1">
        {displayLabel}
      </span>
      {earlyAccess && (
        <span
          title="Early access"
          className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-amber-800/55 bg-amber-950/25 px-1 py-0.5 font-orbitron text-[7px] font-bold uppercase tracking-widest text-amber-300"
        >
          <AlertTriangle size={8} />
          EA
        </span>
      )}
      {locked && <Lock size={10} className="shrink-0 text-slate-600" />}
      {isActive && !locked && (
        <motion.div
          layoutId="nav-indicator"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400"
        />
      )}
    </Link>
  );
}

function NavGroup({ groupKey, fallbackLabel, items, onNavigate }: { groupKey: string; fallbackLabel: string; items: NavItemDef[]; onNavigate?: () => void }) {
  const { language } = useLanguage();
  const label = GROUP_LABELS[groupKey]?.[language] || fallbackLabel;

  return (
    <div className="space-y-1">
      <p className="px-2 pt-3 pb-1 text-[9px] font-orbitron tracking-widest text-slate-500 uppercase select-none">
        {label}
      </p>
      {items.map((item) => (
        <NavItem key={item.to} {...item} onNavigate={onNavigate} />
      ))}
    </div>
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
      {/* Header — logo + close */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 bg-slate-900/40 gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/brand/starvis.png" alt="STARVIS" className="w-7 h-7 rounded-lg object-cover shrink-0" />
          <div className="flex flex-col">
            <span className="font-rajdhani font-black tracking-widest text-white text-base leading-none">
              STARVIS
            </span>
            <span className="font-mono-sc text-[8px] uppercase tracking-wider text-cyan-400 mt-0.5">
              Universe Portal
            </span>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label={t('close_menu')}
        >
          <X size={18} />
        </button>
      </div>

      {/* Settings Row: Env & Lang */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80 bg-slate-900/30 shrink-0">
        {/* Language switch */}
        <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[10px] font-mono-sc">
          <button
            onClick={() => setLanguage('fr')}
            className={`px-2 py-0.5 rounded transition-all ${
              language === 'fr'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            FR
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 py-0.5 rounded transition-all ${
              language === 'en'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            EN
          </button>
        </div>

        {/* Env switch */}
        <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[10px] font-mono-sc">
          <button
            onClick={() => setEnv('live')}
            className={`px-2 py-0.5 rounded transition-all ${
              env === 'live'
                ? 'bg-cyan-950 text-cyan-400 border border-cyan-700/50 font-bold'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            LIVE
          </button>
          <button
            onClick={() => setEnv('ptu')}
            className={`px-2 py-0.5 rounded transition-all ${
              env === 'ptu'
                ? 'bg-amber-950 text-amber-400 border border-amber-700/50 font-bold'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            PTU
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-2">
        <NavItem to="/" icon={Home} label={t('menu_dashboard')} onNavigate={onClose} />

        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.id} groupKey={group.id} fallbackLabel={group.label} items={group.items} onNavigate={onClose} />
        ))}

        {mounted && user?.role === ADMIN_ROLE && (
          <NavGroup
            groupKey="administration"
            fallbackLabel={t('menu_admin')}
            items={[
              { to: '/admin',              icon: Shield,    label: t('menu_users'),         exact: true },
              { to: '/admin/bug-reports',  icon: Bug,       label: t('menu_bugs') },
              { to: '/admin/monitoring',    icon: Activity,  label: t('menu_monitoring') },
            ]}
            onNavigate={onClose}
          />
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-800/80 space-y-2.5 bg-slate-900/30">
        {/* User or sign-in */}
        {mounted && user ? (
          <Link
            href="/profile"
            className="flex items-center gap-2 group"
          >
            <div className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-800/50 flex items-center justify-center shrink-0 overflow-hidden">
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                : <User size={11} className="text-cyan-500" />}
            </div>
            <span className="font-mono-sc text-xs text-slate-400 group-hover:text-slate-200 transition-colors truncate flex-1">
              {user.username}
            </span>
            {hasDeveloperAccess(user.role) && (
              <span className={`text-[8px] font-orbitron tracking-widest px-1 py-0.5 rounded-sm border uppercase shrink-0 ${
                user.role === ADMIN_ROLE
                  ? 'text-cyan-500 bg-cyan-950/40 border-cyan-800/50'
                  : 'text-violet-400 bg-violet-950/40 border-violet-800/50'
              }`}>
                {user.role === ADMIN_ROLE ? 'admin' : 'dev'}
              </span>
            )}
          </Link>
        ) : (
          <div className="space-y-1">
            <Link
              href="/login"
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <User size={12} />
              <span className="font-mono-sc">{t('sign_in')}</span>
            </Link>
          </div>
        )}

        {/* Secondary links */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
          <Link href="/changelog" className="flex items-center gap-1 hover:text-slate-300 transition-colors font-mono-sc">
            <BookOpen size={9} /> {t('nav_changelog')}
          </Link>
          <Link href="/about" className="flex items-center gap-1 hover:text-slate-300 transition-colors font-mono-sc">
            <Info size={9} /> {t('menu_about')}
          </Link>
          {mounted && user && (
            <Link href="/report-bug" className="flex items-center gap-1 hover:text-slate-300 transition-colors font-mono-sc">
              <Bug size={9} /> {t('menu_bugs')}
            </Link>
          )}
          <a
            href={PUBLIC_RSI_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 hover:text-slate-300 transition-colors font-mono-sc"
          >
            RSI <ExternalLink size={9} />
          </a>
          <Link href="/legal" className="flex items-center gap-1 hover:text-slate-300 transition-colors font-mono-sc">
            <Scale size={9} /> {t('menu_legal')}
          </Link>
        </div>

        <p className="text-[9px] text-slate-600 leading-tight">
          Unofficial fan project. Not affiliated with Cloud Imperium Games.
        </p>
      </div>
    </aside>
  );
}
