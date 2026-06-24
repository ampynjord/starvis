'use client';

import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bug,
  Building2,
  Code2,
  ExternalLink,
  Home,
  Info,
  Lock,
  Package,
  Radar,
  Scale,
  Shield,
  Ship,
  User,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEnv } from '@/contexts/EnvContext';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_GROUPS, type NavItemDef } from '@/components/layout/navigation';
import { ADMIN_ROLE, hasDeveloperAccess, PUBLIC_RSI_URL } from '@/lib/app-constants';

function NavItem({ to, icon: Icon, label, earlyAccess, auth: requiresAuth, exact, onNavigate }: NavItemDef & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isActive = to === '/' ? pathname === '/' : exact ? pathname === to : pathname?.startsWith(to);
  const locked = requiresAuth && !user;

  return (
    <Link
      href={to}
      onClick={onNavigate}
      className={[
        'flex items-center gap-2.5 px-2 py-2 rounded-sm transition-all duration-150 group',
        isActive
          ? 'bg-cyan-950/60 border border-cyan-800 text-cyan-400'
          : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 border border-transparent',
      ].join(' ')}
    >
      <Icon
        size={15}
        className={`shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`}
        strokeWidth={isActive ? 2 : 1.5}
      />
      <span className="font-rajdhani font-semibold text-sm uppercase tracking-wider truncate flex-1">
        {label}
      </span>
      {earlyAccess && (
        <span
          title="Early access: this area is still being validated and can change."
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
          className="ml-auto w-1 h-1 rounded-full bg-cyan-400"
        />
      )}
    </Link>
  );
}

function NavGroup({ label, items, onNavigate }: { label: string; items: NavItemDef[]; onNavigate?: () => void }) {
  return (
    <div>
      <p className="px-2 pt-3 pb-1 text-[9px] font-orbitron tracking-widest text-slate-700 uppercase select-none">
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
    <>
      <aside
        className={[
        // Desktop: static sidebar
        'md:relative md:translate-x-0 md:w-64',
        // Mobile: fixed drawer
        'fixed inset-y-0 left-0 z-40 w-72',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full',
        'shrink-0 flex flex-col border-r border-border bg-panel/95 backdrop-blur-sm',
      ].join(' ')}
    >
      {/* Header — logo + env switcher */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/brand/starvis.png" alt="STARVIS" className="w-8 h-8 rounded-sm object-cover shrink-0" />
          <span className="font-orbitron text-cyan-400 text-sm font-bold tracking-widest glow-text whitespace-nowrap">
            STARVIS
          </span>
        </div>

        {/* Mobile close */}
        <button
          onClick={onClose}
          className="md:hidden p-1 text-slate-600 hover:text-slate-300 transition-colors"
          aria-label="Close menu"
        >
          <X size={16} />
        </button>
      </div>

      {/* Settings Row */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-slate-950/20 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEnv('live')}
            className={[
              'py-1 px-2 rounded-sm text-[9px] font-orbitron font-bold tracking-widest uppercase transition-all duration-150 border',
              env === 'live'
                ? 'bg-cyan-950/60 border-cyan-700 text-cyan-400'
                : 'border-transparent text-slate-600 hover:text-slate-400 bg-slate-900/30',
            ].join(' ')}
          >
            LIVE
          </button>
          <button
            onClick={() => setEnv('ptu')}
            className={[
              'py-1 px-2 rounded-sm text-[9px] font-orbitron font-bold tracking-widest uppercase transition-all duration-150 border',
              env === 'ptu'
                ? 'bg-orange-950/60 border-orange-700 text-orange-400'
                : 'border-transparent text-slate-600 hover:text-slate-400 bg-slate-900/30',
            ].join(' ')}
          >
            PTU
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        <NavItem to="/" icon={Home} label="Dashboard" onNavigate={onClose} />

        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.id} label={group.label} items={group.items} onNavigate={onClose} />
        ))}

        {user && (
          <NavGroup
            label="Corporation"
            items={[
              { to: '/corp',       icon: Building2, label: 'Corporation HQ', exact: true },
              { to: '/corp/fleet', icon: Ship,    label: 'Fleet Manager', earlyAccess: true },
              { to: '/corp/tactics', icon: Radar, label: 'Tactics', earlyAccess: true },
              { to: '/corp/bank',  icon: Package, label: 'Corp Bank', earlyAccess: true },
            ]}
            onNavigate={onClose}
          />
        )}

        {hasDeveloperAccess(user?.role) && (
          <NavGroup
            label="Developer"
            items={[{ to: '/developer', icon: Code2, label: 'API Access', earlyAccess: true }]}
            onNavigate={onClose}
          />
        )}

        {user?.role === ADMIN_ROLE && (
          <NavGroup
            label="Administration"
            items={[
              { to: '/admin',              icon: Shield,    label: 'Users',         exact: true },
              { to: '/admin/corporations', icon: Building2, label: 'Corporations' },
              { to: '/admin/bug-reports',  icon: Bug,       label: 'Bug Reports' },
              { to: '/admin/monitoring',    icon: Activity,  label: 'Monitoring' },
            ]}
            onNavigate={onClose}
          />
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border space-y-2.5">
        {/* User or sign-in */}
        {user ? (
          <Link
            href="/profile"
            className="flex items-center gap-2 group"
          >
            <div className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-800/50 flex items-center justify-center shrink-0 overflow-hidden">
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                : <User size={11} className="text-cyan-500" />}
            </div>
            <span className="font-mono-sc text-xs text-slate-500 group-hover:text-slate-300 transition-colors truncate flex-1">
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
          <div className="space-y-2">
            <Link
              href="/login"
              className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              <User size={12} />
              <span className="font-mono-sc">Sign in</span>
            </Link>
            <p className="text-[10px] leading-snug text-slate-700">
              Create a free account to unlock connected features: profile, corporation tools, reports, API access
              and AI assistant.
            </p>
            <Link href="/register" className="inline-flex text-[10px] font-mono-sc text-cyan-600 hover:text-cyan-400">
              Create account
            </Link>
          </div>
        )}

        {/* Secondary links */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <Link href="/changelog" className="flex items-center gap-1 text-[10px] text-slate-700 hover:text-slate-500 transition-colors font-mono-sc">
            <BookOpen size={9} /> Changelog
          </Link>
          <Link href="/about" className="flex items-center gap-1 text-[10px] text-slate-700 hover:text-slate-500 transition-colors font-mono-sc">
            <Info size={9} /> About
          </Link>
          {user && (
            <Link href="/report-bug" className="flex items-center gap-1 text-[10px] text-slate-700 hover:text-slate-500 transition-colors font-mono-sc">
              <Bug size={9} /> Report bug
            </Link>
          )}
          <a
            href={PUBLIC_RSI_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[10px] text-slate-700 hover:text-slate-500 transition-colors font-mono-sc"
          >
            RSI <ExternalLink size={9} />
          </a>
          <Link href="/legal" className="flex items-center gap-1 text-[10px] text-slate-700 hover:text-slate-500 transition-colors font-mono-sc">
            <Scale size={9} /> Legal
          </Link>
        </div>

        <p className="text-[9px] text-slate-800 leading-tight">
          Unofficial fan project. Not affiliated with Cloud Imperium Games. Star Citizen and related content are
          property of Cloud Imperium Games.
        </p>
      </div>
    </aside>
    </>
  );
}
