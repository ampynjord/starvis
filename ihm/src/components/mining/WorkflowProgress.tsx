import { motion } from 'framer-motion';
import { AlertTriangle, Beaker, Target, TrendingUp, type LucideIcon } from 'lucide-react';

export type WorkflowPhase = 'scan' | 'composition' | 'risk' | 'yield';

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

export interface WorkflowProgressProps {
  currentPhase: WorkflowPhase;
  hasData: boolean;
  onPhaseChange: (phase: WorkflowPhase) => void;
}

export function WorkflowProgress({
  currentPhase,
  hasData,
  onPhaseChange,
}: WorkflowProgressProps) {
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
                    isCurrent
                      ? 'text-cyan-400'
                      : isActive
                        ? 'text-slate-400'
                        : isClickable
                          ? 'text-slate-600'
                          : 'text-slate-700'
                  }`}
                />
                <div className="text-[10px] font-mono-sc uppercase tracking-wider text-center leading-tight">
                  <div className={isCurrent ? 'text-cyan-400' : isActive ? 'text-slate-300' : 'text-slate-600'}>
                    {config.label}
                  </div>
                  <div
                    className={isCurrent ? 'text-cyan-300' : isActive ? 'text-slate-500' : 'text-slate-700'}
                  >
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
