import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Image from 'next/image';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ClipboardList,
  Clock,
  Crosshair,
  Dices,
  Layers,
  Minus,
  Package,
  Palette,
  Pickaxe,
  Plus,
  RefreshCw,
  Rocket,
  Scroll,
  Settings2,
  Shuffle,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  Wrench,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { fDate, fNumber } from '@/utils/formatters';
import type { ChangelogEntry } from '@/types/api';

// ── Config ────────────────────────────────────────────────────────────────────

const DB_ENTRIES = [
  { key: 'ships',         label: 'Ships & Vehicles', icon: Rocket,    color: 'text-cyan-400',   bar: 'bg-cyan-500',    to: '/ships' },
  { key: 'components',    label: 'Components',       icon: Settings2, color: 'text-blue-400',   bar: 'bg-blue-500',    to: '/components' },
  { key: 'items',         label: 'FPS Gear',         icon: Dices,     color: 'text-violet-400', bar: 'bg-violet-500',  to: '/fps-gear' },
  { key: 'commodities',   label: 'Industrial',       icon: Package,   color: 'text-amber-400',  bar: 'bg-amber-500',   to: '/industrial' },
  { key: 'manufacturers', label: 'Manufacturers',    icon: Wrench,    color: 'text-slate-400',  bar: 'bg-slate-500',   to: '/manufacturers' },
  { key: 'paints',        label: 'Ship Paints',      icon: Palette,   color: 'text-pink-400',   bar: 'bg-pink-500',    to: '/paints' },
] as const;

type ToolCategory = 'combat' | 'economy' | 'data';

const TOOLS: {
  to: string;
  icon: React.ElementType;
  label: string;
  sub: string;
  category: ToolCategory;
  badge?: string;
  comingSoon?: boolean;
}[] = [
  { to: '/compare',       icon: BarChart3,         label: 'Compare',           sub: 'Side-by-side ship & component stats',  category: 'data' },
  { to: '/ranking',       icon: Trophy,            label: 'Ranking',           sub: 'Top ships by DPS, cargo, speed…',      category: 'data' },
  { to: '/blueprints',    icon: Scroll,            label: 'Blueprints',        sub: 'Crafting recipes & materials',         category: 'economy' },
  { to: '/missions',      icon: ClipboardList,     label: 'Missions',          sub: 'Contracts by faction & legality',      category: 'data' },
  { to: '/outfitter',     icon: SlidersHorizontal, label: 'Loadout Manager',   sub: 'DPS, power & shield calculator',       category: 'combat',  badge: 'DPS',   comingSoon: true },
  { to: '/fps-calculator',icon: Crosshair,         label: 'FPS Calculator',    sub: 'TTK & damage breakdown for weapons',   category: 'combat',  badge: 'TTK',   comingSoon: true },
  { to: '/trade',         icon: TrendingUp,        label: 'Trade Routes',      sub: 'Profit & commodity prices',            category: 'economy', badge: 'aUEC',  comingSoon: true },
  { to: '/mining',        icon: Pickaxe,           label: 'Mining Calculator', sub: 'Ore yield & laser settings',           category: 'economy', badge: 'Yield', comingSoon: true },
];

const CATEGORY_LABEL: Record<ToolCategory, { label: string; color: string; border: string }> = {
  combat:  { label: 'Combat',  color: 'text-red-400',    border: 'border-red-800/60 hover:border-red-500/70' },
  economy: { label: 'Economy', color: 'text-green-400',  border: 'border-green-800/60 hover:border-green-500/70' },
  data:    { label: 'Data',    color: 'text-blue-400',   border: 'border-blue-800/60 hover:border-blue-500/70' },
};

const CHANGE_ICON = {
  added:    { Icon: Plus,      cls: 'text-green-400', bg: 'bg-green-950/50 border-green-900' },
  removed:  { Icon: Minus,     cls: 'text-red-400',   bg: 'bg-red-950/50 border-red-900' },
  modified: { Icon: RefreshCw, cls: 'text-amber-400', bg: 'bg-amber-950/50 border-amber-900' },
};

