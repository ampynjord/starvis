import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Dices,
  Package,
  Palette,
  Pickaxe,
  Rocket,
  Settings2,
  SlidersHorizontal,
  Trophy,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { fDateTime } from '@/utils/formatters';

// ── Stats cards ───────────────────────────────────────────────────────────────

const STAT_CARDS = [
  { key: 'ships',         label: 'Ships',         icon: Rocket,   color: 'text-cyan-400',   to: '/ships' },
  { key: 'components',    label: 'Components',    icon: Settings2, color: 'text-blue-400',  to: '/components' },
  { key: 'items',         label: 'Items',         icon: Dices,    color: 'text-green-400',  to: '/items' },
  { key: 'commodities',   label: 'Commodities',   icon: Package,  color: 'text-purple-400', to: '/commodities' },
  { key: 'manufacturers', label: 'Manufacturers', icon: Wrench,   color: 'text-amber-400',  to: '/manufacturers' },
  { key: 'paints',        label: 'Paints',        icon: Palette,  color: 'text-pink-400',   to: '/paints' },
];

// ── Tool cards ────────────────────────────────────────────────────────────────

const TOOL_CARDS: {
  to: string;
  icon: React.ElementType;
  label: string;
  description: string;
  accent: string;
  badge?: string;
}[] = [
  {
    to: '/outfitter',
    icon: SlidersHorizontal,
    label: 'Outfitter',
    description: 'Build ship loadouts, calculate DPS, power draw and shield efficiency across every slot.',
    accent: 'border-red-700 hover:border-red-500',
    badge: 'DPS Calc',
  },
  {
    to: '/mining',
    icon: Pickaxe,
    label: 'Mining',
    description: 'Browse ore compositions by deposit type, compute profitability and optimal laser settings.',
    accent: 'border-yellow-700 hover:border-yellow-500',
    badge: 'Calculator',
  },
  {
    to: '/compare',
    icon: BarChart3,
    label: 'Compare',
    description: 'Side-by-side stat comparison for any ships or components in the fleet.',
    accent: 'border-cyan-800 hover:border-cyan-600',
  },
  {
    to: '/ranking',
    icon: Trophy,
    label: 'Ranking',
    description: 'Top ships sorted by DPS, cargo, speed, shields and other key statistics.',
    accent: 'border-amber-800 hover:border-amber-600',
  },
  {
    to: '/missions',
    icon: ClipboardList,
    label: 'Missions',
    description: 'Browse all contract templates, filter by type and legality.',
    accent: 'border-slate-700 hover:border-slate-500',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats.overview'],
    queryFn: api.stats.overview,
  });
  const { data: version } = useQuery({
    queryKey: ['version'],
    queryFn: api.stats.version,
  });
  const { data: changelog } = useQuery({
    queryKey: ['changelog.list', { limit: 10 }],
    queryFn: () => api.changelog.list({ limit: 10 }),
  });
  const { data: changelogSummary } = useQuery({
    queryKey: ['changelog.summary'],
    queryFn: api.changelog.summary,
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="sci-panel p-6 border-cyan-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-950/20 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-orbitron text-3xl font-black text-cyan-400 glow-text tracking-widest">
              STARVIS
            </h1>
            <p className="text-slate-400 text-sm mt-1 font-rajdhani">
              Star Citizen — ships · components · mining · outfitter
            </p>
          </div>
          {version && (
            <div className="sci-panel p-3 text-right flex-shrink-0 border-cyan-900">
              <p className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Game version</p>
              <p className="font-orbitron text-cyan-400 text-sm mt-0.5">{version.game_version}</p>
              <p className="text-xs text-slate-600 mt-0.5">{fDateTime(version.extracted_at)}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats counters ───────────────────────────────────────────── */}
      {statsLoading ? (
        <LoadingGrid rows={1} cols={6} message="LOADING STATS…" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAT_CARDS.map(({ key, label, icon: Icon, color, to }, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <Link to={to} className="block">
                <div className="holo-card text-center py-4 group cursor-pointer">
                  <Icon size={20} className={`${color} mx-auto mb-2 group-hover:scale-110 transition-transform`} />
                  <p className="font-orbitron text-xl font-bold text-slate-200">
                    {stats ? (stats[key as keyof typeof stats] ?? 0).toLocaleString('en-US') : '—'}
                  </p>
                  <p className="text-xs font-rajdhani text-slate-500 uppercase tracking-wide mt-0.5">
                    {label}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Tool cards ───────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-orbitron tracking-widest text-slate-600 uppercase mb-3">Tools</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {TOOL_CARDS.map(({ to, icon: Icon, label, description, accent, badge }, i) => (
            <motion.div
              key={to}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.07 }}
            >
              <Link to={to} className="block h-full">
                <div className={`sci-panel p-4 h-full border transition-colors duration-150 ${accent} group`}>
                  <div className="flex items-start justify-between mb-3">
                    <Icon size={20} className="text-slate-400 group-hover:text-slate-200 transition-colors flex-shrink-0" />
                    {badge && (
                      <span className="text-[9px] font-orbitron tracking-widest text-slate-600 border border-slate-700 rounded px-1 py-0.5 uppercase">
                        {badge}
                      </span>
                    )}
                  </div>
                  <p className="font-orbitron text-sm font-bold text-slate-300 group-hover:text-slate-100 transition-colors mb-1">
                    {label}
                  </p>
                  <p className="text-xs font-rajdhani text-slate-600 group-hover:text-slate-500 leading-relaxed transition-colors">
                    {description}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Bottom grid: database nav + changelog ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Database navigation */}
        <ScifiPanel title="Database" className="lg:col-span-1">
          <div className="space-y-1">
            {STAT_CARDS.map(({ key, to, icon: Icon, label, color }) => (
              <Link
                key={label}
                to={to}
                className="flex items-center gap-3 px-3 py-2.5 rounded border border-transparent hover:border-border hover:bg-white/5 transition-all group"
              >
                <Icon size={14} className={color} />
                <span className="font-rajdhani font-semibold text-sm text-slate-400 group-hover:text-slate-200 uppercase tracking-wide transition-colors">
                  {label}
                </span>
                {stats && (
                  <span className="ml-auto font-mono-sc text-xs text-slate-700">
                    {(stats[key as keyof typeof stats] ?? 0).toLocaleString('en-US')}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </ScifiPanel>

        {/* Changelog */}
        <ScifiPanel
          title="Latest changes"
          subtitle={changelogSummary ? `${changelogSummary.total} entries total` : undefined}
          className="lg:col-span-2"
          actions={
            <Link to="/changelog" className="sci-btn-ghost py-1 px-2 text-xs">
              <BookOpen size={11} /> View all
            </Link>
          }
        >
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {changelog?.data.map((entry: { id: string | number; change_type: string; entity_name: string; entity_type: string; created_at: string }) => (
              <div key={entry.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 transition-colors">
                <GlowBadge
                  color={
                    entry.change_type === 'added' ? 'green' :
                    entry.change_type === 'removed' ? 'red' : 'amber'
                  }
                  size="xs"
                >
                  {entry.change_type}
                </GlowBadge>
                <span className="flex-1 text-sm text-slate-400 truncate">{entry.entity_name}</span>
                <span className="text-xs font-mono-sc text-slate-600 flex-shrink-0">
                  {entry.entity_type}
                </span>
                <span className="text-xs font-mono-sc text-slate-700 flex-shrink-0 hidden md:block">
                  {fDateTime(entry.created_at)}
                </span>
              </div>
            ))}
            {!changelog && <LoadingGrid rows={3} cols={4} message="" />}
          </div>
        </ScifiPanel>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats.overview'],
    queryFn: api.stats.overview,
  });
  const { data: version } = useQuery({
    queryKey: ['version'],
    queryFn: api.stats.version,
  });
  const { data: changelog } = useQuery({
    queryKey: ['changelog.list', { limit: 8 }],
    queryFn: () => api.changelog.list({ limit: 8 }),
  });
  const { data: changelogSummary } = useQuery({
    queryKey: ['changelog.summary'],
    queryFn: api.changelog.summary,
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="sci-panel p-6 border-cyan-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-orbitron text-2xl font-black text-cyan-400 glow-text tracking-widest">
              STARVIS
            </h1>
            <p className="text-slate-500 text-sm mt-1 font-rajdhani">
              Star Citizen database — ships, components, items
            </p>
            <a
              href="/api/v1"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-xs font-mono-sc text-slate-600 hover:text-cyan-500 transition-colors"
            >
              <ExternalLink size={11} />
              Public API — /api/v1
            </a>
          </div>
          {version && (
            <div className="sci-panel p-3 text-right flex-shrink-0">
              <p className="text-xs font-mono-sc text-slate-600 uppercase">Game version</p>
              <p className="font-orbitron text-cyan-400 text-sm mt-0.5">{version.game_version}</p>
              <p className="text-xs text-slate-600 mt-0.5">{fDateTime(version.extracted_at)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      {statsLoading ? (
        <LoadingGrid rows={1} cols={6} message="LOADING STATS…" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAT_CARDS.map(({ key, label, icon: Icon, color, to }, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <Link to={to} className="block">
                <div className="holo-card text-center py-4">
                  <Icon size={20} className={`${color} mx-auto mb-2`} />
                  <p className="font-orbitron text-xl font-bold text-slate-200">
                    {stats ? (stats[key as keyof typeof stats] ?? 0).toLocaleString('en-US') : '—'}
                  </p>
                  <p className="text-xs font-rajdhani text-slate-500 uppercase tracking-wide mt-0.5">
                    {label}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick links */}
        <ScifiPanel title="Quick nav" className="lg:col-span-1">
          <div className="space-y-1.5">
            {STAT_CARDS.map(({ to, icon: Icon, label, color }) => (
              <Link
                key={label}
                to={to}
                className="flex items-center gap-3 px-3 py-2.5 rounded border border-transparent hover:border-border hover:bg-white/5 transition-all group"
              >
                <Icon size={14} className={color} />
                <span className="font-rajdhani font-semibold text-sm text-slate-400 group-hover:text-slate-200 uppercase tracking-wide transition-colors">
                  {label}
                </span>
              </Link>
            ))}
            <Link
              to="/compare"
              className="flex items-center gap-3 px-3 py-2.5 rounded border border-transparent hover:border-border hover:bg-white/5 transition-all group"
            >
              <BarChart3 size={14} className="text-amber-400" />
              <span className="font-rajdhani font-semibold text-sm text-slate-400 group-hover:text-slate-200 uppercase tracking-wide transition-colors">
                Compare
              </span>
            </Link>
          </div>
        </ScifiPanel>

        {/* Changelog */}
        <ScifiPanel
          title="Latest changes"
          subtitle={changelogSummary ? `${changelogSummary.total} entries total` : undefined}
          className="lg:col-span-2"
          actions={
            <Link to="/changelog" className="sci-btn-ghost py-1 px-2 text-xs">
              <BookOpen size={11} /> View all
            </Link>
          }
        >
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {changelog?.data.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 transition-colors">
                <GlowBadge
                  color={
                    entry.change_type === 'added' ? 'green' :
                    entry.change_type === 'removed' ? 'red' : 'amber'
                  }
                  size="xs"
                >
                  {entry.change_type}
                </GlowBadge>
                <span className="flex-1 text-sm text-slate-400 truncate">{entry.entity_name}</span>
                <span className="text-xs font-mono-sc text-slate-600 flex-shrink-0">
                  {entry.entity_type}
                </span>
                <span className="text-xs font-mono-sc text-slate-700 flex-shrink-0 hidden md:block">
                  {fDateTime(entry.created_at)}
                </span>
              </div>
            ))}
            {!changelog && <LoadingGrid rows={2} cols={4} message="" />}
          </div>
        </ScifiPanel>
      </div>
    </div>
  );
}
