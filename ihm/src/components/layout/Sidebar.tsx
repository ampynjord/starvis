import { motion } from 'framer-motion';
import {
  BarChart3, BookOpen, FileText, Home, Package, Palette, Rocket, Settings2, Shield, ShoppingBag, Zap,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/',             icon: Home,        label: 'Dashboard' },
  { to: '/ships',        icon: Rocket,      label: 'Ships' },
  { to: '/compare',      icon: BarChart3,   label: 'Compare' },
  { to: '/components',   icon: Settings2,   label: 'Components' },
  { to: '/items',        icon: Shield,      label: 'Items' },
  { to: '/commodities',  icon: Package,     label: 'Commodities' },
  { to: '/paints',       icon: Palette,     label: 'Paints' },
  { to: '/manufacturers',icon: Zap,         label: 'Manufacturers' },
  { to: '/shops',        icon: ShoppingBag, label: 'Shops' },
  { to: '/changelog',    icon: BookOpen,    label: 'Changelog' },
];

export function Sidebar() {
  return (
    <aside className="w-16 md:w-56 flex-shrink-0 flex flex-col border-r border-border bg-panel/80 backdrop-blur">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 border-2 border-cyan-400 rounded flex items-center justify-center flex-shrink-0">
            <span className="font-orbitron text-cyan-400 text-xs font-bold">SV</span>
          </div>
          <span className="hidden md:block font-orbitron text-cyan-400 text-sm font-bold tracking-widest glow-text truncate">
            STARVIS
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-0.5 px-2">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-2 py-2.5 rounded transition-all duration-150 group',
                isActive
                  ? 'bg-cyan-950/60 border border-cyan-800 text-cyan-400'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 border border-transparent',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={16}
                  className={`flex-shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`}
                  strokeWidth={isActive ? 2 : 1.5}
                />
                <span className="hidden md:block font-rajdhani font-semibold text-sm uppercase tracking-wider truncate">
                  {label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="hidden md:block ml-auto w-1 h-1 rounded-full bg-cyan-400"
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <a
          href="https://robertsspaceindustries.com"
          target="_blank"
          rel="noreferrer"
          className="hidden md:flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          <FileText size={12} />
          <span className="font-mono-sc">RSI UNIVERSE</span>
        </a>
      </div>
    </aside>
  );
}