const ENTITY_COLOR: Record<string, string> = {
  ship:      'text-cyan-400',
  component: 'text-blue-400',
  item:      'text-violet-400',
  commodity: 'text-amber-400',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ entry, value, max, delay }: { entry: typeof DB_ENTRIES[number]; value: number; max: number; delay: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Link href={entry.to} className="block h-full">
        <div className="holo-card px-4 py-3 h-full group">
          <div className="flex items-start justify-between mb-2">
            <entry.icon size={16} className={`${entry.color} shrink-0 group-hover:scale-110 transition-transform`} />
            <span className="text-[9px] font-mono-sc text-slate-700 uppercase tracking-widest">{pct}%</span>
          </div>
          <p className="font-orbitron text-2xl font-black text-slate-100 leading-none mb-1">
            {value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toLocaleString('en-US')}
          </p>
          <p className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-wider mb-2">{entry.label}</p>
          <div className="h-0.5 w-full rounded-full bg-slate-800/80 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${entry.bar} opacity-60`}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ delay: delay + 0.2, duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function ChangelogRow({ entry }: { entry: ChangelogEntry }) {
  const ct = (entry.change_type ?? 'modified') as 'added' | 'removed' | 'modified';
  const { Icon, cls, bg } = CHANGE_ICON[ct] ?? CHANGE_ICON.modified;
  const entityColor = ENTITY_COLOR[entry.entity_type] ?? 'text-slate-400';

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.025] transition-colors rounded-sm">
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-sm border shrink-0 ${bg}`}>
        <Icon size={9} className={cls} />
      </span>
      <span className="flex-1 min-w-0 text-sm font-rajdhani text-slate-300 truncate">{entry.entity_name}</span>
      <span className={`text-[10px] font-mono-sc shrink-0 ${entityColor}`}>{entry.entity_type}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { env } = useEnv();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats.overview', env],
    queryFn: () => api.stats.overview(env),
    staleTime: 0,
  });
  const { data: version } = useQuery({
    queryKey: ['version', env],
    queryFn: () => api.stats.version(env),
    staleTime: 0,
  });
  const { data: changelog } = useQuery({
    queryKey: ['changelog.feed.home', env],
    queryFn: () => api.changelog.list({ env, limit: 20, markers_only: true }),
  });
  const { data: changelogSummary } = useQuery({
    queryKey: ['changelog.summary', env],
    queryFn: () => api.changelog.summary(env),
  });
  const { data: randomShip, refetch: refetchRandom, isFetching: shipFetching } = useQuery({
    queryKey: ['ships.random', env],
    queryFn: () => api.ships.random(env),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const maxStat = stats
    ? Math.max(stats.ships, stats.components, stats.items, stats.commodities, stats.manufacturers, stats.paints)
    : 1;

  const byChange = changelog?.data.reduce<Record<string, number>>((acc, e) => {
    acc[e.change_type] = (acc[e.change_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">

      {/* ── Command Header ────────────────────────────────────────────── */}
      <div className="sci-panel relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-r from-cyan-950/25 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-cyan-500/40 via-cyan-400/20 to-transparent" />

        <div className="relative px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-end gap-4">
            <div>
              <h1 className="font-orbitron text-4xl font-black text-cyan-400 glow-text tracking-widest leading-none">
                STARVIS
              </h1>
              <p className="font-mono-sc text-[10px] text-slate-600 tracking-widest uppercase mt-1">
                Star Citizen · Game Database & Toolset
              </p>
            </div>
            <div className="hidden sm:block w-px h-10 bg-border self-center" />
            <div className="hidden sm:block">
              <p className="font-mono-sc text-[9px] text-slate-700 uppercase tracking-widest">Modules</p>
              <p className="font-rajdhani text-xs text-slate-500 leading-snug">
                Ships · Components · FPS · Mining · Trade · Crafting
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {version ? (
              <>
                <div className="text-right">
                  <p className="font-orbitron text-base font-bold text-cyan-400">SC {version.game_version}</p>
                  <p className="font-mono-sc text-[10px] text-slate-600 flex items-center gap-1 justify-end">
                    <Clock size={8} /> {fDate(version.extracted_at)}
                  </p>
                </div>
                <GlowBadge color={env === 'ptu' ? 'amber' : 'cyan'} size="sm">
                  {env.toUpperCase()}
                </GlowBadge>
              </>
            ) : (
              <div className="w-28 h-10 bg-slate-900/50 rounded animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {/* ── Stat grid ────────────────────────────────────────────────── */}
      {statsLoading ? (
        <LoadingGrid rows={1} cols={6} message="LOADING DATABASE…" />
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {DB_ENTRIES.map((entry, i) => (
            <StatCard
              key={entry.key}
              entry={entry}
              value={stats[entry.key as keyof typeof stats] as number ?? 0}
              max={maxStat}
              delay={i * 0.06}
            />
          ))}
        </div>
      ) : null}

      {/* ── Spotlight + Changelog ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Ship spotlight */}
        <motion.div
          className="lg:col-span-3"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35 }}
        >
          <div className="sci-panel h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
              <span className="font-orbitron text-[10px] font-bold text-slate-500 tracking-widest uppercase flex items-center gap-1.5">
                <Rocket size={10} />
                Ship Spotlight
              </span>
              <button
                type="button"
                onClick={() => refetchRandom()}
                disabled={shipFetching}
                className="sci-btn-ghost py-1 px-2 text-[10px] gap-1"
              >
                <Shuffle size={9} className={shipFetching ? 'animate-spin' : ''} />
                Random
              </button>
            </div>

            {randomShip ? (
              <div className="flex-1 p-4 flex flex-col gap-4">
                {/* Ship thumbnail */}
                {(randomShip.thumbnail_large || randomShip.thumbnail) && (
                  <div className="relative h-44 rounded-sm overflow-hidden bg-slate-900">
                    <Image
                      src={randomShip.thumbnail_large || randomShip.thumbnail!}
                      alt={randomShip.name}
                      fill
                      className="object-cover object-center scale-110"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                  </div>
                )}

                {/* Ship identity */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-orbitron text-xl font-black text-slate-100 leading-tight truncate">
                      {randomShip.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {randomShip.manufacturer_code && (
                        <GlowBadge color="cyan" size="xs">{randomShip.manufacturer_code}</GlowBadge>
                      )}
                      {randomShip.role && (
                        <GlowBadge color="slate" size="xs">{randomShip.role}</GlowBadge>
                      )}
                      {randomShip.career && (
                        <span className="font-mono-sc text-[10px] text-slate-600">{randomShip.career}</span>
                      )}
                    </div>
                  </div>
                  {randomShip.variant_type && randomShip.variant_type !== 'Base' && (
                    <GlowBadge color="amber" size="xs">{randomShip.variant_type}</GlowBadge>
                  )}
                </div>

                {/* Key stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Crew',      val: randomShip.crew_size != null ? String(randomShip.crew_size) : null, unit: '' },
                    { label: 'Cargo',     val: randomShip.cargo_capacity != null ? fNumber(randomShip.cargo_capacity) : null, unit: 'SCU' },
                    { label: 'SCM Speed', val: randomShip.scm_speed != null ? fNumber(randomShip.scm_speed) : null, unit: 'm/s' },
                    { label: 'Max Speed', val: randomShip.max_speed != null ? fNumber(randomShip.max_speed) : null, unit: 'm/s' },
                    { label: 'Shield HP', val: randomShip.shield_hp != null ? fNumber(randomShip.shield_hp) : null, unit: '' },
                    { label: 'Total HP',  val: randomShip.total_hp != null ? fNumber(randomShip.total_hp) : null, unit: '' },
                    { label: 'Mass',      val: randomShip.mass != null ? fNumber(randomShip.mass) : null, unit: 'kg' },
                    { label: 'Min Crew',  val: randomShip.min_crew != null ? String(randomShip.min_crew) : null, unit: '' },
                  ].filter(s => s.val != null).slice(0, 6).map(stat => (
                    <div key={stat.label} className="sci-panel px-3 py-2">
                      <p className="font-mono-sc text-[9px] text-slate-600 uppercase tracking-widest">{stat.label}</p>
                      <p className="font-orbitron text-sm font-bold text-slate-200 mt-0.5">
                        {stat.val}
                        {stat.unit && <span className="text-[10px] text-slate-600 ml-1">{stat.unit}</span>}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Combat stats bar row */}
                {(randomShip.weapon_damage_total || randomShip.missile_damage_total) && (
                  <div className="flex gap-3 flex-wrap">
                    {randomShip.weapon_damage_total != null && randomShip.weapon_damage_total > 0 && (
                      <div className="flex items-center gap-2">
                        <Zap size={10} className="text-red-400 shrink-0" />
                        <span className="font-mono-sc text-[10px] text-slate-600">Weapon DPS</span>
                        <span className="font-orbitron text-xs text-red-400">{fNumber(randomShip.weapon_damage_total)}</span>
                      </div>
                    )}
                    {randomShip.missile_damage_total != null && randomShip.missile_damage_total > 0 && (
                      <div className="flex items-center gap-2">
                        <Layers size={10} className="text-orange-400 shrink-0" />
                        <span className="font-mono-sc text-[10px] text-slate-600">Missile DMG</span>
                        <span className="font-orbitron text-xs text-orange-400">{fNumber(randomShip.missile_damage_total)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* CTA */}
                <div className="mt-auto pt-1">
                  <Link
                    href={`/ships/${randomShip.uuid}`}
                    className="sci-btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
                  >
                    Full data sheet <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex-1 p-4"><LoadingGrid rows={3} cols={3} message="LOADING…" /></div>
            )}
          </div>
        </motion.div>

        {/* Changelog feed */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="sci-panel h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
              <div>
                <span className="font-orbitron text-[10px] font-bold text-slate-500 tracking-widest uppercase flex items-center gap-1.5">
                  <BookOpen size={10} />
                  Recent Changes
                </span>
                {changelogSummary && (
                  <p className="font-mono-sc text-[9px] text-slate-700 mt-0.5">
                    {changelogSummary.total.toLocaleString('en-US')} entities tracked
                  </p>
                )}
              </div>
              <Link href="/changelog" className="sci-btn-ghost py-1 px-2 text-[10px] gap-1">
                All <ArrowRight size={9} />
              </Link>
            </div>

            {/* Change summary badges */}
            {byChange && Object.keys(byChange).length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800/40">
                {byChange.added    > 0 && <span className="font-mono-sc text-[10px] text-green-400">+{byChange.added} added</span>}
                {byChange.modified > 0 && <span className="font-mono-sc text-[10px] text-amber-400">~{byChange.modified} modified</span>}
                {byChange.removed  > 0 && <span className="font-mono-sc text-[10px] text-red-400">-{byChange.removed} removed</span>}
              </div>
            )}

            {/* Feed */}
            <div className="flex-1 overflow-y-auto py-1">
              {changelog?.data.map((entry) => (
                <ChangelogRow key={entry.id} entry={entry} />
              ))}
              {!changelog && (
                <div className="p-4"><LoadingGrid rows={4} cols={3} message="" /></div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Tools ────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <div className="flex items-center gap-3 mb-3">
          <span className="font-orbitron text-[10px] font-bold text-slate-600 tracking-widest uppercase">
            Tools & Calculators
          </span>
          <div className="flex-1 h-px bg-slate-800" />
          <div className="flex items-center gap-2">
            {(['combat', 'economy', 'data'] as ToolCategory[]).map(cat => (
              <span key={cat} className={`font-mono-sc text-[9px] uppercase tracking-widest ${CATEGORY_LABEL[cat].color}`}>
                ■ {CATEGORY_LABEL[cat].label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {TOOLS.map(({ to, icon: Icon, label, sub, category, badge, comingSoon }, i) => {
            const cat = CATEGORY_LABEL[category];
            const inner = (
              <div className={[
                'sci-panel p-4 h-full border transition-colors duration-150',
                comingSoon
                  ? 'opacity-40 cursor-default border-transparent'
                  : `${cat.border} group cursor-pointer`,
              ].join(' ')}>
                <div className="flex items-start justify-between mb-3">
                  <Icon size={18} className={comingSoon ? 'text-slate-700 shrink-0' : 'text-slate-500 group-hover:text-slate-200 transition-colors shrink-0'} />
                  <div className="flex flex-col items-end gap-1">
                    {comingSoon ? (
                      <span className="font-orbitron text-[8px] tracking-widest text-slate-600 border border-slate-800 rounded-sm px-1.5 py-0.5 uppercase">
                        SOON
                      </span>
                    ) : badge && (
                      <span className="font-orbitron text-[8px] tracking-widest text-slate-700 border border-slate-800 rounded-sm px-1 py-0.5 uppercase">
                        {badge}
                      </span>
                    )}
                    <span className={`font-mono-sc text-[8px] uppercase tracking-widest ${comingSoon ? 'text-slate-700' : cat.color} opacity-60`}>
                      {cat.label}
                    </span>
                  </div>
                </div>
                <p className={`font-orbitron text-sm font-bold mb-1 leading-tight ${comingSoon ? 'text-slate-700' : 'text-slate-300 group-hover:text-slate-100 transition-colors'}`}>
                  {label}
                </p>
                <p className={`font-rajdhani text-xs leading-snug ${comingSoon ? 'text-slate-800' : 'text-slate-600 group-hover:text-slate-500 transition-colors'}`}>
                  {sub}
                </p>
              </div>
            );
            return (
              <motion.div
                key={to}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.52 + i * 0.04 }}
              >
                {comingSoon ? inner : <Link href={to} className="block h-full">{inner}</Link>}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Database quick-access ────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
        <div className="sci-panel px-2 py-1.5">
          <div className="flex flex-wrap items-stretch divide-x divide-slate-800/60">
            {DB_ENTRIES.map(({ key, label, icon: Icon, color, to }) => (
              <Link
                key={key}
                href={to}
                className="flex items-center gap-2 px-4 py-2 hover:bg-white/[0.03] transition-colors group flex-1 min-w-0"
              >
                <Icon size={12} className={`${color} shrink-0`} />
                <span className="font-rajdhani font-semibold text-xs text-slate-500 group-hover:text-slate-300 uppercase tracking-wide transition-colors whitespace-nowrap">
                  {label}
                </span>
                {stats && (
                  <span className="ml-auto font-mono-sc text-[10px] text-slate-700 hidden sm:block">
                    {(stats[key as keyof typeof stats] as number ?? 0).toLocaleString('en-US')}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </motion.div>

    </div>
  );
}
