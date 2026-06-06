'use client';

/**
 * CommoditiesNewPage — Merged commodities & minerals library
 * Combines trade goods (paginated list with filters) and the full minerals
 * reference (sortable table with detail drawer), using the Minerals Library style.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Crosshair,
  FlaskConical,
  Link as LinkIcon,
  Package,
  Pickaxe,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { ListFilterBar, ListFilterResetButton, ListFilterSelect } from '@/components/ui/ListFilters';
import { useListQueryState } from '@/hooks/useListQueryState';
import { useDebounce } from '@/hooks/useDebounce';
import type { MiningElement } from '@/types/api';
import { ORE_PRICES } from '@/data/mining-static';

// ── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'trade' | 'minerals';

// ── Trade Goods (from CommoditiesPage) ───────────────────────────────────────

const TRADE_LIMIT = 30;

function TradeGoodsTab() {
  const { env } = useEnv();
  const { page, search, debouncedSearch, updateSearch, updatePageWithScroll, setPage } = useListQueryState();
  const [activeCategory, setActiveCategory] = useState('All');

  const { data: categories } = useQuery({
    queryKey: ['commodities.categories', env],
    queryFn: () => api.commodities.categories(env),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['commodities.list', env, { page, search: debouncedSearch, category: activeCategory }],
    queryFn: () =>
      api.commodities.list({
        env,
        page,
        limit: TRADE_LIMIT,
        search: debouncedSearch || undefined,
        category: activeCategory === 'All' ? undefined : activeCategory,
      }),
  });

  return (
    <div className="min-w-0">
      <ListFilterBar>
        <ListFilterSelect
          value={activeCategory === 'All' ? '' : activeCategory}
          onChange={(value) => { setActiveCategory(value || 'All'); setPage(1); }}
          options={(categories ?? []).map((c) => ({ label: c.count ? `${c.label} (${c.count})` : c.label, value: c.label }))}
          allLabel="All categories"
        />
        {activeCategory !== 'All' && (
          <ListFilterResetButton onClick={() => { setActiveCategory('All'); setPage(1); }} />
        )}
      </ListFilterBar>

        <div className="sci-panel p-3 mb-4 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400 font-mono-sc">Raw ores, refined materials, fuel/gas and trade goods. Use Mining Calculator for yield and profit tools.</p>
          <Link href="/mining-calculator" className="text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap">Open Mining Calculator</Link>
        </div>

        <div className="mb-4 relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search commodities…"
            className="sci-input pl-6 pr-7 py-1.5 text-xs w-full sm:w-64"
          />
          {search && (
            <button type="button" onClick={() => updateSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
              <X size={11} />
            </button>
          )}
        </div>

        {isLoading ? <LoadingGrid message="LOADING…" />
          : error ? <ErrorState error={error as Error} onRetry={() => void refetch()} />
          : !data?.data?.length ? <EmptyState icon="📦" title="No commodities found" />
          : (
            <>
              <div className="space-y-1.5">
                {(data.data ?? []).map((c, i) => (
                  <motion.div key={c.uuid} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                    <div className="sci-panel px-4 py-3 hover:border-cyan-800 transition-colors">
                      <div className="flex items-center gap-3">
                        <Link href={`/commodities/${c.uuid}`} className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-orbitron text-sm text-slate-200">{c.name}</span>
                            {c.type && <GlowBadge color="slate">{c.type}</GlowBadge>}
                            {c.sub_type && <GlowBadge color="slate" size="xs">{c.sub_type}</GlowBadge>}
                          </div>
                          {c.symbol && <p className="text-xs font-mono-sc text-slate-600 mt-0.5">{c.symbol}</p>}
                        </Link>
                        <div className="text-right shrink-0 space-y-1">
                          {c.occupancy_scu != null && <p className="text-xs font-mono-sc text-slate-600">{c.occupancy_scu} μSCU</p>}
                          <Link href={`/missions?search=${encodeURIComponent(c.name)}`} className="text-[10px] text-amber-500 hover:text-amber-300">Mission leads</Link>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              {data && <Pagination className="mt-6" page={data.page} totalPages={data.pages} onPageChange={updatePageWithScroll} />}
            </>
          )}
    </div>
  );
}

// ── Minerals Library (from MineralsLibraryPage) ───────────────────────────────

function lookupPrice(element: MiningElement): number | null {
  const lower = (element.name ?? element.class_name ?? '').toLowerCase();
  const match = ORE_PRICES.find((p) => lower.includes(p.classFragment));
  return match?.pricePerScu ?? null;
}

function dangerColor(v: number | null): string {
  if (v == null) return 'text-slate-500';
  if (v < 0.3) return 'text-green-400';
  if (v < 0.6) return 'text-amber-400';
  return 'text-red-400';
}

function rarityLabel(instability: number | null, resistance: number | null): string {
  const score = (instability ?? 0) + (resistance ?? 0);
  if (score >= 1.5) return 'Ultra Rare';
  if (score >= 1.0) return 'Rare';
  if (score >= 0.5) return 'Uncommon';
  return 'Common';
}

function rarityColor(label: string): 'amber' | 'purple' | 'cyan' | 'slate' {
  if (label === 'Ultra Rare') return 'amber';
  if (label === 'Rare') return 'purple';
  if (label === 'Uncommon') return 'cyan';
  return 'slate';
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(v: number | null | undefined, d = 2): string {
  if (v == null) return '—';
  return v.toFixed(d);
}

type SortKey = 'name' | 'price' | 'instability' | 'resistance' | 'optimalWindow' | 'avgProb' | 'rocks';
type SortDir = 'asc' | 'desc';

function SortTh({ label, sk, current, dir, onSort, left }: {
  label: string; sk: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; left?: boolean;
}) {
  const active = current === sk;
  const Icon = active ? (dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      onClick={() => onSort(sk)}
      className={`p-2 cursor-pointer select-none hover:text-slate-300 transition-colors text-[10px] uppercase tracking-widest ${left ? 'text-left' : 'text-center'} ${active ? 'text-cyan-500' : 'text-slate-600'}`}
    >
      <span className="inline-flex items-center gap-1">{label} <Icon size={9} /></span>
    </th>
  );
}

function MineralDetail({ element }: { element: MiningElement }) {
  const price = lookupPrice(element);
  const optWin = element.optimalWindowMidpoint ?? element.optimal_window_midpoint;
  const winThin = element.optimalWindowThinness ?? element.optimal_window_thinness;
  const windowHalf = winThin != null ? (1 - winThin) / 2 * 0.15 + 0.075 : 0.075;
  const windowStart = optWin != null ? Math.max(0, optWin - windowHalf) : null;
  const windowEnd = optWin != null ? Math.min(1, optWin + windowHalf) : null;
  const rarity = rarityLabel(element.instability, element.resistance);
  const rarityCol = rarityColor(rarity);

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <ScifiPanel title={element.name ?? element.class_name ?? 'Unknown'} subtitle="Mineral detail">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="sci-panel p-2 text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-600 font-mono-sc mb-0.5">Rarity</div>
            <GlowBadge color={rarityCol} size="sm">{rarity}</GlowBadge>
          </div>
          <div className="sci-panel p-2 text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-600 font-mono-sc mb-0.5">Instability</div>
            <div className={`text-sm font-orbitron font-bold ${dangerColor(element.instability)}`}>{fmtNum(element.instability)}</div>
          </div>
          <div className="sci-panel p-2 text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-600 font-mono-sc mb-0.5">Resistance</div>
            <div className={`text-sm font-orbitron font-bold ${dangerColor(element.resistance)}`}>{fmtNum(element.resistance)}</div>
          </div>
          <div className="sci-panel p-2 text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-600 font-mono-sc mb-0.5">Optimal Window</div>
            <div className="text-sm font-orbitron font-bold text-blue-400">{optWin != null ? `${(optWin * 100).toFixed(0)}%` : '—'}</div>
          </div>
          <div className="sci-panel p-2 text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-600 font-mono-sc mb-0.5">Explosion ×</div>
            <div className="text-sm font-orbitron font-bold text-red-400">{fmtNum(element.explosionMultiplier ?? element.explosion_multiplier)}</div>
          </div>
          <div className="sci-panel p-2 text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-600 font-mono-sc mb-0.5">Cluster Factor</div>
            <div className="text-sm font-orbitron font-bold text-purple-400">{fmtNum(element.clusterFactor ?? element.cluster_factor)}</div>
          </div>
          <div className="sci-panel p-2 text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-600 font-mono-sc mb-0.5">Found In</div>
            <div className="text-sm font-orbitron font-bold text-cyan-400">{element.rocksContaining ?? element.rocks_containing ?? '—'} rocks</div>
          </div>
          <div className="sci-panel p-2 text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-600 font-mono-sc mb-0.5">Est. Price/SCU</div>
            <div className={`text-sm font-orbitron font-bold ${price != null && price > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
              {price != null && price > 0 ? `${price.toLocaleString()} aUEC` : 'N/A'}
            </div>
          </div>
        </div>

        {windowStart != null && windowEnd != null && optWin != null && (
          <div className="mb-3">
            <div className="text-[10px] text-slate-600 font-mono-sc mb-1">
              Laser power window ({(windowStart * 100).toFixed(0)}% – {(windowEnd * 100).toFixed(0)}%)
            </div>
            <div className="h-6 bg-slate-800 rounded-sm border border-slate-700/50 overflow-hidden relative">
              <div
                className="absolute h-full bg-green-900/40 border-r border-green-600/50"
                style={{ left: `${windowStart * 100}%`, right: `${(1 - windowEnd) * 100}%` }}
              />
              <div className="absolute h-full w-0.5 bg-cyan-400 top-0" style={{ left: `${optWin * 100}%` }} />
              <div className="absolute inset-0 flex justify-between px-1 items-center pointer-events-none text-[8px] text-slate-600 font-mono-sc">
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link
            href="/mining-calculator?tab=finder"
            className="flex items-center gap-1.5 text-[10px] font-mono-sc text-cyan-500 hover:text-cyan-300 border border-cyan-900/50 hover:border-cyan-700 px-2 py-1.5 rounded-sm transition-colors"
          >
            <Crosshair size={11} /> Find rocks with this mineral
          </Link>
          <Link
            href="/mining-calculator?tab=profit"
            className="flex items-center gap-1.5 text-[10px] font-mono-sc text-green-500 hover:text-green-300 border border-green-900/50 hover:border-green-700 px-2 py-1.5 rounded-sm transition-colors"
          >
            <FlaskConical size={11} /> Calculate profit
          </Link>
          {price != null && price > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] font-mono-sc text-amber-400 border border-amber-900/50 px-2 py-1.5 rounded-sm">
              ~{price.toLocaleString()} aUEC/SCU (est.)
            </span>
          )}
        </div>
      </ScifiPanel>
    </motion.div>
  );
}

function MineralsTab() {
  const { env } = useEnv();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('price');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 250);

  const { data: minerals = [], isLoading, error } = useQuery({
    queryKey: ['minerals-library', env],
    queryFn: () => api.mining.elements(env),
    staleTime: 30 * 60_000,
  });

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return minerals.filter((m) => !q || (m.name ?? m.class_name ?? '').toLowerCase().includes(q));
  }, [minerals, debouncedSearch]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case 'name': av = a.name ?? ''; bv = b.name ?? ''; break;
        case 'price': av = lookupPrice(a) ?? -1; bv = lookupPrice(b) ?? -1; break;
        case 'instability': av = a.instability ?? 0; bv = b.instability ?? 0; break;
        case 'resistance': av = a.resistance ?? 0; bv = b.resistance ?? 0; break;
        case 'optimalWindow': av = a.optimalWindowMidpoint ?? a.optimal_window_midpoint ?? 0; bv = b.optimalWindowMidpoint ?? b.optimal_window_midpoint ?? 0; break;
        case 'avgProb': av = a.avgProbabilityPct ?? a.avg_probability_pct ?? 0; bv = b.avgProbabilityPct ?? b.avg_probability_pct ?? 0; break;
        case 'rocks': av = a.rocksContaining ?? a.rocks_containing ?? 0; bv = b.rocksContaining ?? b.rocks_containing ?? 0; break;
      }
      if (typeof av === 'string') {
        const c = av.localeCompare(String(bv));
        return sortDir === 'asc' ? c : -c;
      }
      return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
  }, [filtered, sortKey, sortDir]);

  const selectedElement = useMemo(() => sorted.find((e) => e.uuid === selectedUuid) ?? null, [sorted, selectedUuid]);
  const priceableCount = useMemo(() => minerals.filter((m) => (lookupPrice(m) ?? 0) > 0).length, [minerals]);

  if (isLoading) return <LoadingGrid message="Loading minerals..." />;
  if (error) return <ErrorState error={error as Error} />;
  if (!minerals.length) return <EmptyState title="No minerals found" />;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="sci-panel px-3 py-1.5 text-[10px] font-mono-sc text-slate-500 flex items-center gap-1.5">
          <FlaskConical size={10} /> {priceableCount} with known price
        </div>
        <div className="sci-panel px-3 py-1.5 text-[10px] font-mono-sc text-slate-500 flex items-center gap-1.5">
          <Crosshair size={10} /> Click a row to inspect
        </div>
        <Link
          href="/mining-calculator"
          className="sci-panel px-3 py-1.5 text-[10px] font-mono-sc text-cyan-500 hover:text-cyan-300 flex items-center gap-1.5 transition-colors border-cyan-900/40 hover:border-cyan-700"
        >
          <LinkIcon size={10} /> Open Mining Calculator
        </Link>
      </div>

      <ScifiPanel
        title="Mineral Reference"
        subtitle={`${sorted.length} of ${minerals.length} minerals`}
        actions={
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search minerals..."
              className="sci-input pl-6 pr-7 py-1 text-xs w-48"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                <X size={11} />
              </button>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono-sc">
            <thead>
              <tr className="border-b border-slate-800">
                <SortTh label="Mineral" sk="name" current={sortKey} dir={sortDir} onSort={handleSort} left />
                <SortTh label="Rarity" sk="instability" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Instab" sk="instability" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Resist" sk="resistance" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Opt Win" sk="optimalWindow" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Avg Prob" sk="avgProb" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Rocks" sk="rocks" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Price/SCU" sk="price" current={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((el) => {
                const price = lookupPrice(el);
                const rarity = rarityLabel(el.instability, el.resistance);
                const rarityCol = rarityColor(rarity);
                const optWin = el.optimalWindowMidpoint ?? el.optimal_window_midpoint;
                const avgProb = el.avgProbabilityPct ?? el.avg_probability_pct;
                const isSelected = selectedUuid === el.uuid;
                return (
                  <motion.tr
                    key={el.uuid}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setSelectedUuid(isSelected ? null : el.uuid)}
                    className={`border-b border-slate-800/40 cursor-pointer transition-colors ${
                      isSelected ? 'bg-cyan-950/30 border-cyan-800/40' : 'hover:bg-slate-800/20'
                    }`}
                  >
                    <td className="p-2 text-slate-200 font-semibold">{el.name ?? el.class_name ?? el.uuid.slice(0, 8)}</td>
                    <td className="p-2 text-center">
                      <GlowBadge color={rarityCol} size="sm">{rarity}</GlowBadge>
                    </td>
                    <td className="p-2 text-center">
                      <span className={dangerColor(el.instability)}>{fmtNum(el.instability)}</span>
                    </td>
                    <td className="p-2 text-center">
                      <span className={dangerColor(el.resistance)}>{fmtNum(el.resistance)}</span>
                    </td>
                    <td className="p-2 text-center text-blue-400">
                      {optWin != null ? `${(optWin * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="p-2 text-center text-green-400">
                      {avgProb != null ? fmtPct(avgProb / 100) : '—'}
                    </td>
                    <td className="p-2 text-center text-cyan-400">
                      {el.rocksContaining ?? el.rocks_containing ?? '—'}
                    </td>
                    <td className="p-2 text-right">
                      {price != null && price > 0 ? (
                        <span className="text-amber-400">{price.toLocaleString()} aUEC</span>
                      ) : price === 0 ? (
                        <span className="text-slate-600">N/A</span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ScifiPanel>

      {selectedElement && (
        <div className="mt-4">
          <MineralDetail element={selectedElement} />
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CommoditiesNewPage() {
  const [activeTab, setActiveTab] = useState<Tab>('trade');

  const TABS: { id: Tab; label: string; icon: React.ReactNode; subtitle: string }[] = [
    { id: 'trade', label: 'Trade Goods', icon: <Package size={14} />, subtitle: 'Commodities, ores and trade items' },
    { id: 'minerals', label: 'Minerals Library', icon: <Pickaxe size={14} />, subtitle: 'Mining elements — properties, prices, rock data' },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Commodities"
        subtitle="Trade goods catalogue and complete minerals reference"
      />

      <div className="mb-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max pb-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-mono-sc transition-all whitespace-nowrap border ${
                activeTab === tab.id
                  ? 'border-cyan-500/70 bg-cyan-950/30 text-cyan-300'
                  : 'border-slate-700/40 text-slate-500 hover:border-slate-600/60 hover:text-slate-300'
              }`}
            >
              <span className={activeTab === tab.id ? 'text-cyan-400' : 'text-slate-600'}>
                {tab.icon}
              </span>
              <span className="font-semibold">{tab.label}</span>
            </button>
          ))}
        </div>
        {TABS.find((t) => t.id === activeTab) && (
          <div className="mt-1.5 text-[10px] text-slate-600 font-mono-sc uppercase tracking-widest pl-0.5">
            {TABS.find((t) => t.id === activeTab)!.subtitle}
          </div>
        )}
      </div>

      {activeTab === 'trade' && <TradeGoodsTab />}
      {activeTab === 'minerals' && <MineralsTab />}
    </PageShell>
  );
}
