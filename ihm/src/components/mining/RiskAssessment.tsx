import { AlertTriangle } from 'lucide-react';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { MiningRiskAggregates } from '@/types/api';
import type { MiningCompositionView } from '@/types/mining';
import { dangerBg, dangerColor, fNum, pct } from '@/pages/mining-helpers';

export interface RiskAssessmentProps {
  data: MiningCompositionView | null;
  risk: MiningRiskAggregates | null;
  selectedElementUuid: string | null;
}

export function RiskAssessment({ data, risk, selectedElementUuid }: RiskAssessmentProps) {
  if (!data || !data.elements.length) {
    return (
      <div className="text-center py-8 text-slate-600">
        <AlertTriangle size={32} className="mx-auto mb-3 opacity-20" />
        <p className="text-xs font-mono-sc uppercase tracking-widest">No risk data available</p>
      </div>
    );
  }

  const aggregates = risk
    ? { ...risk, hasHighRisk: risk.maxInstability > 0.6 || risk.maxResistance > 0.6 }
    : null;

  if (!aggregates) {
    return (
      <div className="text-center py-8 text-slate-600">
        <p className="text-xs font-mono-sc">No mineral risk properties available</p>
      </div>
    );
  }

  const selectedElement = selectedElementUuid
    ? (data.elements.find((el) => el.elementUuid === selectedElementUuid) ?? null)
    : null;

  return (
    <div className="space-y-3">
      {selectedElement && (
        <ScifiPanel title="Focused Material">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-rajdhani font-semibold text-cyan-300">
              {selectedElement.elementName}
            </span>
            <span className="text-xs text-slate-500">
              {pct(selectedElement.probability)} likelihood
            </span>
          </div>
        </ScifiPanel>
      )}

      <ScifiPanel title="Overall Risk Profile">
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-border/50 rounded p-3">
            <div className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">
              Max Instability
            </div>
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
            <div className="text-[10px] text-slate-600 font-mono-sc uppercase tracking-wider mb-1">
              Max Resistance
            </div>
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

      {aggregates.hasHighRisk && (
        <div className="sci-panel border-red-600/50 p-3 flex gap-3">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-300">
            <div className="font-semibold mb-1">⚠ High Risk Zone</div>
            <div className="text-[11px] text-red-200/80">
              This composition contains unstable or resistant minerals. Proceed with caution and use
              optimal laser power windows.
            </div>
          </div>
        </div>
      )}

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
                <span className="text-xs font-rajdhani font-semibold text-amber-300">
                  {el.elementName}
                </span>
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
