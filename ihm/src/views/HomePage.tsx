'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Image from 'next/image';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bug,
  ChevronRight,
  ClipboardList,
  Clock,
  Crosshair,
  Globe,
  Layers,
  Minus,
  Pickaxe,
  Plus,
  RefreshCw,
  Rocket,
  Scroll,
  Search,
  Shuffle,
  SlidersHorizontal,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { useAuth } from '@/contexts/AuthContext';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { NAV_GROUPS } from '@/components/layout/navigation';
import { fDate, fNumber } from '@/utils/formatters';
import type { ChangelogEntry, StatsOverview } from '@/types/api';

// ── Config ────────────────────────────────────────────────────────────────────

type SectionDef = {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  border: string;
  glow: string;
  statKey: keyof StatsOverview | null;
  links: { label: string; to: string }[];
};

const HOME_SECTION_META: Record<string, Omit<SectionDef, 'label' | 'links'>> = {
  ships: {
    id: 'ships',
    icon: Rocket,
    color: 'text-cyan-400',
    border: 'border-cyan-900/50 hover:border-cyan-700/60',
    glow: 'from-cyan-950/20',
    statKey: 'ships',
  },
  equipment: {
    id: 'equipment',
    icon: Crosshair,
    color: 'text-violet-400',
    border: 'border-violet-900/50 hover:border-violet-700/60',
    glow: 'from-violet-950/20',
    statKey: 'items',
  },
  economy: {
    id: 'economy',
    icon: TrendingUp,
    color: 'text-amber-400',
    border: 'border-amber-900/50 hover:border-amber-700/60',
    glow: 'from-amber-950/20',
    statKey: 'commodities',
  },
  universe: {
    id: 'universe',
    icon: Globe,
    color: 'text-emerald-400',
    border: 'border-emerald-900/50 hover:border-emerald-700/60',
    glow: 'from-emerald-950/20',
    statKey: null,
  },
};

const SECTIONS: SectionDef[] = NAV_GROUPS.map((group) => ({
  ...HOME_SECTION_META[group.id],
  label: group.label,
  links: group.items.filter((item) => !item.auth).map((item) => ({
    label: item.label,
    to: item.to,
  })),
}));

type ToolCategory = 'combat' | 'economy' | 'data';

