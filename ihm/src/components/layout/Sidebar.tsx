'use client';

import { motion } from 'framer-motion';
import {
  BarChart3,
  BookOpen,
  Crosshair,
  ExternalLink,
  Factory,
  Globe,
  Home,
  Layers3,
  Lock,
  MapPin,
  Newspaper,
  Paintbrush,
  Pickaxe,
  Rocket,
  Scroll,
  Settings2,
  Shield,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  User,
  Wrench,
  ClipboardList,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEnv } from '@/contexts/EnvContext';
import { useAuth } from '@/contexts/AuthContext';

type NavItemDef = {
  to: string;
  icon: React.ElementType;
  label: string;
  auth?: boolean;
  comingSoon?: boolean;
};

const CORE_ITEMS: NavItemDef[] = [
  { to: '/',              icon: Home,          label: 'Dashboard' },
  { to: '/missions',      icon: ClipboardList, label: 'Missions' },
  { to: '/locations',     icon: MapPin,        label: 'Locations' },
  { to: '/blueprints',    icon: Scroll,        label: 'Blueprints' },
  { to: '/factions',      icon: Shield,        label: 'Factions' },
  { to: '/manufacturers', icon: Wrench,        label: 'Manufacturers' },
];

const SHIP_ITEMS: NavItemDef[] = [
  { to: '/ships',         icon: Rocket,            label: 'Ships & Vehicles' },
  { to: '/components',    icon: Settings2,         label: 'Ship Components' },
  { to: '/paints',        icon: Paintbrush,        label: 'Paints' },
  { to: '/compare',       icon: BarChart3,         label: 'Compare' },
  { to: '/ranking',       icon: Trophy,            label: 'Ranking' },
  { to: '/outfitter',     icon: SlidersHorizontal, label: 'Loadout Manager', comingSoon: true },
];

const FPS_ITEMS: NavItemDef[] = [
  { to: '/fps-gear',        icon: Crosshair,         label: 'FPS Gear' },
  { to: '/other-items',     icon: Layers3,           label: 'Other Items' },
  { to: '/fps-calculator',  icon: SlidersHorizontal, label: 'FPS Calculator', comingSoon: true },
];

const INDUSTRIAL_ITEMS: NavItemDef[] = [
  { to: '/industrial',  icon: Factory,    label: 'Commodities' },
  { to: '/trade',       icon: TrendingUp, label: 'Trade Routes',     comingSoon: true },
  { to: '/mining',      icon: Pickaxe,    label: 'Mining Calculator', comingSoon: true },
];

const LORE_ITEMS: NavItemDef[] = [
  { to: '/comm-links',   icon: Newspaper, label: 'Comm-Links' },
  { to: '/galactapedia', icon: Globe,     label: 'Galactapedia' },
];


function NavItem({ to, icon: Icon, label, auth: requiresAuth, comingSoon, onNavigate }: NavItemDef & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isActive = !comingSoon && (to === '/' ? pathname === '/' : pathname?.startsWith(to));
  const locked = requiresAuth && !user;

  if (comingSoon) {
    return (
      <div className="flex items-center gap-3 px-2 py-2.5 rounded-sm border border-transparent cursor-default select-none opacity-40">
        <Icon size={16} className="shrink-0 text-slate-600" strokeWidth={1.5} />
        <span className="font-rajdhani font-semibold text-sm uppercase tracking-wider truncate flex-1 text-slate-600">
          {label}
        </span>
        <span className="shrink-0 text-[9px] font-orbitron font-bold tracking-widest text-slate-500 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded-sm">
          SOON
        </span>
      </div>
    );
  }

  return (
    <Link
      href={to}
      onClick={onNavigate}
      className={[
        'flex items-center gap-3 px-2 py-2.5 rounded-sm transition-all duration-150 group',
        isActive
          ? 'bg-cyan-950/60 border border-cyan-800 text-cyan-400'
          : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 border border-transparent',
      ].join(' ')}
    >
      <Icon
        size={16}
        className={`shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`}
        strokeWidth={isActive ? 2 : 1.5}
      />
      <span className="font-rajdhani font-semibold text-sm uppercase tracking-wider truncate flex-1">
        {label}
      </span>
      {locked && (
        <Lock size={10} className="shrink-0 text-slate-600" />
      )}
      {isActive && !locked && (
        <motion.div
          layoutId="nav-indicator"
          className="ml-auto w-1 h-1 rounded-full bg-cyan-400"
        />
      )}
    </Link>
  );
}

