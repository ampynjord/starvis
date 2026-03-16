/**
 * MiningPage — Mining Solver
 *
 * Allows players to find which rock compositions contain a given mineral,
 * and visualize mining properties (instability, resistance, optimal window).
 */
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Pickaxe, ChevronDown, Info } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/services/api';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { MiningElement, MiningSolverResult } from '@/types/api';

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

/** Color from 0 (green/safe) to 1 (red/dangerous) */
function dangerColor(v: number | string | null): string {
  if (v == null) return 'text-slate-500';
  const n = Number(v);
  if (n < 0.3) return 'text-green-400';
  if (n < 0.6) return 'text-amber-400';
  return 'text-red-400';
}

function probColor(v: number | string): string {
  const n = Number(v);
  if (n >= 0.7) return 'bg-green-500';
  if (n >= 0.4) return 'bg-amber-500';
  return 'bg-slate-600';
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
  const current = elements.find((e) => e.uuid === selected);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
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
            className="absolute z-50 top-full mt-1 left-0 right-0 bg-panel border border-border rounded shadow-xl max-h-72 overflow-y-auto"
          >
            {elements.map((el) => (
              <button
                key={el.uuid}
                onClick={() => { onChange(el.uuid); setOpen(false); }}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ElementStats({ element }: { element: MiningElement }) {
  const stats = [
    { label: 'Instability',       value: fNum(element.instability),                  color: dangerColor(element.instability) },
    { label: 'Resistance',        value: fNum(element.resistance),                   color: dangerColor(element.resistance) },
    { label: 'Opt. Window (mid)', value: fNum(element.optimal_window_midpoint),       color: 'text-cyan-400' },
    { label: 'Opt. Window (thin)',value: fNum(element.optimal_window_thinness),       color: 'text-cyan-400' },
    { label: 'Explosion ×',       value: fNum(element.explosion_multiplier),         color: dangerColor(element.explosion_multiplier != null ? Math.min(Number(element.explosion_multiplier) / 3, 1) : null) },
    { label: 'Cluster factor',    value: fNum(element.cluster_factor),               color: 'text-slate-300' },
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

function SolverResultRow({ result, rank }: { result: MiningSolverResult; rank: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(rank * 0.04, 0.5) }}
      className="sci-panel px-4 py-3 hover:border-cyan-800 transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* Rank */}
        <div className="w-6 text-xs font-mono-sc text-slate-600 pt-0.5 flex-shrink-0">#{rank + 1}</div>

        {/* Deposit info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-orbitron text-sm text-slate-100">{result.deposit_name || result.class_name}</span>
            {result.min_distinct_elements != null && (
              <GlowBadge color="slate" size="xs">min {result.min_distinct_elements} minerals</GlowBadge>
            )}
          </div>

          {/* Probability bar */}
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

          {/* Percentage range */}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MiningPage() {
  const [selectedElement, setSelectedElement] = useState<string>('');
  const [minProbability, setMinProbability] = useState<number>(0);

  const {
    data: elements,
    isLoading: loadingElements,
    error: elementsError,
    refetch: refetchElements,
  } = useQuery({
    queryKey: ['mining.elements'],
    queryFn: api.mining.elements,
    staleTime: 30 * 60_000,
  });

  const {
    data: results,
    isLoading: loadingResults,
    error: resultsError,
  } = useQuery({
    queryKey: ['mining.solver', selectedElement, minProbability],
    queryFn: () => api.mining.solveForElement(selectedElement, minProbability || undefined),
    enabled: !!selectedElement,
    staleTime: 30 * 60_000,
  });

  const currentElement = elements?.find((e) => e.uuid === selectedElement);

  return (
    <div className="max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Pickaxe size={20} className="text-cyan-400" />
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
            Mining Solver
          </h1>
        </div>
        <p className="text-sm text-slate-500 mt-1 font-mono-sc">
          Find rock compositions rich in a specific mineral element.
        </p>
      </div>

      {/* Controls */}
      <ScifiPanel className="mb-5" title="Select Mineral">
        {loadingElements ? (
          <LoadingGrid message="LOADING MINERALS…" />
        ) : elementsError ? (
          <ErrorState error={elementsError as Error} onRetry={() => void refetchElements()} />
        ) : !elements?.length ? (
          <EmptyState icon="⛏️" title="No mineral data available" message="Run an extraction to populate mining data." />
        ) : (
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <ElementSelector
                elements={elements}
                selected={selectedElement}
                onChange={(uuid) => setSelectedElement(uuid)}
              />
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
        )}
      </ScifiPanel>

      {/* Element stats */}
      <AnimatePresence>
        {currentElement && (
          <motion.div
            key={currentElement.uuid}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-5"
          >
            <ScifiPanel
              title={currentElement.name}
              subtitle={currentElement.class_name}
            >
              <ElementStats element={currentElement} />
              <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600 font-mono-sc">
                <Info size={12} className="mt-0.5 flex-shrink-0" />
                Lower instability and resistance are easier to mine. Optimal window shows the laser power sweet spot.
              </p>
            </ScifiPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      {selectedElement && (
        <ScifiPanel
          title="Rock Compositions"
          subtitle={results ? `${results.length} deposit type${results.length !== 1 ? 's' : ''} found` : undefined}
        >
          {loadingResults ? (
            <LoadingGrid message="SOLVING…" />
          ) : resultsError ? (
            <ErrorState error={resultsError as Error} />
          ) : !results?.length ? (
            <EmptyState
              icon="🪨"
              title="No compositions found"
              message="This mineral was not found in any known rock composition, or try lowering the minimum probability."
            />
          ) : (
            <div className="space-y-2">
              {results.map((r, i) => (
                <SolverResultRow key={`${r.uuid}-${i}`} result={r} rank={i} />
              ))}
            </div>
          )}
        </ScifiPanel>
      )}

      {!selectedElement && !loadingElements && !!elements?.length && (
        <div className="text-center py-16 text-slate-600">
          <Pickaxe size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-rajdhani text-sm uppercase tracking-widest">Select a mineral above to find rock compositions</p>
        </div>
      )}
    </div>
  );
}
