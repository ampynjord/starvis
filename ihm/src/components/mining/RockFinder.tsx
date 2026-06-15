import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Crosshair, SlidersHorizontal } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import type { MiningElement } from '@/types/api';
import { API_BASE } from '@/utils/constants';
import { dangerColor, fNum, pct } from '@/views/mining-helpers';
import { ORE_PRICES } from '@/data/mining-static';

interface RockResult {
  compositionUuid: string;
  depositName: string;
  probability: number;
  minPercentage: number;
  maxPercentage: number;
  instability: number | null;
  resistance: number | null;
  optimalWindow: number | null;
}

function lookupPrice(name: string): number | null {
  const lower = name.toLowerCase();
  const match = ORE_PRICES.find((p) => lower.includes(p.classFragment));
  return match?.pricePerScu ?? null;
}

export function RockFinder() {
  const { env } = useEnv();
  const [selectedElementUuid, setSelectedElementUuid] = useState<string>('');
  const [minProbability, setMinProbability] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const { data: elements, isLoading: loadingElements, error: elementsError } = useQuery({
    queryKey: ['mining.elements', env],
    queryFn: () => api.mining.elements(env),
    staleTime: 30 * 60_000,
  });

  const selectedElement = useMemo<MiningElement | null>(
    () => elements?.find((e) => e.uuid === selectedElementUuid) ?? null,
    [elements, selectedElementUuid],
  );

  const { data: solverData, isLoading: loadingRocks, error: rocksError } = useQuery({
    queryKey: ['mining.solver', selectedElementUuid, minProbability, env],
    queryFn: async () => {
      if (!selectedElementUuid) return [];
      const url = `${API_BASE}/mining/solver?element=${selectedElementUuid}&min_probability=${minProbability}${env ? `&env=${env}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      return (json.data ?? []) as RockResult[];
    },
    enabled: !!selectedElementUuid,
    staleTime: 5 * 60_000,
  });

  const sorted = useMemo(() => {
    if (!solverData) return [];
    return [...solverData].sort((a, b) => b.probability - a.probability);
  }, [solverData]);

  const price = selectedElement ? lookupPrice(selectedElement.name ?? selectedElement.class_name ?? '') : null;

  if (loadingElements) return <LoadingGrid message="Loading minerals..." />;
  if (elementsError) return <ErrorState error={elementsError as Error} />;

  return (
    <div className="space-y-4">
      {/* Target mineral selector */}
      <ScifiPanel title="Target Mineral" subtitle="Select a mineral to find which rocks contain it">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">Mineral</label>
            <select
              value={selectedElementUuid}
              onChange={(e) => setSelectedElementUuid(e.target.value)}
              className="sci-select w-full text-xs"
            >
              <option value="">— Select a mineral —</option>
              {(elements ?? []).map((el) => (
                <option key={el.uuid} value={el.uuid}>
                  {el.name ?? 'Unknown deposit'}
                </option>
              ))}
            </select>
          </div>

          {selectedElement && (
            <div className="flex flex-wrap gap-3 items-center text-xs font-mono-sc self-end">
              {selectedElement.instability != null && (
                <span>
                  <span className="text-slate-600">Instab: </span>
                  <span className={dangerColor(selectedElement.instability)}>{fNum(selectedElement.instability)}</span>
                </span>
              )}
              {selectedElement.resistance != null && (
                <span>
                  <span className="text-slate-600">Resist: </span>
                  <span className={dangerColor(selectedElement.resistance)}>{fNum(selectedElement.resistance)}</span>
                </span>
              )}
              {selectedElement.optimalWindowMidpoint != null && (
                <span>
                  <span className="text-slate-600">Opt Win: </span>
                  <span className="text-blue-400">{(selectedElement.optimalWindowMidpoint * 100).toFixed(0)}%</span>
                </span>
              )}
              {price != null && price > 0 && (
                <span>
                  <span className="text-slate-600">~Price: </span>
                  <span className="text-amber-400">{price.toLocaleString()} aUEC/SCU</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Filters toggle */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
          >
            <SlidersHorizontal size={11} />
            Filters
          </button>

          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2">
              <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">
                Min Probability ({(minProbability * 100).toFixed(0)}%)
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={minProbability}
                onChange={(e) => setMinProbability(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <div className="flex justify-between text-[9px] text-slate-700 font-mono-sc mt-0.5">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </motion.div>
          )}
        </div>
      </ScifiPanel>

      {/* Results */}
      {selectedElementUuid && (
        <ScifiPanel
          title="Rock Compositions"
          subtitle={
            loadingRocks
              ? 'Searching...'
              : `${sorted.length} rock${sorted.length !== 1 ? 's' : ''} found — sorted by probability`
          }
        >
          {loadingRocks ? (
            <LoadingGrid message="Searching deposits..." />
          ) : rocksError ? (
            <ErrorState error={rocksError as Error} />
          ) : sorted.length === 0 ? (
            <div className="text-center py-8 text-slate-600">
              <Crosshair size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-xs font-mono-sc uppercase tracking-widest">No rocks found</p>
              {minProbability > 0 && (
                <p className="text-[10px] text-slate-700 mt-1">
                  Try lowering the minimum probability filter.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((rock, i) => (
                <motion.div
                  key={rock.compositionUuid}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="sci-panel px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="font-rajdhani font-semibold text-sm text-slate-100">
                        {rock.depositName || rock.compositionUuid.slice(0, 12)}
                      </div>
                      <div className="text-[10px] text-slate-600 font-mono-sc mt-0.5">
                        Range: {pct(rock.minPercentage / 100)} – {pct(rock.maxPercentage / 100)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-orbitron text-sm font-bold text-green-400">
                        {pct(rock.probability)}
                      </div>
                      <div className="text-[9px] text-slate-600">probability</div>
                    </div>
                  </div>

                  {/* Probability bar */}
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{ width: `${Math.round(rock.probability * 100)}%` }}
                    />
                  </div>

                  {/* Risk stats */}
                  <div className="flex flex-wrap gap-3 text-[10px] font-mono-sc">
                    {rock.instability != null && (
                      <span>
                        <span className="text-slate-600">Instab: </span>
                        <span className={dangerColor(rock.instability)}>{fNum(rock.instability)}</span>
                      </span>
                    )}
                    {rock.resistance != null && (
                      <span>
                        <span className="text-slate-600">Resist: </span>
                        <span className={dangerColor(rock.resistance)}>{fNum(rock.resistance)}</span>
                      </span>
                    )}
                    {rock.optimalWindow != null && (
                      <span>
                        <span className="text-slate-600">Opt Win: </span>
                        <span className="text-blue-400">{(rock.optimalWindow * 100).toFixed(0)}%</span>
                      </span>
                    )}
                    {/* Risk badge */}
                    {rock.instability != null && rock.instability > 0.6 && (
                      <span className="text-red-400 font-semibold">⚠ HIGH RISK</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </ScifiPanel>
      )}

      {!selectedElementUuid && (
        <div className="text-center py-12 text-slate-600">
          <Crosshair size={40} className="mx-auto mb-3 opacity-15" />
          <p className="text-xs font-mono-sc uppercase tracking-widest">Select a mineral above</p>
          <p className="text-[10px] text-slate-700 mt-1">to find which rock deposits contain it</p>
        </div>
      )}
    </div>
  );
}
