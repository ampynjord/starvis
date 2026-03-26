import { motion } from 'framer-motion';
import { Beaker, Loader2 } from 'lucide-react';
import type { MiningCompositionView } from '@/types/mining';
import { dangerColor, fNum, pct, probColor } from '@/views/mining-helpers';

export interface CompositionBreakdownProps {
  data: MiningCompositionView | null;
  loading?: boolean;
  selectedElementUuid: string | null;
  onSelectElement: (elementUuid: string) => void;
}

export function CompositionBreakdown({
  data,
  loading,
  selectedElementUuid,
  onSelectElement,
}: CompositionBreakdownProps) {
  if (!data) {
    return (
      <div className="text-center py-8 text-slate-600">
        <Beaker size={32} className="mx-auto mb-3 opacity-20" />
        <p className="text-xs font-mono-sc uppercase tracking-widest">
          Select a composition to view its breakdown
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8 text-slate-600">
        <Loader2 size={28} className="mx-auto mb-3 opacity-40 animate-spin" />
        <p className="text-xs font-mono-sc uppercase tracking-widest">Loading mineral data…</p>
      </div>
    );
  }

  if (data.elements.length === 0) {
    return (
      <div className="text-center py-8 text-slate-600">
        <Beaker size={32} className="mx-auto mb-3 opacity-20" />
        <p className="text-xs font-mono-sc uppercase tracking-widest">
          No minerals recorded for this deposit
        </p>
        <p className="text-[10px] text-slate-700 mt-1">
          Run the extractor to populate composition data
        </p>
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
