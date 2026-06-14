'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useState } from 'react';
import { BarChart3, Clock, DollarSign, Pickaxe, Search, Users } from 'lucide-react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { EarlyAccessNotice } from '@/components/ui/EarlyAccessNotice';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { MiningCompositionView } from '@/types/mining';
import { CompositionSelector } from '@/components/mining/CompositionSelector';
import { CompositionBreakdown } from '@/components/mining/CompositionBreakdown';
import { RiskAssessment } from '@/components/mining/RiskAssessment';
import { YieldCalculator } from '@/components/mining/YieldCalculator';
import { WorkflowProgress, type WorkflowPhase } from '@/components/mining/WorkflowProgress';
import { LaserSelector } from '@/components/mining/LaserSelector';
import { ProfitCalculator } from '@/components/mining/ProfitCalculator';
import { OreTable } from '@/components/mining/OreTable';
import { RockFinder } from '@/components/mining/RockFinder';
import { CrewShare } from '@/components/mining/CrewShare';
import { RefineryTimer } from '@/components/mining/RefineryTimer';

type Tab = 'workflow' | 'profit' | 'ores' | 'finder' | 'crew' | 'timer';

const TABS: { id: Tab; label: string; icon: React.ReactNode; subtitle: string }[] = [
  {
    id: 'workflow',
    label: 'Yield Workflow',
    icon: <Pickaxe size={14} />,
    subtitle: 'Scan → Composition → Risk → Yield',
  },
  {
    id: 'profit',
    label: 'Profit Calculator',
    icon: <DollarSign size={14} />,
    subtitle: 'Ore mass, refinery method, net profit',
  },
  {
    id: 'ores',
    label: 'Mineral Reference',
    icon: <BarChart3 size={14} />,
    subtitle: 'Full sortable ore table',
  },
  {
    id: 'finder',
    label: 'Rock Finder',
    icon: <Search size={14} />,
    subtitle: 'Find rocks containing a mineral',
  },
  {
    id: 'crew',
    label: 'Crew Share',
    icon: <Users size={14} />,
    subtitle: 'Split profits among the crew',
  },
  {
    id: 'timer',
    label: 'Refinery Timer',
    icon: <Clock size={14} />,
    subtitle: 'Track refinery jobs live',
  },
];

export default function MiningPage() {
  const { env } = useEnv();
  const [activeTab, setActiveTab] = useState<Tab>('workflow');
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
    <PageShell>
      <PageHeader
        title="Mining Calculator"
        subtitle="Complete toolkit: yield workflow, profit, mineral reference, rock finder, crew split, refinery timers."
      />
      <EarlyAccessNotice className="mb-4">
        Mining yields, rock matching, refinery timing and profit estimates are based on extracted and normalized data. Verify high-value routes or jobs in game before committing resources.
      </EarlyAccessNotice>

      {/* Tab navigation */}
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
        {/* Active tab subtitle */}
        {TABS.find((t) => t.id === activeTab) && (
          <div className="mt-1.5 text-[10px] text-slate-600 font-mono-sc uppercase tracking-widest pl-0.5">
            {TABS.find((t) => t.id === activeTab)!.subtitle}
          </div>
        )}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {/* ── YIELD WORKFLOW ──────────────────────────────────────────── */}
          {activeTab === 'workflow' && (
            <div>
              <WorkflowProgress
                currentPhase={currentPhase}
                hasData={compositionData != null}
                onPhaseChange={handlePhaseChange}
              />

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                {/* Left column */}
                <div className="xl:col-span-1 space-y-4">
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

                  {compositionData && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
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

                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
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

                {/* Right column */}
                <div className="xl:col-span-2 space-y-6">
                  <motion.div id="phase-composition" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
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

                  <motion.div id="phase-risk" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
                    <ScifiPanel
                      title="3. Risk Assessment"
                      subtitle="Instability, resistance, and hazard zones"
                      className={currentPhase === 'risk' ? 'ring-1 ring-cyan-600/30' : ''}
                    >
                      <RiskAssessment data={compositionData} risk={yieldData?.risk ?? null} selectedElementUuid={selectedElementUuid} />
                    </ScifiPanel>
                  </motion.div>

                  <motion.div id="phase-yield" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                    <ScifiPanel title="4. Yield Optimization" subtitle="Optimal laser power windows and expected output">
                      <YieldCalculator yieldResults={yieldData?.elements ?? null} selectedElementUuid={selectedElementUuid} />
                    </ScifiPanel>
                  </motion.div>

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
                                  <td className="p-2 text-right text-green-400">{laser.miningSpeed != null ? laser.miningSpeed.toFixed(2) : '—'}</td>
                                  <td className="p-2 text-right text-blue-400">{laser.miningRange != null ? `${laser.miningRange.toFixed(0)}m` : '—'}</td>
                                  <td className="p-2 text-right text-amber-400">{laser.miningResistance != null ? laser.miningResistance.toFixed(3) : '—'}</td>
                                  <td className="p-2 text-right text-red-400">{laser.miningInstability != null ? laser.miningInstability.toFixed(3) : '—'}</td>
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
          )}

          {/* ── PROFIT CALCULATOR ───────────────────────────────────────── */}
          {activeTab === 'profit' && <ProfitCalculator />}

          {/* ── MINERAL REFERENCE ───────────────────────────────────────── */}
          {activeTab === 'ores' && <OreTable />}

          {/* ── ROCK FINDER ─────────────────────────────────────────────── */}
          {activeTab === 'finder' && <RockFinder />}

          {/* ── CREW SHARE ──────────────────────────────────────────────── */}
          {activeTab === 'crew' && <CrewShare />}

          {/* ── REFINERY TIMER ──────────────────────────────────────────── */}
          {activeTab === 'timer' && <RefineryTimer />}
        </motion.div>
      </AnimatePresence>
    </PageShell>
  );
}
