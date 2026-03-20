/**
 * MiningPage — Mining Reference & Solver
 *
 * Three tabs:
 *  1. Mineral Finder — select a mineral, view its properties, find rocks containing it
 *  2. Ore Library    — browse all minerals with sortable mining properties
 *  3. Rock Deposits  — browse all deposit types with their ore compositions
 */
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pickaxe,
  ChevronDown,
  ChevronRight,
  Info,
  Search,
  FlaskConical,
  Layers3,
  Target,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { MiningComposition, MiningElement, MiningSolverResult } from '@/types/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | string | null): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function fNum(v: number | string | null, decimals = 2): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(decimals);
}

/** Color class from 0 (safe/green) to 1 (dangerous/red) */
function dangerColor(v: number | string | null): string {
  if (v == null) return 'text-slate-500';
  const n = Number(v);
  if (n < 0.3) return 'text-green-400';
  if (n < 0.6) return 'text-amber-400';
  return 'text-red-400';
}

function dangerBg(v: number | null): string {
  if (v == null) return 'bg-slate-700';
  if (v < 0.3) return 'bg-green-500';
  if (v < 0.6) return 'bg-amber-500';
  return 'bg-red-500';
}

function probColor(v: number | string): string {
  const n = Number(v);
  if (n >= 0.7) return 'bg-green-500';
  if (n >= 0.4) return 'bg-amber-500';
  return 'bg-slate-600';
}

// ── ElementSelector ───────────────────────────────────────────────────────────

