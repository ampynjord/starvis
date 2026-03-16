import { motion } from 'framer-motion';
import {
  BarChart3,
  BookOpen,
  Dices,
  ExternalLink,
  Home,
  Package,
  Palette,
  Pickaxe,
  Rocket,
  Settings2,
  ShoppingBag,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  Wrench,
  ClipboardList,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

const DB_ITEMS = [
  { to: '/',              icon: Home,              label: 'Dashboard' },
  { to: '/ships',         icon: Rocket,            label: 'Ships' },
  { to: '/missions',      icon: ClipboardList,     label: 'Missions' },
  { to: '/components',    icon: Settings2,         label: 'Components' },
  { to: '/items',         icon: Dices,             label: 'Items' },
  { to: '/commodities',   icon: Package,           label: 'Commodities' },
  { to: '/paints',        icon: Palette,           label: 'Paints' },
  { to: '/manufacturers', icon: Wrench,            label: 'Manufacturers' },
  { to: '/shops',         icon: ShoppingBag,       label: 'Shops' },
  { to: '/changelog',     icon: BookOpen,          label: 'Changelog' },
];

const TOOL_ITEMS = [
  { to: '/ranking',   icon: Trophy,            label: 'Ranking' },
  { to: '/compare',   icon: BarChart3,         label: 'Compare' },
  { to: '/outfitter', icon: SlidersHorizontal, label: 'Outfitter' },
  { to: '/trade',     icon: TrendingUp,        label: 'Trade' },
  { to: '/mining',    icon: Pickaxe,           label: 'Mining' },
];

function NavItem({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
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
  );
}

function NavGroup({ label, items }: { label: string; items: typeof DB_ITEMS }) {
  return (
    <div>
      <p className="hidden md:block px-2 pt-3 pb-1 text-[10px] font-orbitron tracking-widest text-slate-600 uppercase select-none">
        {label}
      </p>
      <div className="md:hidden my-2 border-t border-border/40" />
      {items.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}
    </div>
  );
}

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
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
        <NavGroup label="Database" items={DB_ITEMS} />
        <NavGroup label="Tools" items={TOOL_ITEMS} />
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <a
          href="https://robertsspaceindustries.com"
          target="_blank"
          rel="noreferrer"
          className="hidden md:flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          <ExternalLink size={12} />
          <span className="font-mono-sc">RSI Website</span>
        </a>
      </div>
    </aside>
  );
}

