import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ClipboardList,
  Crosshair,
  Dices,
  FlaskConical,
  Package,
  Palette,
  Pickaxe,
  Rocket,
  Settings2,
  Shuffle,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { fDateTime, fNumber } from '@/utils/formatters';

// ── Stats cards ───────────────────────────────────────────────────────────────

const STAT_CARDS = [
  { key: 'ships',         label: 'Ships / Vehicles', icon: Rocket,   color: 'text-cyan-400',   to: '/ships' },
  { key: 'components',    label: 'Ship Components',  icon: Settings2, color: 'text-blue-400',  to: '/components' },
  { key: 'items',         label: 'FPS Gear',         icon: Dices,    color: 'text-green-400',  to: '/fps-gear' },
  { key: 'commodities',   label: 'Industrial',       icon: Package,  color: 'text-purple-400', to: '/industrial' },
  { key: 'manufacturers', label: 'Manufacturers', icon: Wrench,   color: 'text-amber-400',  to: '/manufacturers' },
  { key: 'paints',        label: 'Ship Paints',      icon: Palette,  color: 'text-pink-400',   to: '/ships' },
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
    to: '/trade',
    icon: TrendingUp,
    label: 'Trade Routes',
    description: 'Find the most profitable trade routes, compare commodity prices across locations.',
    accent: 'border-green-800 hover:border-green-600',
    badge: 'Profit',
  },
  {
    to: '/crafting',
    icon: FlaskConical,
    label: 'Crafting',
    description: 'Browse crafting recipes, required materials and station types.',
    accent: 'border-violet-800 hover:border-violet-600',
  },
  {
    to: '/fps-calculator',
    icon: Crosshair,
    label: 'FPS Calculator',
    description: 'Compute TTK, DPS and damage breakdowns for personal weapons.',
    accent: 'border-orange-800 hover:border-orange-600',
    badge: 'TTK',
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
  const { env } = useEnv();
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats.overview', env],
    queryFn: () => api.stats.overview(env),
  });
  const { data: version } = useQuery({
    queryKey: ['version', env],
    queryFn: () => api.stats.version(env),
  });
  const { data: changelog } = useQuery({
    queryKey: ['changelog.list', { limit: 10 }],
    queryFn: () => api.changelog.list({ limit: 10 }),
  });
  const { data: changelogSummary } = useQuery({
    queryKey: ['changelog.summary'],
    queryFn: api.changelog.summary,
  });
  const { data: randomShip, refetch: refetchRandom } = useQuery({
    queryKey: ['ships.random', env],
    queryFn: () => api.ships.random(env),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const changeCounts = changelog?.data.reduce(
    (acc, e: { change_type: string }) => {
      if (e.change_type === 'added') acc.added++;
      else if (e.change_type === 'removed') acc.removed++;
      else acc.modified++;
      return acc;
    },
    { added: 0, removed: 0, modified: 0 },
  );

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
              Star Citizen — ships · components · mining · outfitter · trade · crafting
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
              <Link href={to} className="block">
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

      {/* ── Featured ship spotlight ──────────────────────────────────── */}
      {randomShip && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <ScifiPanel
            title="Ship spotlight"
            actions={
              <button
                type="button"
                onClick={() => refetchRandom()}
                className="sci-btn-ghost py-1 px-2 text-xs"
              >
                <Shuffle size={11} /> Random
              </button>
            }
          >
            <Link href={`/ships/${randomShip.uuid}`} className="flex flex-col sm:flex-row gap-4 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-orbitron text-lg font-bold text-slate-200 group-hover:text-cyan-400 transition-colors truncate">
                    {randomShip.name}
                  </h3>
                  {randomShip.manufacturer_code && (
                    <GlowBadge color="cyan" size="xs">{randomShip.manufacturer_code}</GlowBadge>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {randomShip.role && (
                    <div>
                      <p className="text-[10px] font-mono-sc text-slate-600 uppercase">Role</p>
                      <p className="text-sm text-slate-400">{randomShip.role}</p>
                    </div>
                  )}
                  {randomShip.crew_size != null && (
                    <div>
                      <p className="text-[10px] font-mono-sc text-slate-600 uppercase">Crew</p>
                      <p className="text-sm text-slate-400">{randomShip.crew_size}</p>
                    </div>
                  )}
                  {randomShip.cargo_capacity != null && (
                    <div>
                      <p className="text-[10px] font-mono-sc text-slate-600 uppercase">Cargo</p>
                      <p className="text-sm text-slate-400">{fNumber(randomShip.cargo_capacity)} SCU</p>
                    </div>
                  )}
                  {randomShip.scm_speed != null && (
                    <div>
                      <p className="text-[10px] font-mono-sc text-slate-600 uppercase">SCM Speed</p>
                      <p className="text-sm text-slate-400">{fNumber(randomShip.scm_speed)} m/s</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center flex-shrink-0">
                <span className="sci-btn-primary py-1.5 px-3 text-xs group-hover:border-cyan-400 transition-colors">
                  View details <ArrowRight size={12} />
                </span>
              </div>
            </Link>
          </ScifiPanel>
        </motion.div>
      )}

      {/* ── Tool cards ───────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-orbitron tracking-widest text-slate-600 uppercase mb-3">Tools</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TOOL_CARDS.map(({ to, icon: Icon, label, description, accent, badge }, i) => (
            <motion.div
              key={to}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.05 }}
            >
              <Link href={to} className="block h-full">
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
                href={to}
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
          subtitle={changelogSummary ? `${changelogSummary.total.toLocaleString('en-US')} entries total` : undefined}
          className="lg:col-span-2"
          actions={
            <Link href="/changelog" className="sci-btn-ghost py-1 px-2 text-xs">
              <BookOpen size={11} /> View all
            </Link>
          }
        >
          {changeCounts && (
            <div className="flex gap-4 mb-3 text-xs font-mono-sc">
              <span className="text-green-400">+{changeCounts.added} added</span>
              <span className="text-amber-400">~{changeCounts.modified} modified</span>
              <span className="text-red-400">-{changeCounts.removed} removed</span>
            </div>
          )}
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