function ElementSelector({
  elements,
  selected,
  onChange,
}: {
  elements: MiningElement[];
  selected: string;
  onChange: (uuid: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const current = elements.find((e) => e.uuid === selected);

  const filtered = search.trim()
    ? elements.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : elements;

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); setSearch(''); }}
        className="sci-input w-full flex items-center justify-between gap-2 pr-3 text-left"
      >
        <span className={`font-rajdhani font-semibold text-sm ${current ? 'text-slate-100' : 'text-slate-500'}`}>
          {current?.name ?? 'Select a mineral…'}
        </span>
        <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 top-full mt-1 left-0 right-0 bg-panel border border-border rounded shadow-xl"
          >
            <div className="sticky top-0 bg-panel border-b border-border p-2">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search mineral…"
                  className="sci-input w-full pl-7 text-xs py-1.5"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-600 text-center">No results</p>
              ) : filtered.map((el) => (
                <button
                  key={el.uuid}
                  onClick={() => { onChange(el.uuid); setOpen(false); setSearch(''); }}
                  className={`w-full px-3 py-2 text-left hover:bg-white/5 transition-colors flex items-center gap-2 ${el.uuid === selected ? 'text-cyan-400' : 'text-slate-300'}`}
                >
                  <span className="font-rajdhani font-semibold text-sm flex-1">{el.name}</span>
                  {el.instability != null && (
                    <span className={`text-xs font-mono-sc ${dangerColor(el.instability)}`}>
                      inst {fNum(el.instability)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ElementStats ──────────────────────────────────────────────────────────────

function ElementStats({ element }: { element: MiningElement }) {
  const optMid = element.optimal_window_midpoint != null
    ? `${(Number(element.optimal_window_midpoint) * 100).toFixed(0)}%`
    : '—';

  const stats = [
    { label: 'Instability',       value: fNum(element.instability),      color: dangerColor(element.instability) },
    { label: 'Resistance',        value: fNum(element.resistance),        color: dangerColor(element.resistance) },
    { label: 'Opt. Window (mid)', value: optMid,                          color: 'text-cyan-400' },
    { label: 'Opt. Window (thin)',value: fNum(element.optimal_window_thinness), color: 'text-cyan-400' },
    { label: 'Explosion ×',       value: fNum(element.explosion_multiplier),
      color: dangerColor(element.explosion_multiplier != null ? Math.min(Number(element.explosion_multiplier) / 3, 1) : null) },
    { label: 'Cluster factor',    value: fNum(element.cluster_factor),   color: 'text-slate-300' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {stats.map(({ label, value, color }) => (
        <div key={label} className="sci-panel px-3 py-2">
          <div className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-0.5">{label}</div>
          <div className={`font-orbitron text-sm font-bold ${color}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ── SolverResultRow ───────────────────────────────────────────────────────────

function SolverResultRow({ result, rank }: { result: MiningSolverResult; rank: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(rank * 0.04, 0.5) }}
      className="sci-panel px-4 py-3 hover:border-cyan-800 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-6 text-xs font-mono-sc text-slate-600 pt-0.5 flex-shrink-0">#{rank + 1}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-orbitron text-sm text-slate-100">{result.deposit_name || result.class_name}</span>
            {result.min_distinct_elements != null && (
              <GlowBadge color="slate" size="xs">min {result.min_distinct_elements} minerals</GlowBadge>
            )}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${probColor(result.probability)}`}
                style={{ width: `${Math.round(Number(result.probability) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-mono-sc text-slate-400 w-10 text-right flex-shrink-0">
              {pct(result.probability)}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono-sc text-slate-500">
            <span>
              <span className="text-slate-600">Content: </span>
              {pct(result.min_percentage)} – {pct(result.max_percentage)}
            </span>
            {result.instability != null && (
              <span>
                <span className="text-slate-600">Inst: </span>
                <span className={dangerColor(result.instability)}>{fNum(result.instability)}</span>
              </span>
            )}
            {result.resistance != null && (
              <span>
                <span className="text-slate-600">Res: </span>
                <span className={dangerColor(result.resistance)}>{fNum(result.resistance)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Tab: Mineral Finder ───────────────────────────────────────────────────────

function MineralFinder({ elements }: { elements: MiningElement[] }) {
  const { env } = useEnv();
  const [selectedElement, setSelectedElement] = useState<string>('');
  const [minProbability, setMinProbability] = useState<number>(0);

  const { data: results, isLoading, error } = useQuery({
    queryKey: ['mining.solver', selectedElement, minProbability, env],
    queryFn: () => api.mining.solveForElement(selectedElement, minProbability || undefined, env),
    enabled: !!selectedElement,
    staleTime: 30 * 60_000,
  });

  const currentElement = elements.find((e) => e.uuid === selectedElement);

  return (
    <div className="space-y-4">
      <ScifiPanel title="Select Mineral">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <ElementSelector elements={elements} selected={selectedElement} onChange={setSelectedElement} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <label className="text-xs text-slate-500 font-mono-sc whitespace-nowrap">Min probability</label>
            <select
              value={minProbability}
              onChange={(e) => setMinProbability(Number(e.target.value))}
              className="sci-input text-xs w-28"
            >
              <option value={0}>Any</option>
              <option value={0.25}>≥ 25%</option>
              <option value={0.5}>≥ 50%</option>
              <option value={0.75}>≥ 75%</option>
            </select>
          </div>
        </div>
      </ScifiPanel>

      <AnimatePresence>
        {currentElement && (
          <motion.div key={currentElement.uuid} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ScifiPanel title={currentElement.name} subtitle={currentElement.class_name}>
              <ElementStats element={currentElement} />
              <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600 font-mono-sc">
                <Info size={12} className="mt-0.5 flex-shrink-0" />
                Lower instability and resistance are easier to mine. Optimal window shows the laser power sweet spot.
              </p>
            </ScifiPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedElement && (
        <ScifiPanel
          title="Rock Compositions"
          subtitle={results ? `${results.length} deposit type${results.length !== 1 ? 's' : ''} found` : undefined}
        >
          {isLoading ? (
            <LoadingGrid message="SOLVING…" />
          ) : error ? (
            <ErrorState error={error as Error} />
          ) : !results?.length ? (
            <EmptyState icon="🪨" title="No compositions found"
              message="This mineral was not found in any known rock composition, or lower the minimum probability." />
          ) : (
            <div className="space-y-2">
              {results.map((r, i) => (
                <SolverResultRow key={`${r.uuid}-${i}`} result={r} rank={i} />
              ))}
            </div>
          )}
        </ScifiPanel>
      )}

      {!selectedElement && (
        <div className="text-center py-16 text-slate-600">
          <Pickaxe size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-rajdhani text-sm uppercase tracking-widest">Select a mineral above to find rock compositions</p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Ore Library ──────────────────────────────────────────────────────────

type OreSort = 'name' | 'instability' | 'resistance' | 'explosion_multiplier' | 'optimal_window_midpoint';

function OreLibrary({ elements }: { elements: MiningElement[] }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<OreSort>('name');
  const [sortDesc, setSortDesc] = useState(false);

  const sorted = useMemo(() => {
    const base = search.trim()
      ? elements.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
      : [...elements];

    return base.sort((a, b) => {
      const va = sortKey === 'name' ? a.name : a[sortKey];
      const vb = sortKey === 'name' ? b.name : b[sortKey];

      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      const cmp = typeof va === 'string'
        ? (va as string).localeCompare(vb as string)
        : Number(va) - Number(vb);
      return sortDesc ? -cmp : cmp;
    });
  }, [elements, search, sortKey, sortDesc]);

  function toggleSort(key: OreSort) {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(false); }
  }

  function SortIcon({ k }: { k: OreSort }) {
    if (sortKey !== k) return <ArrowUpDown size={10} className="text-slate-600" />;
    return sortDesc ? <ArrowDown size={10} className="text-cyan-400" /> : <ArrowUp size={10} className="text-cyan-400" />;
  }

  function ColHeader({ k, label, cls = '' }: { k: OreSort; label: string; cls?: string }) {
    return (
      <th
        className={`px-3 py-2 text-left cursor-pointer hover:text-cyan-300 select-none whitespace-nowrap ${sortKey === k ? 'text-cyan-400' : 'text-slate-500'} ${cls}`}
        onClick={() => toggleSort(k)}
      >
        <span className="flex items-center gap-1 font-mono-sc text-[10px] uppercase tracking-wider">
          {label} <SortIcon k={k} />
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter minerals…"
          className="sci-input pl-8 w-full text-sm"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <ColHeader k="name" label="Mineral" />
              <ColHeader k="instability" label="Instability" cls="w-44" />
              <ColHeader k="resistance" label="Resistance" cls="w-44" />
              <ColHeader k="optimal_window_midpoint" label="Opt. Window" cls="w-32" />
              <ColHeader k="explosion_multiplier" label="Explosion ×" cls="w-28" />
              <th className="px-3 py-2 text-left font-mono-sc text-[10px] uppercase tracking-wider text-slate-500 whitespace-nowrap w-24">
                Cluster
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-600 font-mono-sc text-xs">
                  No minerals found
                </td>
              </tr>
            ) : sorted.map((el, i) => (
              <motion.tr
                key={el.uuid}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.015, 0.4) }}
                className="border-b border-border/40 hover:bg-white/[0.03] transition-colors"
              >
                <td className="px-3 py-2.5">
                  <span className="font-rajdhani font-semibold text-sm text-slate-100">{el.name}</span>
                  <span className="block text-[10px] text-slate-600 font-mono-sc">{el.class_name}</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden flex-shrink-0">
                      <div
                        className={`h-full rounded-full ${dangerBg(el.instability)}`}
                        style={{ width: `${Math.min((el.instability ?? 0) * 100, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono-sc ${dangerColor(el.instability)}`}>{fNum(el.instability)}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden flex-shrink-0">
                      <div
                        className={`h-full rounded-full ${dangerBg(el.resistance)}`}
                        style={{ width: `${Math.min((el.resistance ?? 0) * 100, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono-sc ${dangerColor(el.resistance)}`}>{fNum(el.resistance)}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {el.optimal_window_midpoint != null ? (
                    <div>
                      <span className="text-xs font-mono-sc text-cyan-400">
                        {(Number(el.optimal_window_midpoint) * 100).toFixed(0)}%
                      </span>
                      {el.optimal_window_thinness != null && (
                        <span className="text-[10px] text-slate-600 ml-1">
                          ({fNum(el.optimal_window_thinness, 1)} thin)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs font-mono-sc ${dangerColor(
                    el.explosion_multiplier != null ? Math.min(Number(el.explosion_multiplier) / 3, 1) : null,
                  )}`}>
                    {fNum(el.explosion_multiplier)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-xs font-mono-sc text-slate-400">{fNum(el.cluster_factor)}</span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Rock Deposits ────────────────────────────────────────────────────────

function DepositRow({ comp }: { comp: MiningComposition }) {
  const { env } = useEnv();
  const [expanded, setExpanded] = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['mining.composition', comp.uuid, env],
    queryFn: () => api.mining.composition(comp.uuid, env),
    enabled: expanded,
    staleTime: 60 * 60_000,
  });

  return (
    <div className="sci-panel overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          size={14}
          className={`text-slate-500 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        <div className="flex-1 min-w-0">
          <span className="font-orbitron text-sm text-slate-100">{comp.deposit_name || comp.class_name}</span>
          {comp.deposit_name && (
            <span className="text-[10px] text-slate-600 font-mono-sc ml-2">{comp.class_name}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {comp.element_count != null && (
            <GlowBadge color="slate" size="xs">{comp.element_count} minerals</GlowBadge>
          )}
          {comp.min_distinct_elements != null && (
            <GlowBadge color="cyan" size="xs">min {comp.min_distinct_elements}</GlowBadge>
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="px-4 py-3">
              {isLoading ? (
                <div className="py-4 text-center text-xs text-slate-600 font-mono-sc">Loading composition…</div>
              ) : !detail?.elements?.length ? (
                <div className="py-4 text-center text-xs text-slate-600 font-mono-sc">No mineral data available.</div>
              ) : (
                <div className="space-y-2">
                  {detail.elements
                    .slice()
                    .sort((a, b) => Number(b.probability) - Number(a.probability))
                    .map((part) => (
                      <div key={part.element_uuid} className="flex items-center gap-3">
                        <div className="w-32 flex-shrink-0">
                          <span className="font-rajdhani font-semibold text-sm text-slate-200">{part.element_name}</span>
                        </div>
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${probColor(part.probability)}`}
                            style={{ width: `${Math.round(Number(part.probability) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono-sc text-slate-400 w-10 text-right flex-shrink-0">
                          {pct(part.probability)}
                        </span>
                        <span className="text-xs font-mono-sc text-slate-500 w-24 text-right flex-shrink-0">
                          {pct(part.min_percentage)}–{pct(part.max_percentage)}
                        </span>
                        {part.instability != null && (
                          <span className={`text-xs font-mono-sc w-14 text-right flex-shrink-0 ${dangerColor(part.instability)}`}>
                            I:{fNum(part.instability)}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RockDeposits() {
  const { env } = useEnv();
  const [search, setSearch] = useState('');

  const { data: compositions, isLoading, error, refetch } = useQuery({
    queryKey: ['mining.compositions', env],
    queryFn: () => api.mining.compositions(false, env),
    staleTime: 30 * 60_000,
  });

  const filtered = useMemo(() => {
    if (!compositions) return [];
    const q = search.trim().toLowerCase();
    if (!q) return compositions;
    return compositions.filter(
      (c) => c.deposit_name.toLowerCase().includes(q) || c.class_name.toLowerCase().includes(q),
    );
  }, [compositions, search]);

  if (isLoading) return <LoadingGrid message="LOADING DEPOSITS…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!compositions?.length) return (
    <EmptyState icon="🪨" title="No deposit data" message="Run an extraction to populate mining data." />
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter deposits…"
          className="sci-input pl-8 w-full text-sm"
        />
      </div>
      <div className="space-y-2">
        {filtered.map((comp) => (
          <DepositRow key={comp.uuid} comp={comp} />
        ))}
      </div>
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

type Tab = 'finder' | 'library' | 'deposits';

const TABS: { key: Tab; Icon: LucideIcon; label: string }[] = [
  { key: 'finder',   Icon: Target,        label: 'Mineral Finder' },
  { key: 'library',  Icon: FlaskConical,  label: 'Ore Library'    },
  { key: 'deposits', Icon: Layers3,       label: 'Rock Deposits'  },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MiningPage() {
  const { env } = useEnv();
  const [tab, setTab] = useState<Tab>('finder');

  const {
    data: elements,
    isLoading: loadingElements,
    error: elementsError,
    refetch: refetchElements,
  } = useQuery({
    queryKey: ['mining.elements', env],
    queryFn: () => api.mining.elements(env),
    staleTime: 30 * 60_000,
  });

  return (
    <div className="max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Pickaxe size={20} className="text-cyan-400" />
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
            Mining
          </h1>
        </div>
        <p className="text-sm text-slate-500 mt-1 font-mono-sc">
          Ore properties, rock deposits, and mineral solver.
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map(({ key, Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-rajdhani font-semibold transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'text-cyan-400 border-cyan-400'
                : 'text-slate-500 border-transparent hover:text-slate-300 hover:border-slate-600'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loadingElements ? (
        <LoadingGrid message="LOADING MINING DATA…" />
      ) : elementsError ? (
        <ErrorState error={elementsError as Error} onRetry={() => void refetchElements()} />
      ) : !elements?.length ? (
        <EmptyState icon="⛏️" title="No mineral data available" message="Run an extraction to populate mining data." />
      ) : (
        <>
          {tab === 'finder'   && <MineralFinder elements={elements} />}
          {tab === 'library'  && <OreLibrary elements={elements} />}
          {tab === 'deposits' && <RockDeposits />}
        </>
      )}
    </div>
  );
}
