import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { MiningElementYield } from '@/types/api';
import { fNum } from '@/views/mining-helpers';

export interface YieldCalculatorProps {
  yieldResults: MiningElementYield[] | null;
  selectedElementUuid: string | null;
}

export function YieldCalculator({ yieldResults, selectedElementUuid }: YieldCalculatorProps) {
  if (!yieldResults || !yieldResults.length) {
    return (
      <div className="text-center py-8 text-slate-600">
        <TrendingUp size={32} className="mx-auto mb-3 opacity-20" />
        <p className="text-xs font-mono-sc uppercase tracking-widest">No yield data available</p>
      </div>
    );
  }

  const totalYield = yieldResults.reduce((sum, r) => sum + r.optimizedYield, 0);

  return (
    <div className="space-y-3">
      <ScifiPanel title="Expected Total Yield">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center px-3 py-2 border border-cyan-600/50 rounded">
            <div className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">
              Per Extraction
            </div>
            <div className="font-orbitron text-xl font-bold text-cyan-400">{fNum(totalYield, 1)}%</div>
            <div className="text-[10px] text-slate-600 mt-1">Average optimized</div>
          </div>
          <div className="text-center px-3 py-2 border border-slate-600/50 rounded">
            <div className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">
              Elements
            </div>
            <div className="font-orbitron text-xl font-bold text-slate-300">
              {yieldResults.length}
            </div>
            <div className="text-[10px] text-slate-600 mt-1">In composition</div>
          </div>
        </div>
      </ScifiPanel>

      <div className="space-y-2">
        {yieldResults
          .sort((a, b) => {
            if (!selectedElementUuid) return 0;
            const aSelected = a.elementUuid === selectedElementUuid;
            const bSelected = b.elementUuid === selectedElementUuid;
            if (aSelected === bSelected) return 0;
            return aSelected ? -1 : 1;
          })
          .map((result) => {
            const isSelected =
              selectedElementUuid != null && result.elementUuid === selectedElementUuid;

            return (
              <motion.div
                key={result.elementName}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`sci-panel px-4 py-3 ${isSelected ? 'border-cyan-500/70 bg-cyan-500/5' : ''}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="font-rajdhani font-semibold text-sm text-slate-100">
                      {result.elementName}
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono-sc">
                      Optimal laser power: {(result.windowStart * 100).toFixed(0)}% –{' '}
                      {(result.windowEnd * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-orbitron text-sm font-bold text-green-400">
                      {fNum(result.optimizedYield, 1)}%
                    </div>
                    <div className="text-[10px] text-slate-600">
                      <span className="line-through">{fNum(result.baseYield, 1)}%</span> → optimized
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] text-slate-600 font-mono-sc">
                    Laser power window (0–100%)
                  </div>
                  <div className="h-6 bg-slate-800 rounded border border-slate-700/50 overflow-hidden relative">
                    <div
                      className="absolute h-full bg-green-900/30 border-r border-green-600/50"
                      style={{
                        left: `${result.windowStart * 100}%`,
                        right: `${(1 - result.windowEnd) * 100}%`,
                      }}
                    />
                    <div
                      className="absolute h-full w-0.5 bg-cyan-400 top-0"
                      style={{ left: `${result.optimalWindow * 100}%` }}
                    />
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
