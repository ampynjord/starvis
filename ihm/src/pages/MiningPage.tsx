import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Pickaxe } from 'lucide-react';
import { useCallback, useState } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { MiningCompositionView } from '@/types/mining';
import { CompositionSelector } from '@/components/mining/CompositionSelector';
import { CompositionBreakdown } from '@/components/mining/CompositionBreakdown';
import { RiskAssessment } from '@/components/mining/RiskAssessment';
import { YieldCalculator } from '@/components/mining/YieldCalculator';
import { WorkflowProgress, type WorkflowPhase } from '@/components/mining/WorkflowProgress';
import { LaserSelector } from '@/components/mining/LaserSelector';

export default function MiningPage() {
  const { env } = useEnv();
  const [currentPhase, setCurrentPhase] = useState<WorkflowPhase>('scan');
  const [selectedCompositionId, setSelectedCompositionId] = useState('');
  const [compositionData, setCompositionData] = useState<MiningCompositionView | null>(null);
  const [selectedElementUuid, setSelectedElementUuid] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedLaserUuid, setSelectedLaserUuid] = useState<string | undefined>();
  const [selectedGadgetUuids, setSelectedGadgetUuids] = useState<string[]>([]);

  const { data: compositions, isLoading: loadingCompositions, error: compositionsError } = useQuery({
    queryKey: ['mining.compositions', env],
    queryFn: () => api.mining.compositions(false, env),
    staleTime: 30 * 60_000,
  });

  const { data: lasers } = useQuery({
    queryKey: ['mining.lasers', env],
    queryFn: () => api.mining.lasers(env),
    staleTime: 30 * 60_000,
  });

  const { data: yieldData } = useQuery({
    queryKey: ['mining.yield', env, compositionData?.id, selectedLaserUuid, selectedGadgetUuids],
    queryFn: () =>
      api.calculate.miningYield({
        compositionUuid: compositionData!.id,
        env,
        laserUuid: selectedLaserUuid,
        gadgetUuids: selectedGadgetUuids.length > 0 ? selectedGadgetUuids : undefined,
      }),
    enabled: !!compositionData?.id,
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
            Mining Calculator
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
              <LoadingGrid message="Loading deposits..." />
            ) : compositionsError ? (
              <ErrorState error={compositionsError as Error} />
            ) : !compositions?.length ? (
              <EmptyState icon="??" title="No data" message="Run extraction to populate mining deposits." />
            ) : (
              <CompositionSelector
                compositions={compositions}
                selected={selectedCompositionId}
                onChange={handleCompositionSelect}
                onLoadingChange={setLoadingDetail}
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

          {/* Laser & Gadget Selector */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
            <ScifiPanel title="Equipment" subtitle="Mining laser & gadgets">
              <LaserSelector
                lasers={lasers ?? []}
                selectedLaserUuid={selectedLaserUuid}
                selectedGadgetUuids={selectedGadgetUuids}
                onLaserChange={setSelectedLaserUuid}
                onGadgetsChange={setSelectedGadgetUuids}
              />
            </ScifiPanel>
          </motion.div>
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
                loading={loadingDetail}
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
              <RiskAssessment data={compositionData} risk={yieldData?.risk ?? null} selectedElementUuid={selectedElementUuid} />
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
              <YieldCalculator yieldResults={yieldData?.elements ?? null} selectedElementUuid={selectedElementUuid} />
            </ScifiPanel>
          </motion.div>

          {/* Laser Comparison Table */}
          {lasers && lasers.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
              <ScifiPanel title="Laser Comparison" subtitle="All mining lasers side-by-side">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono-sc">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500">
                        <th className="text-left p-2">Laser</th>
                        <th className="text-center p-2">Size</th>
                        <th className="text-center p-2">Grade</th>
                        <th className="text-right p-2">Speed</th>
                        <th className="text-right p-2">Range</th>
                        <th className="text-right p-2">Resistance</th>
                        <th className="text-right p-2">Instability</th>
                        <th className="text-left p-2">Manufacturer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lasers.map((laser) => (
                        <tr
                          key={laser.uuid}
                          onClick={() => setSelectedLaserUuid(laser.uuid)}
                          className={`border-b border-slate-800/50 cursor-pointer transition-colors ${selectedLaserUuid === laser.uuid ? 'bg-cyan-950/30 border-cyan-800' : 'hover:bg-slate-800/30'}`}
                        >
                          <td className="p-2 text-slate-300">{laser.name}</td>
                          <td className="p-2 text-center text-cyan-400">S{laser.size}</td>
                          <td className="p-2 text-center text-slate-400">{laser.grade ?? '—'}</td>
                          <td className="p-2 text-right text-green-400">{laser.miningSpeed.toFixed(2)}</td>
                          <td className="p-2 text-right text-blue-400">{laser.miningRange.toFixed(0)}m</td>
                          <td className="p-2 text-right text-amber-400">{laser.miningResistance.toFixed(3)}</td>
                          <td className="p-2 text-right text-red-400">{laser.miningInstability.toFixed(3)}</td>
                          <td className="p-2 text-slate-500">{laser.manufacturerName ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScifiPanel>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