const TOOLS: {
  to: string;
  icon: React.ElementType;
  label: string;
  sub: string;
  category: ToolCategory;
  badge?: string;
}[] = [
  { to: '/compare',             icon: BarChart3,         label: 'Compare',             sub: 'Side-by-side ship & component stats',    category: 'data' },
  { to: '/ranking',             icon: Trophy,            label: 'Ranking',             sub: 'Top ships by DPS, cargo, speed…',        category: 'data' },
  { to: '/crafting-calculator', icon: Scroll,            label: 'Crafting Calculator', sub: 'Recipes, ingredients & batch calc',      category: 'economy' },
  { to: '/missions',            icon: ClipboardList,     label: 'Missions',            sub: 'Contracts by faction & legality',        category: 'data' },
  { to: '/loadout-manager',     icon: SlidersHorizontal, label: 'Loadout Manager',     sub: 'DPS, power & shield calculator',         category: 'combat',  badge: 'DPS' },
  { to: '/fps-calculator',      icon: Crosshair,         label: 'FPS Calculator',      sub: 'TTK & damage breakdown for weapons',     category: 'combat',  badge: 'TTK' },
  { to: '/trade-calculator',    icon: TrendingUp,        label: 'Trade Calculator',    sub: 'Profit & commodity prices',              category: 'economy', badge: 'aUEC' },
  { to: '/mining-calculator',   icon: Pickaxe,           label: 'Mining Calculator',   sub: 'Ore yield & laser settings',             category: 'economy', badge: 'Yield' },
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

function entityHref(type: string, uuid: string): string | null {
  if (type === 'ship') return `/ships/${uuid}`;
  if (type === 'component') return `/ships-components/${uuid}`;
  if (type === 'item') return `/items/${uuid}`;
  if (type === 'commodity') return '/commodities';
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ section, stats, delay }: { section: SectionDef; stats: StatsOverview | undefined; delay: number }) {
  const count = section.statKey ? stats?.[section.statKey] : null;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="h-full">
      <div className={`sci-panel border ${section.border} bg-linear-to-b ${section.glow} to-transparent overflow-hidden h-full transition-colors`}>
        <div className="px-4 py-2.5 border-b border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <section.icon size={14} className={section.color} strokeWidth={1.5} />
            <span className="font-orbitron text-[10px] font-bold tracking-widest uppercase text-slate-400">
              {section.label}
            </span>
          </div>
          {count != null && (
            <span className="font-orbitron text-[10px] font-black text-slate-600 tabular-nums">
              {count.toLocaleString('en-US')}
            </span>
          )}
        </div>
        <div className="py-1">
          {section.links.map(link => (
            <Link
              key={link.to}
              href={link.to}
              className="flex items-center gap-2 px-4 py-1.5 hover:bg-white/5 transition-colors group"
            >
              <ChevronRight size={10} className={`${section.color} opacity-40 group-hover:opacity-80 shrink-0`} />
              <span className="font-rajdhani font-semibold text-sm text-slate-500 group-hover:text-slate-200 transition-colors">
                {link.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function ChangelogRow({ entry }: { entry: ChangelogEntry }) {
  const ct = (entry.change_type ?? 'modified') as 'added' | 'removed' | 'modified';
  const { Icon, cls, bg } = CHANGE_ICON[ct] ?? CHANGE_ICON.modified;
  const entityColor = ENTITY_COLOR[entry.entity_type] ?? 'text-slate-400';
  const href = entityHref(entry.entity_type, entry.entity_uuid);
  const content = (
    <>
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-sm border shrink-0 ${bg}`}>
        <Icon size={9} className={cls} />
      </span>
      <span className="flex-1 min-w-0 text-sm font-rajdhani text-slate-300 truncate">{entry.entity_name}</span>
      <span className={`text-[10px] font-mono-sc shrink-0 ${entityColor}`}>{entry.entity_type}</span>
    </>
  );

  if (!href) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.025] transition-colors rounded-sm">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.025] hover:text-cyan-300 transition-colors rounded-sm"
    >
      {content}
    </Link>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { env } = useEnv();
  const { user } = useAuth();
  const router = useRouter();
  const [heroSearch, setHeroSearch] = useState('');
  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroSearch.trim()) router.push(`/search?q=${encodeURIComponent(heroSearch.trim())}`);
  };

  const { data: stats } = useQuery({
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

  const byChange = changelog?.data.reduce<Record<string, number>>((acc, e) => {
    acc[e.change_type] = (acc[e.change_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">

      {/* ── Early access banner ───────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-sm border border-amber-800/50 bg-amber-950/20 px-4 py-3">
        <TriangleAlert size={15} className="text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-orbitron text-[10px] font-bold text-amber-400 tracking-widest uppercase mb-0.5">
            Early Access
          </p>
          <p className="font-rajdhani text-sm text-slate-400 leading-snug">
            Starvis is still in active development. Some game data may be incomplete, outdated, or inaccurate while extraction and validation keep improving.
            Your bug reports are invaluable to improve the platform.
          </p>
        </div>
        {user && (
          <Link
            href="/report-bug"
            className="sci-btn-ghost py-1.5 px-3 text-[10px] gap-1.5 whitespace-nowrap shrink-0"
          >
            <Bug size={11} />
            Report a bug
          </Link>
        )}
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="sci-panel relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-cyan-950/20 via-transparent to-violet-950/10 pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-cyan-500/40 to-transparent" />
        <div className="relative px-6 py-8 flex flex-col items-center gap-5 text-center">
          <div>
            <h1 className="font-orbitron text-5xl sm:text-6xl font-black text-cyan-400 glow-text tracking-widest leading-none">
              STARVIS
            </h1>
            <p className="font-mono-sc text-[10px] text-slate-600 tracking-widest uppercase mt-2">
              Star Citizen · Game Database & Toolset
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            {version ? (
              <>
                <GlowBadge color={env === 'ptu' ? 'amber' : 'cyan'} size="sm">
                  {env.toUpperCase()}
                </GlowBadge>
                <span className="font-orbitron text-sm font-bold text-slate-400">SC {version.game_version}</span>
                <span className="font-mono-sc text-[10px] text-slate-600 flex items-center gap-1">
                  <Clock size={8} /> {fDate(version.extracted_at)}
                </span>
              </>
            ) : (
              <div className="w-40 h-6 bg-slate-900/50 rounded animate-pulse" />
            )}
          </div>
          <form onSubmit={handleHeroSearch} className="w-full max-w-xl">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input
                type="text"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                placeholder="Search ships, components, items…"
                className="w-full bg-slate-900/80 border border-slate-700 rounded-sm pl-10 pr-4 py-2.5 text-sm font-rajdhani text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-600 focus:bg-slate-900 transition-colors"
              />
            </div>
          </form>
        </div>
      </div>

      {/* ── Section cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SECTIONS.map((section, i) => (
          <SectionCard key={section.id} section={section} stats={stats} delay={i * 0.08} />
        ))}
      </div>

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
                    { label: 'Crew',        val: randomShip.crew_size != null ? String(randomShip.crew_size) : null, unit: '' },
                    { label: 'Cargo',       val: randomShip.cargo_capacity != null ? fNumber(randomShip.cargo_capacity) : null, unit: 'SCU' },
                    { label: 'SCM Speed',   val: randomShip.scm_speed != null ? fNumber(randomShip.scm_speed) : null, unit: 'm/s' },
                    { label: 'Max Speed',   val: randomShip.max_speed != null ? fNumber(randomShip.max_speed) : null, unit: 'm/s' },
                    { label: 'Shield HP',   val: randomShip.shield_hp != null ? fNumber(randomShip.shield_hp) : null, unit: '' },
                    { label: 'Total HP',    val: randomShip.total_hp != null ? fNumber(randomShip.total_hp) : null, unit: '' },
                    { label: 'Mass',        val: randomShip.mass != null ? fNumber(randomShip.mass) : null, unit: 'kg' },
                    { label: 'Min Crew',    val: randomShip.min_crew != null ? String(randomShip.min_crew) : null, unit: '' },
                    { label: 'H₂ Fuel',    val: randomShip.hydrogen_fuel_capacity != null ? fNumber(randomShip.hydrogen_fuel_capacity) : null, unit: 'L' },
                    { label: 'QT Fuel',     val: randomShip.quantum_fuel_capacity != null ? fNumber(randomShip.quantum_fuel_capacity) : null, unit: 'L' },
                    { label: 'Boost Fwd',   val: randomShip.boost_speed_forward != null ? fNumber(randomShip.boost_speed_forward) : null, unit: 'm/s' },
                    { label: 'Shield Regen',val: randomShip.shield_regen != null ? fNumber(randomShip.shield_regen) : null, unit: 'hp/s' },
                  ].filter(s => s.val != null).map(stat => (
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

                {/* Ship description */}
                {randomShip.sm_description && (
                  <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-4">
                    {randomShip.sm_description}
                  </p>
                )}

                {/* CTA */}
                <div className="pt-1">
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
          {TOOLS.map(({ to, icon: Icon, label, sub, category, badge }, i) => {
            const cat = CATEGORY_LABEL[category];
            return (
              <motion.div
                key={to}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.52 + i * 0.04 }}
              >
                <Link href={to} className="block h-full">
                  <div className={`sci-panel p-4 h-full border transition-colors duration-150 ${cat.border} group cursor-pointer`}>
                    <div className="flex items-start justify-between mb-3">
                      <Icon size={18} className="text-slate-500 group-hover:text-slate-200 transition-colors shrink-0" strokeWidth={1.5} />
                      <div className="flex flex-col items-end gap-1">
                        {badge && (
                          <span className="font-orbitron text-[8px] tracking-widest text-slate-700 border border-slate-800 rounded-sm px-1 py-0.5 uppercase">
                            {badge}
                          </span>
                        )}
                        <span className={`font-mono-sc text-[8px] uppercase tracking-widest ${cat.color} opacity-60`}>
                          {cat.label}
                        </span>
                      </div>
                    </div>
                    <p className="font-orbitron text-sm font-bold mb-1 leading-tight text-slate-300 group-hover:text-slate-100 transition-colors">
                      {label}
                    </p>
                    <p className="font-rajdhani text-xs leading-snug text-slate-600 group-hover:text-slate-500 transition-colors">
                      {sub}
                    </p>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </motion.div>


    </div>
  );
}