function NavGroup({ label, items, onNavigate }: { label: string; items: NavItemDef[]; onNavigate?: () => void }) {
  return (
    <div>
      <p className="px-2 pt-3 pb-1 text-[10px] font-orbitron tracking-widest text-slate-600 uppercase select-none">
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

  return (
    <aside
      className={[
        // Desktop: static sidebar
        'md:relative md:translate-x-0 md:w-56',
        // Mobile: fixed drawer
        'fixed inset-y-0 left-0 z-40 w-72',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full',
        'shrink-0 flex flex-col border-r border-border bg-panel/95 backdrop-blur-sm',
      ].join(' ')}
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 border-2 border-cyan-400 rounded-sm flex items-center justify-center shrink-0">
            <span className="font-orbitron text-cyan-400 text-xs font-bold">SV</span>
          </div>
          <span className="font-orbitron text-cyan-400 text-sm font-bold tracking-widest glow-text truncate">
            STARVIS
          </span>
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-1 text-slate-600 hover:text-slate-300 transition-colors"
          aria-label="Fermer le menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
        {/* Env Switcher */}
        <div className="mb-3 px-0">
          <p className="px-2 pb-1 text-[10px] font-orbitron tracking-widest text-slate-600 uppercase select-none">
            Environment
          </p>
          <div className="flex gap-1 px-0">
            <button
              onClick={() => setEnv('live')}
              className={[
                'flex-1 py-1.5 rounded-sm text-[10px] font-orbitron font-bold tracking-widest uppercase transition-all duration-150 border',
                env === 'live'
                  ? 'bg-cyan-950/60 border-cyan-700 text-cyan-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5',
              ].join(' ')}
            >
              LIVE
            </button>
            <button
              onClick={() => setEnv('ptu')}
              className={[
                'flex-1 py-1.5 rounded-sm text-[10px] font-orbitron font-bold tracking-widest uppercase transition-all duration-150 border',
                env === 'ptu'
                  ? 'bg-orange-950/60 border-orange-700 text-orange-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5',
              ].join(' ')}
            >
              PTU
            </button>
          </div>
        </div>
        <NavGroup label="Core" items={CORE_ITEMS} onNavigate={onClose} />
        <NavGroup label="Ships" items={SHIP_ITEMS} onNavigate={onClose} />
        <NavGroup label="FPS" items={FPS_ITEMS} onNavigate={onClose} />
        <NavGroup label="Industrial" items={INDUSTRIAL_ITEMS} onNavigate={onClose} />
        <NavGroup label="Lore" items={LORE_ITEMS} onNavigate={onClose} />
        {user?.role === 'admin' && (
          <NavGroup label="Admin" items={[{ to: '/admin', icon: Shield, label: 'Administration' }]} onNavigate={onClose} />
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border space-y-2">
        {user && (
          <Link
            href="/profile"
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <User size={12} />
            <span className="font-mono-sc truncate">{user.username}</span>
          </Link>
        )}
        <Link
          href="/changelog"
          className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          <BookOpen size={12} />
          <span className="font-mono-sc">Changelog</span>
        </Link>
        <a
          href="https://robertsspaceindustries.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          <ExternalLink size={12} />
          <span className="font-mono-sc">RSI Website</span>
        </a>
      </div>
    </aside>
  );
}
