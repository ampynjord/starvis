/**
 * MiningPage — Regolith-Style Mining Solver
 *
 * Workflow: Scan → Composition → Risk → Yield
 *
 * SCAN PHASE:     Select a rock composition (deposit or element-based search)
 * COMPOSITION:    View mineral breakdown with probabilities
 * RISK:           Analyze instability, resistance, explosion factors
 * YIELD:          Optimize laser power for maximum yield per element
 */
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pickaxe,
  ChevronDown,
  AlertTriangle,
  TrendingUp,
  Beaker,
  Search,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { MiningComposition } from '@/types/api';
import {
  getCompositionDisplayName,
  mapCompositionToView,
  type MiningCompositionView,
} from '@/types/mining';

// ── WORKFLOW TYPES ─────────────────────────────────────────────────────────────

type WorkflowPhase = 'scan' | 'composition' | 'risk' | 'yield';

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

// ── PHASE 1: CompositionSelector ────────────────────────────────────────────────

interface CompositionSelectorProps {
  compositions: MiningComposition[] | undefined;
  selected: string;
  onChange: (compositionId: string, data: MiningCompositionView) => void;
}

function CompositionSelector({ compositions, selected, onChange }: CompositionSelectorProps) {
  const { env } = useEnv();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const current = compositions?.find((c) => c.uuid === selected);

  const filtered = useMemo(() => {
    if (!compositions) return [];
    const q = search.trim().toLowerCase();
    if (!q) return compositions;
    return compositions.filter((c) => {
      const displayName = getCompositionDisplayName(c).toLowerCase();
      return displayName.includes(q) || (c.class_name || '').toLowerCase().includes(q);
    });
  }, [compositions, search]);

  const handleSelect = useCallback(async (comp: MiningComposition) => {
    const optimisticData: MiningCompositionView = {
      id: comp.uuid,
      name: getCompositionDisplayName(comp),
      className: comp.class_name || '',
      minDistinctElements: comp.min_distinct_elements ?? undefined,
      elements: [],
    };

    // Immediate feedback so click always feels responsive.
    onChange(comp.uuid, optimisticData);
    setOpen(false);
    setSearch('');
    setLoadingDetail(comp.uuid);

    try {
      const detail = await api.mining.composition(comp.uuid, env);
      const data = mapCompositionToView(detail);
      onChange(comp.uuid, data);
    } catch {
      // Keep optimistic selection if detail loading fails.
      onChange(comp.uuid, optimisticData);
    } finally {
      setLoadingDetail(null);
    }
  }, [env, onChange]);

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); setSearch(''); }}
        disabled={loadingDetail != null}
        className="sci-input w-full flex items-center justify-between gap-2 pr-3 text-left"
      >
        <span className={`font-rajdhani font-semibold text-sm ${current ? 'text-slate-100' : 'text-slate-500'}`}>
          {loadingDetail != null
            ? 'Loading composition…'
            : current
              ? getCompositionDisplayName(current)
              : 'Select a rock composition…'}
        </span>
        <ChevronDown size={14} className={`text-slate-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
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
                  placeholder="Search deposit…"
                  className="sci-input w-full pl-7 text-xs py-1.5"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-600 text-center">No results</p>
              ) : filtered.map((comp) => (
                <button
                  key={comp.uuid}
                  onClick={() => handleSelect(comp)}
                  disabled={loadingDetail === comp.uuid}
                  className={`w-full px-3 py-2 text-left hover:bg-white/5 transition-colors flex items-center gap-2 ${
                    comp.uuid === selected ? 'text-cyan-400' : 'text-slate-300'
                  } ${loadingDetail === comp.uuid ? 'opacity-50' : ''}`}
                >
                  <span className="font-rajdhani font-semibold text-sm flex-1">
                    {getCompositionDisplayName(comp)}
                  </span>
                  {comp.element_count != null && (
                    <GlowBadge color="slate" size="xs">{comp.element_count} minerals</GlowBadge>
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

// ── PHASE 2: CompositionBreakdown ───────────────────────────────────────────────

interface CompositionBreakdownProps {
  data: MiningCompositionView | null;
  selectedElementUuid: string | null;
  onSelectElement: (elementUuid: string) => void;
}

function CompositionBreakdown({ data, selectedElementUuid, onSelectElement }: CompositionBreakdownProps) {
  if (!data) {
    return (
      <div className="text-center py-8 text-slate-600">
        <Beaker size={32} className="mx-auto mb-3 opacity-20" />
        <p className="text-xs font-mono-sc uppercase tracking-widest">Select a composition to view its breakdown</p>
      </div>
    );
  }

  const sorted = [...data.elements].sort((a, b) => b.probability - a.probability);

  return (
    <div className="space-y-3">
      {sorted.map((el) => (
        <motion.button
          key={el.elementUuid}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => onSelectElement(el.elementUuid)}
          className={`sci-panel px-4 py-3 w-full text-left transition-colors ${
            selectedElementUuid === el.elementUuid
              ? 'border-cyan-500/70 bg-cyan-500/5'
              : 'hover:border-slate-500/60 hover:bg-white/5'
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="font-rajdhani font-semibold text-sm text-slate-100">{el.elementName}</div>
              <div className="text-[10px] text-slate-600 font-mono-sc">Probability of finding</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-orbitron text-sm font-bold text-green-400">{pct(el.probability)}</div>
              <div className="text-[10px] text-slate-600 font-mono-sc">
                {pct(el.minPercentage)} – {pct(el.maxPercentage)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${probColor(el.probability)}`}
                style={{ width: `${Math.round(el.probability * 100)}%` }}
              />
            </div>
          </div>
          {el.instability != null || el.resistance != null ? (
            <div className="flex gap-4 mt-2 text-xs font-mono-sc">
              {el.instability != null && (
                <span>
                  <span className="text-slate-600">Inst: </span>
                  <span className={dangerColor(el.instability)}>{fNum(el.instability)}</span>
                </span>
              )}
              {el.resistance != null && (
                <span>
                  <span className="text-slate-600">Res: </span>
                  <span className={dangerColor(el.resistance)}>{fNum(el.resistance)}</span>
                </span>
              )}
            </div>
          ) : null}
        </motion.button>
      ))}
    </div>
  );
}

// ── PHASE 3: RiskAssessment ─────────────────────────────────────────────────────

interface RiskAssessmentProps {
  data: MiningCompositionView | null;
  selectedElementUuid: string | null;
}

function RiskAssessment({ data, selectedElementUuid }: RiskAssessmentProps) {
  if (!data || !data.elements.length) {
    return (
      <div className="text-center py-8 text-slate-600">
        <AlertTriangle size={32} className="mx-auto mb-3 opacity-20" />
        <p className="text-xs font-mono-sc uppercase tracking-widest">No risk data available</p>
      </div>
    );
  }

  // Calculate aggregate risk metrics
  const aggregates = useMemo(() => {
    const allElements = data.elements.filter((el) => el.instability != null || el.resistance != null);
    if (!allElements.length) return null;

    const instabilities = allElements.map((el) => Number(el.instability ?? 0)).filter(Number.isFinite);
    const resistances = allElements.map((el) => Number(el.resistance ?? 0)).filter(Number.isFinite);

    return {
      maxInstability: Math.max(...instabilities, 0),
      avgInstability: instabilities.length ? instabilities.reduce((a, b) => a + b, 0) / instabilities.length : 0,
      maxResistance: Math.max(...resistances, 0),
      avgResistance: resistances.length ? resistances.reduce((a, b) => a + b, 0) / resistances.length : 0,
      hasHighRisk: Math.max(...instabilities, 0) > 0.6 || Math.max(...resistances, 0) > 0.6,
    };
  }, [data]);

  if (!aggregates) {
    return (
      <div className="text-center py-8 text-slate-600">
        <p className="text-xs font-mono-sc">No mineral risk properties available</p>
      </div>
    );
  }

  const selectedElement = selectedElementUuid
    ? data.elements.find((el) => el.elementUuid === selectedElementUuid) ?? null
    : null;

  return (
    <div className="space-y-3">
      {selectedElement && (
        <ScifiPanel title="Focused Material">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-rajdhani font-semibold text-cyan-300">{selectedElement.elementName}</span>
            <span className="text-xs text-slate-500">{pct(selectedElement.probability)} likelihood</span>
          </div>
        </ScifiPanel>
      )}

      {/* Overall Risk Gauge */}
      <ScifiPanel title="Overall Risk Profile">
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-border/50 rounded p-3">
            <div className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">Max Instability</div>
            <div className={`font-orbitron text-lg font-bold ${dangerColor(aggregates.maxInstability)}`}>
              {fNum(aggregates.maxInstability)}
            </div>
            <div className="mt-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${dangerBg(aggregates.maxInstability)}`}
                style={{ width: `${Math.min(aggregates.maxInstability * 100, 100)}%` }}
              />
            </div>
          </div>
          <div className="border border-border/50 rounded p-3">
            <div className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">Max Resistance</div>
            <div className={`font-orbitron text-lg font-bold ${dangerColor(aggregates.maxResistance)}`}>
              {fNum(aggregates.maxResistance)}
            </div>
            <div className="mt-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${dangerBg(aggregates.maxResistance)}`}
                style={{ width: `${Math.min(aggregates.maxResistance * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </ScifiPanel>

      {/* Risk Warning */}
      {aggregates.hasHighRisk && (
        <div className="sci-panel border-red-600/50 p-3 flex gap-3">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-300">
            <div className="font-semibold mb-1">⚠ High Risk Zone</div>
            <div className="text-[11px] text-red-200/80">
              This composition contains unstable or resistant minerals. Proceed with caution and use optimal laser power windows.
            </div>
          </div>
        </div>
      )}

      {/* High-Risk Elements */}
      <div className="space-y-1.5">
        {data.elements
          .filter((el) => (el.instability ?? 0) > 0.5 || (el.resistance ?? 0) > 0.5)
          .map((el) => (
            <div
              key={el.elementUuid}
              className={`sci-panel px-3 py-2 border-amber-600/30 ${
                selectedElementUuid === el.elementUuid ? 'border-cyan-500/70 bg-cyan-500/5' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-rajdhani font-semibold text-amber-300">{el.elementName}</span>
                <span className="text-[10px] text-slate-600">{pct(el.probability)} likelihood</span>
              </div>
              <div className="flex gap-3 text-xs font-mono-sc">
                {el.instability != null && (
                  <span>
                    <span className="text-slate-600">Inst </span>
                    <span className={dangerColor(el.instability)}>{fNum(el.instability)}</span>
                  </span>
                )}
                {el.resistance != null && (
                  <span>
                    <span className="text-slate-600">Res </span>
                    <span className={dangerColor(el.resistance)}>{fNum(el.resistance)}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── PHASE 4: YieldCalculator ────────────────────────────────────────────────────

interface YieldCalculatorProps {
  data: MiningCompositionView | null;
  selectedElementUuid: string | null;
}

function YieldCalculator({ data, selectedElementUuid }: YieldCalculatorProps) {
  if (!data || !data.elements.length) {
    return (
      <div className="text-center py-8 text-slate-600">
        <TrendingUp size={32} className="mx-auto mb-3 opacity-20" />
        <p className="text-xs font-mono-sc uppercase tracking-widest">No yield data available</p>
      </div>
    );
  }

  // Calculate optimal yield per element
  const yieldResults = useMemo(() => {
    return data.elements.map((el) => {
      const optimalWindow = el.optimalWindow ?? 0.5;
      const windowWidth = 0.15; // Typical narrow window
      const baseYield = el.probability * (el.maxPercentage + el.minPercentage) / 2;
      const riskPenalty = Math.max(0, 1 - ((el.instability ?? 0) + (el.resistance ?? 0)) / 2);
      const optimizedYield = baseYield * riskPenalty * 1.2; // 20% bonus for optimal window

      return {
        elementName: el.elementName,
        probability: el.probability,
        baseYield: baseYield * 100,
        optimizedYield: optimizedYield * 100,
        optimalWindow,
        windowWidth,
        windowStart: Math.max(0, optimalWindow - windowWidth / 2),
        windowEnd: Math.min(1, optimalWindow + windowWidth / 2),
      };
    });
  }, [data]);

  const totalYield = yieldResults.reduce((sum, r) => sum + r.optimizedYield, 0);

  return (
    <div className="space-y-3">
      {/* Total Yield Summary */}
      <ScifiPanel title="Expected Total Yield">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center px-3 py-2 border border-cyan-600/50 rounded">
            <div className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">Per Extraction</div>
            <div className="font-orbitron text-xl font-bold text-cyan-400">{fNum(totalYield, 1)}%</div>
            <div className="text-[10px] text-slate-600 mt-1">Average optimized</div>
          </div>
          <div className="text-center px-3 py-2 border border-slate-600/50 rounded">
            <div className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">Elements</div>
            <div className="font-orbitron text-xl font-bold text-slate-300">{data.elements.length}</div>
            <div className="text-[10px] text-slate-600 mt-1">In composition</div>
          </div>
        </div>
      </ScifiPanel>

      {/* Per-Element Optimization */}
      <div className="space-y-2">
        {yieldResults
          .sort((a, b) => {
            if (!selectedElementUuid) return 0;
            const aSelected = data.elements.find((el) => el.elementName === a.elementName)?.elementUuid === selectedElementUuid;
            const bSelected = data.elements.find((el) => el.elementName === b.elementName)?.elementUuid === selectedElementUuid;
            if (aSelected === bSelected) return 0;
            return aSelected ? -1 : 1;
          })
          .map((result) => {
            const isSelected =
              selectedElementUuid != null &&
              data.elements.find((el) => el.elementName === result.elementName)?.elementUuid === selectedElementUuid;

            return (
          <motion.div
            key={result.elementName}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className={`sci-panel px-4 py-3 ${isSelected ? 'border-cyan-500/70 bg-cyan-500/5' : ''}`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="font-rajdhani font-semibold text-sm text-slate-100">{result.elementName}</div>
                <div className="text-[10px] text-slate-600 font-mono-sc">
                  Optimal laser power: {(result.windowStart * 100).toFixed(0)}% – {(result.windowEnd * 100).toFixed(0)}%
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-orbitron text-sm font-bold text-green-400">{fNum(result.optimizedYield, 1)}%</div>
                <div className="text-[10px] text-slate-600">
                  <span className="line-through">{fNum(result.baseYield, 1)}%</span> → optimized
                </div>
              </div>
            </div>

            {/* Optimal Window Visualization */}
            <div className="space-y-1.5">
              <div className="text-[10px] text-slate-600 font-mono-sc">Laser power window (0–100%)</div>
              <div className="h-6 bg-slate-800 rounded border border-slate-700/50 overflow-hidden relative">
                {/* Safe zone background */}
                <div
                  className="absolute h-full bg-green-900/30 border-r border-green-600/50"
                  style={{
                    left: `${result.windowStart * 100}%`,
                    right: `${(1 - result.windowEnd) * 100}%`,
                  }}
                />
                {/* Optimal point marker */}
                <div
                  className="absolute h-full w-0.5 bg-cyan-400 top-0"
                  style={{ left: `${result.optimalWindow * 100}%` }}
                />
                {/* Tick marks */}
                <div className="absolute inset-0 flex justify-between px-1 items-center pointer-events-none text-[8px] text-slate-600 font-mono-sc">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </motion.div>
            );
          })}
      </div>
    </div>
  );
}

// ── WORKFLOW PROGRESS INDICATOR ────────────────────────────────────────────────

type PhaseConfig = {
  phase: WorkflowPhase;
  icon: LucideIcon;
  label: string;
  description: string;
};

const WORKFLOW_PHASES: PhaseConfig[] = [
  { phase: 'scan', icon: Target, label: 'Scan', description: 'Select a rock' },
  { phase: 'composition', icon: Beaker, label: 'Composition', description: 'View minerals' },
  { phase: 'risk', icon: AlertTriangle, label: 'Risk', description: 'Assess danger' },
  { phase: 'yield', icon: TrendingUp, label: 'Yield', description: 'Optimize output' },
];

interface WorkflowProgressProps {
  currentPhase: WorkflowPhase;
  hasData: boolean;
  onPhaseChange: (phase: WorkflowPhase) => void;
}

function WorkflowProgress({ currentPhase, hasData, onPhaseChange }: WorkflowProgressProps) {
  const currentIndex = WORKFLOW_PHASES.findIndex((p) => p.phase === currentPhase);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-1">
        {WORKFLOW_PHASES.map((config, i) => {
          const Icon = config.icon;
          const isActive = i <= currentIndex;
          const isCurrent = config.phase === currentPhase;
          const isClickable = config.phase === 'scan' || hasData;

          return (
            <motion.div key={config.phase} className="flex items-center flex-1">
              <motion.button
                whileHover={isClickable ? { scale: 1.03 } : {}}
                onClick={() => isClickable && onPhaseChange(config.phase)}
                className={`flex flex-col items-center gap-1 p-2 rounded border transition-all flex-1 ${
                  isCurrent
                    ? 'border-cyan-400 bg-cyan-400/10'
                    : isActive
                      ? 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                      : isClickable
                        ? 'border-slate-700 bg-transparent hover:border-slate-600'
                        : 'border-slate-800 bg-transparent opacity-40 cursor-not-allowed'
                }`}
              >
                <Icon
                  size={16}
                  className={`${
                    isCurrent ? 'text-cyan-400' : isActive ? 'text-slate-400' : isClickable ? 'text-slate-600' : 'text-slate-700'
                  }`}
                />
                <div className="text-[10px] font-mono-sc uppercase tracking-wider text-center leading-tight">
                  <div className={isCurrent ? 'text-cyan-400' : isActive ? 'text-slate-300' : 'text-slate-600'}>
                    {config.label}
                  </div>
                  <div className={isCurrent ? 'text-cyan-300' : isActive ? 'text-slate-500' : 'text-slate-700'}>
                    {config.description}
                  </div>
                </div>
              </motion.button>
              {i < WORKFLOW_PHASES.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 ${isActive ? 'bg-slate-600' : 'bg-slate-800'}`} />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── MAIN WORKFLOW PAGE ─────────────────────────────────────────────────────────

export default function MiningPage() {
  const { env } = useEnv();
  const [currentPhase, setCurrentPhase] = useState<WorkflowPhase>('scan');
  const [selectedCompositionId, setSelectedCompositionId] = useState('');
  const [compositionData, setCompositionData] = useState<MiningCompositionView | null>(null);
  const [selectedElementUuid, setSelectedElementUuid] = useState<string | null>(null);

  // Load all compositions for the scan phase
  const { data: compositions, isLoading: loadingCompositions, error: compositionsError } = useQuery({
    queryKey: ['mining.compositions', env],
    queryFn: () => api.mining.compositions(false, env),
    staleTime: 30 * 60_000,
  });

  const handleCompositionSelect = useCallback(
    (compositionId: string, data: MiningCompositionView) => {
      setSelectedCompositionId(compositionId);
      setCompositionData(data);
      setSelectedElementUuid(null);
      setCurrentPhase('composition');
    },
    [],
  );

  const handleElementSelect = useCallback((elementUuid: string) => {
    setSelectedElementUuid(elementUuid);
  }, []);

  const handlePhaseChange = useCallback((phase: WorkflowPhase) => {
    setCurrentPhase(phase);
  }, []);

  return (
    <div className="max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Pickaxe size={20} className="text-cyan-400" />
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
            Mining Solver
          </h1>
        </div>
        <p className="text-sm text-slate-500 mt-1 font-mono-sc">
          Regolith-style workflow: scan deposits, analyze composition, assess risk, optimize yield.
        </p>
      </div>

      {/* Workflow Progress */}
      <WorkflowProgress
        currentPhase={currentPhase}
        hasData={compositionData != null}
        onPhaseChange={handlePhaseChange}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Left: Scan Phase (always visible) */}
        <div className="xl:col-span-1">
          <ScifiPanel title="1. Scan Deposit" subtitle="Select a rock type to analyze">
            {loadingCompositions ? (
              <LoadingGrid message="Loading deposits…" />
            ) : compositionsError ? (
              <ErrorState error={compositionsError as Error} />
            ) : !compositions?.length ? (
              <EmptyState icon="🪨" title="No data" message="Run extraction to populate mining deposits." />
            ) : (
              <CompositionSelector
                compositions={compositions}
                selected={selectedCompositionId}
                onChange={handleCompositionSelect}
              />
            )}
          </ScifiPanel>

          {/* Quick Composition Info */}
          {compositionData && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
              <ScifiPanel title="Composition Summary">
                <div className="space-y-2 text-xs font-mono-sc">
                  <div>
                    <span className="text-slate-600">Deposit:</span>{' '}
                    <span className="text-slate-300">{compositionData.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-600">Minerals:</span>{' '}
                    <span className="text-cyan-400 font-semibold">{compositionData.elements.length}</span>
                  </div>
                  {compositionData.minDistinctElements && (
                    <div>
                      <span className="text-slate-600">Min Distinct:</span>{' '}
                      <span className="text-amber-400">{compositionData.minDistinctElements}</span>
                    </div>
                  )}
                </div>
              </ScifiPanel>
            </motion.div>
          )}
        </div>

        {/* Right: Phase Content (Composition, Risk, Yield) */}
        <div className="xl:col-span-2 space-y-6">
          {/* PHASE 2: Composition Breakdown */}
          <motion.div
            id="phase-composition"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ScifiPanel
              title="2. Composition Breakdown"
              subtitle="Mineral distribution and properties"
              className={currentPhase === 'composition' ? 'ring-1 ring-cyan-600/30' : ''}
            >
              <CompositionBreakdown
                data={compositionData}
                selectedElementUuid={selectedElementUuid}
                onSelectElement={handleElementSelect}
              />
            </ScifiPanel>
          </motion.div>

          {/* PHASE 3: Risk Assessment */}
          <motion.div
            id="phase-risk"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <ScifiPanel
              title="3. Risk Assessment"
              subtitle="Instability, resistance, and hazard zones"
              className={currentPhase === 'risk' ? 'ring-1 ring-cyan-600/30' : ''}
            >
              <RiskAssessment data={compositionData} selectedElementUuid={selectedElementUuid} />
            </ScifiPanel>
          </motion.div>

          {/* PHASE 4: Yield Calculator */}
          <motion.div
            id="phase-yield"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <ScifiPanel
              title="4. Yield Optimization"
              subtitle="Optimal laser power windows and expected output"
            >
              <YieldCalculator data={compositionData} selectedElementUuid={selectedElementUuid} />
            </ScifiPanel>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
