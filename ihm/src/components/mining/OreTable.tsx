import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import type { MiningElement } from '@/types/api';
import { dangerColor, fNum, pct } from '@/views/mining-helpers';
import { ORE_PRICES } from '@/data/mining-static';

type SortKey = 'name' | 'avgProb' | 'avgMin' | 'avgMax' | 'instability' | 'resistance' | 'optimalWindow' | 'rocksContaining' | 'price';
type SortDir = 'asc' | 'desc';

function lookupPrice(element: MiningElement): number | null {
  const lower = (element.name ?? element.class_name ?? '').toLowerCase();
  const match = ORE_PRICES.find((p) => lower.includes(p.classFragment));
  return match?.pricePerScu ?? null;
}

export function OreTable() {
  const { env } = useEnv();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('avgProb');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);

  const { data: elements, isLoading, error } = useQuery({
    queryKey: ['mining.elements', env],
    queryFn: () => api.mining.elements(env),
    staleTime: 30 * 60_000,
  });

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    if (!elements) return [];
    const q = search.trim().toLowerCase();
    return elements.filter((el) => !q || (el.name ?? el.class_name ?? '').toLowerCase().includes(q));
  }, [elements, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: number | string | null = null;
      let bv: number | string | null = null;
      switch (sortKey) {
        case 'name':
          av = a.name ?? a.class_name ?? '';
          bv = b.name ?? b.class_name ?? '';
          break;
        case 'avgProb':
          av = a.avgProbabilityPct ?? a.avg_probability_pct ?? 0;
          bv = b.avgProbabilityPct ?? b.avg_probability_pct ?? 0;
          break;
        case 'avgMin':
          av = a.avgMinPct ?? a.avg_min_pct ?? 0;
          bv = b.avgMinPct ?? b.avg_min_pct ?? 0;
          break;
        case 'avgMax':
          av = a.avgMaxPct ?? a.avg_max_pct ?? 0;
          bv = b.avgMaxPct ?? b.avg_max_pct ?? 0;
          break;
        case 'instability':
          av = a.instability ?? 0;
          bv = b.instability ?? 0;
          break;
        case 'resistance':
          av = a.resistance ?? 0;
          bv = b.resistance ?? 0;
          break;
        case 'optimalWindow':
          av = a.optimalWindowMidpoint ?? a.optimal_window_midpoint ?? 0;
          bv = b.optimalWindowMidpoint ?? b.optimal_window_midpoint ?? 0;
          break;
        case 'rocksContaining':
          av = a.rocksContaining ?? a.rocks_containing ?? 0;
          bv = b.rocksContaining ?? b.rocks_containing ?? 0;
          break;
        case 'price':
          av = lookupPrice(a) ?? -1;
          bv = lookupPrice(b) ?? -1;
          break;
      }
      if (typeof av === 'string') {
        const cmp = av.localeCompare(String(bv ?? ''));
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const diff = (Number(av) - Number(bv));
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [filtered, sortKey, sortDir]);

  const selectedElement = useMemo(() => sorted.find((e) => e.uuid === selectedUuid) ?? null, [sorted, selectedUuid]);

  if (isLoading) return <LoadingGrid message="Loading minerals..." />;
  if (error) return <ErrorState error={error as Error} />;

  return (
    <div className="space-y-4">
      <ScifiPanel
        title="Mineral Reference"
        subtitle={`${sorted.length} of ${elements?.length ?? 0} elements — click a row to inspect`}
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
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
              >
                <X size={11} />
              </button>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono-sc">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <SortTh label="Mineral" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} left />
                <SortTh label="Avg Prob" sortKey="avgProb" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Min%" sortKey="avgMin" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Max%" sortKey="avgMax" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Instab" sortKey="instability" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Resist" sortKey="resistance" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Opt Win" sortKey="optimalWindow" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Rocks" sortKey="rocksContaining" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Price/SCU" sortKey="price" current={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((el) => {
                const price = lookupPrice(el);
                const isSelected = selectedUuid === el.uuid;
                return (
                  <motion.tr
                    key={el.uuid}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setSelectedUuid(isSelected ? null : el.uuid)}
                    className={`border-b border-slate-800/40 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-cyan-950/30 border-cyan-800/40'
                        : 'hover:bg-slate-800/20'
                    }`}
                  >
                    <td className="p-2 text-slate-200 font-semibold">
                      {el.name ?? 'Unknown ore'}
                    </td>
                    <td className="p-2 text-center">
                      <span className={el.avgProbabilityPct != null ? 'text-green-400' : 'text-slate-700'}>
                        {el.avgProbabilityPct != null ? pct(el.avgProbabilityPct / 100) : '—'}
                      </span>
                    </td>
                    <td className="p-2 text-center text-slate-400">
                      {el.avgMinPct != null ? pct(el.avgMinPct / 100) : '—'}
                    </td>
                    <td className="p-2 text-center text-slate-400">
                      {el.avgMaxPct != null ? pct(el.avgMaxPct / 100) : '—'}
                    </td>
                    <td className="p-2 text-center">
                      <span className={dangerColor(el.instability)}>
                        {el.instability != null ? fNum(el.instability) : '—'}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <span className={dangerColor(el.resistance)}>
                        {el.resistance != null ? fNum(el.resistance) : '—'}
                      </span>
                    </td>
                    <td className="p-2 text-center text-blue-400">
                      {el.optimalWindowMidpoint != null
                        ? `${(el.optimalWindowMidpoint * 100).toFixed(0)}%`
                        : el.optimal_window_midpoint != null
                          ? `${(el.optimal_window_midpoint * 100).toFixed(0)}%`
                          : '—'}
                    </td>
                    <td className="p-2 text-center text-cyan-400">
                      {el.rocksContaining ?? el.rocks_containing ?? '—'}
                    </td>
                    <td className="p-2 text-right">
                      {price != null ? (
                        <span className={price > 0 ? 'text-amber-400' : 'text-slate-600'}>
                          {price > 0 ? `${price.toLocaleString()} aUEC` : 'N/A'}
                        </span>
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

      {/* Element detail panel */}
      {selectedElement && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <ElementDetail element={selectedElement} />
        </motion.div>
      )}
    </div>
  );
}

function ElementDetail({ element }: { element: MiningElement }) {
  const price = lookupPrice(element);
  const optWin = element.optimalWindowMidpoint ?? element.optimal_window_midpoint;
  const winThin = element.optimalWindowThinness ?? element.optimal_window_thinness;
  const windowHalf = winThin != null ? (1 - winThin) / 2 * 0.15 + 0.075 : 0.075;
  const windowStart = optWin != null ? Math.max(0, optWin - windowHalf) : null;
  const windowEnd = optWin != null ? Math.min(1, optWin + windowHalf) : null;

  return (
    <ScifiPanel
      title={element.name ?? 'Unknown element'}
      subtitle="Element properties & power window"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
        <PropCard label="Instability" value={element.instability != null ? fNum(element.instability) : '—'} color={dangerColor(element.instability)} />
        <PropCard label="Resistance" value={element.resistance != null ? fNum(element.resistance) : '—'} color={dangerColor(element.resistance)} />
        <PropCard label="Optimal Window" value={optWin != null ? `${(optWin * 100).toFixed(0)}%` : '—'} color="text-blue-400" />
        <PropCard label="Window Thinness" value={winThin != null ? fNum(winThin) : '—'} color="text-slate-400" />
        <PropCard label="Explosion ×" value={element.explosionMultiplier != null ? fNum(element.explosionMultiplier) : '—'} color="text-red-400" />
        <PropCard label="Cluster Factor" value={element.clusterFactor != null ? fNum(element.clusterFactor) : '—'} color="text-purple-400" />
        <PropCard label="Found in Rocks" value={String(element.rocksContaining ?? element.rocks_containing ?? '—')} color="text-cyan-400" />
        <PropCard label="Est. Price/SCU" value={price != null && price > 0 ? `${price.toLocaleString()} aUEC` : 'N/A'} color="text-amber-400" />
      </div>

      {windowStart != null && windowEnd != null && optWin != null && (
        <div>
          <div className="text-[10px] text-slate-600 font-mono-sc mb-1">
            Laser power window ({(windowStart * 100).toFixed(0)}% – {(windowEnd * 100).toFixed(0)}%)
          </div>
          <div className="h-6 bg-slate-800 rounded-sm border border-slate-700/50 overflow-hidden relative">
            <div
              className="absolute h-full bg-green-900/40 border-r border-green-600/50"
              style={{ left: `${windowStart * 100}%`, right: `${(1 - windowEnd) * 100}%` }}
            />
            <div
              className="absolute h-full w-0.5 bg-cyan-400 top-0"
              style={{ left: `${optWin * 100}%` }}
            />
            <div className="absolute inset-0 flex justify-between px-1 items-center pointer-events-none text-[8px] text-slate-600 font-mono-sc">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      )}
    </ScifiPanel>
  );
}

function PropCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="border border-slate-800/60 rounded-sm px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-600 font-mono-sc">{label}</div>
      <div className={`text-sm font-orbitron font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

function SortTh({
  label,
  sortKey,
  current,
  dir,
  onSort,
  left,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  left?: boolean;
}) {
  const active = current === sortKey;
  const Icon = active ? (dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className={`p-2 cursor-pointer select-none hover:text-slate-300 transition-colors ${left ? 'text-left' : 'text-center'} ${active ? 'text-cyan-500' : ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon size={10} />
      </span>
    </th>
  );
}
