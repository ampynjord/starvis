import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Info, Plus, Trash2 } from 'lucide-react';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { BASE_REFINERY_MINUTES_PER_SCU, ORE_PRICES, REFINERY_METHODS } from '@/data/mining-static';

interface OreEntry {
  id: number;
  oreName: string;
  massScu: number;
  orePct: number;
  pricePerScu: number;
}

let _id = 0;
function newId() {
  return ++_id;
}

function defaultPrice(name: string): number {
  const lower = name.toLowerCase();
  const match = ORE_PRICES.find((p) => lower.includes(p.classFragment));
  return match?.pricePerScu ?? 100;
}

export function ProfitCalculator() {
  const [methodId, setMethodId] = useState('cormack');
  const [ores, setOres] = useState<OreEntry[]>([
    { id: newId(), oreName: 'Quantanium', massScu: 2000, orePct: 25, pricePerScu: 1450 },
  ]);
  const [customPrices, setCustomPrices] = useState<Record<number, string>>({});

  const method = REFINERY_METHODS.find((m) => m.id === methodId) ?? REFINERY_METHODS[1];

  const addOre = () => {
    setOres((prev) => [...prev, { id: newId(), oreName: 'Iron', massScu: 2000, orePct: 10, pricePerScu: 60 }]);
  };

  const removeOre = (id: number) => {
    setOres((prev) => prev.filter((o) => o.id !== id));
  };

  const updateOre = (id: number, field: keyof OreEntry, value: string | number) => {
    setOres((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const updated = { ...o, [field]: field === 'massScu' || field === 'orePct' ? Number(value) : value };
        if (field === 'oreName') {
          const price = defaultPrice(String(value));
          updated.pricePerScu = price;
          setCustomPrices((cp) => ({ ...cp, [id]: String(price) }));
        }
        return updated;
      }),
    );
  };

  const updateCustomPrice = (id: number, raw: string) => {
    setCustomPrices((cp) => ({ ...cp, [id]: raw }));
    const v = Number.parseFloat(raw);
    if (!Number.isNaN(v) && v >= 0) {
      setOres((prev) => prev.map((o) => (o.id === id ? { ...o, pricePerScu: v } : o)));
    }
  };

  const results = useMemo(() => {
    return ores.map((ore) => {
      const rawScu = ore.massScu * (ore.orePct / 100);
      const refinedScu = rawScu * method.yieldPct;
      const grossValue = refinedScu * ore.pricePerScu;
      const refineryFee = grossValue * method.feePct;
      const netProfit = grossValue - refineryFee;
      const estimatedMinutes = rawScu * BASE_REFINERY_MINUTES_PER_SCU * method.timeMultiplier;
      return {
        id: ore.id,
        oreName: ore.oreName,
        rawScu,
        refinedScu,
        grossValue,
        refineryFee,
        netProfit,
        estimatedMinutes,
      };
    });
  }, [ores, method]);

  const totals = useMemo(() => {
    return results.reduce(
      (acc, r) => ({
        rawScu: acc.rawScu + r.rawScu,
        refinedScu: acc.refinedScu + r.refinedScu,
        grossValue: acc.grossValue + r.grossValue,
        refineryFee: acc.refineryFee + r.refineryFee,
        netProfit: acc.netProfit + r.netProfit,
        estimatedMinutes: acc.estimatedMinutes + r.estimatedMinutes,
      }),
      { rawScu: 0, refinedScu: 0, grossValue: 0, refineryFee: 0, netProfit: 0, estimatedMinutes: 0 },
    );
  }, [results]);

  function fmtDuration(minutes: number): string {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }

  const fmt = (v: number) => Math.round(v).toLocaleString();
  const fmtScu = (v: number) => v.toFixed(2);

  return (
    <div className="space-y-4">
      {/* Refinery method selector */}
      <ScifiPanel title="Refinery Method" subtitle="Choose processing method — affects yield, fee, and time">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {REFINERY_METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethodId(m.id)}
              className={`text-left p-3 rounded-sm border transition-colors ${
                methodId === m.id
                  ? 'border-cyan-500/70 bg-cyan-950/30 text-cyan-300'
                  : 'border-slate-700/50 hover:border-slate-600/60 text-slate-400'
              }`}
            >
              <div className="font-rajdhani font-semibold text-sm">{m.name}</div>
              <div className="text-[10px] font-mono-sc mt-1 space-y-0.5">
                <div>
                  <span className="text-slate-600">Yield </span>
                  <span className="text-green-400">{(m.yieldPct * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-slate-600">Fee </span>
                  <span className="text-amber-400">{(m.feePct * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-slate-600">Speed </span>
                  <span className="text-blue-400">{(m.timeMultiplier * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="text-[9px] text-slate-600 mt-1 leading-tight">{m.description}</div>
            </button>
          ))}
        </div>
      </ScifiPanel>

      {/* Ore entries */}
      <ScifiPanel
        title="Ore Entries"
        subtitle="Add mined ores with their rock mass and percentage"
        actions={
          <button
            type="button"
            onClick={addOre}
            className="sci-btn sci-btn-primary flex items-center gap-1.5 text-xs px-2 py-1"
          >
            <Plus size={12} />
            Add Ore
          </button>
        }
      >
        <div className="space-y-3">
          {ores.map((ore) => (
            <motion.div
              key={ore.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="sci-panel px-3 py-3 space-y-2"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Ore name */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">Ore Type</label>
                  <select
                    value={ore.oreName}
                    onChange={(e) => updateOre(ore.id, 'oreName', e.target.value)}
                    className="sci-select w-full text-xs"
                  >
                    {ORE_PRICES.map((p) => (
                      <option key={p.classFragment} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                    <option value="Custom">Custom</option>
                  </select>
                </div>

                {/* Rock mass */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">Rock Mass (SCU)</label>
                  <input
                    type="number"
                    min={1}
                    value={ore.massScu}
                    onChange={(e) => updateOre(ore.id, 'massScu', e.target.value)}
                    className="sci-input w-full text-xs"
                  />
                </div>

                {/* Ore % */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">Ore % in Rock</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={ore.orePct}
                    onChange={(e) => updateOre(ore.id, 'orePct', Number(e.target.value))}
                    className="sci-input w-full text-xs"
                  />
                </div>

                {/* Price per SCU */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">
                    Price (aUEC/SCU)
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={customPrices[ore.id] ?? ore.pricePerScu}
                      onChange={(e) => updateCustomPrice(ore.id, e.target.value)}
                      className="sci-input w-full text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeOre(ore.id)}
                      className="text-red-500/70 hover:text-red-400 shrink-0"
                      aria-label="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Inline result */}
              {(() => {
                const r = results.find((x) => x.id === ore.id);
                if (!r) return null;
                return (
                  <div className="flex flex-wrap gap-3 mt-2 text-[10px] font-mono-sc border-t border-slate-800/50 pt-2">
                    <span>
                      <span className="text-slate-600">Raw: </span>
                      <span className="text-slate-300">{fmtScu(r.rawScu)} SCU</span>
                    </span>
                    <span>
                      <span className="text-slate-600">Refined: </span>
                      <span className="text-cyan-400">{fmtScu(r.refinedScu)} SCU</span>
                    </span>
                    <span>
                      <span className="text-slate-600">Gross: </span>
                      <span className="text-green-400">{fmt(r.grossValue)} aUEC</span>
                    </span>
                    <span>
                      <span className="text-slate-600">Fee: </span>
                      <span className="text-amber-400">-{fmt(r.refineryFee)} aUEC</span>
                    </span>
                    <span>
                      <span className="text-slate-600">Net: </span>
                      <span className={r.netProfit >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                        {fmt(r.netProfit)} aUEC
                      </span>
                    </span>
                    <span>
                      <span className="text-slate-600">Est. time: </span>
                      <span className="text-blue-400">{fmtDuration(r.estimatedMinutes)}</span>
                    </span>
                  </div>
                );
              })()}
            </motion.div>
          ))}

          {ores.length === 0 && (
            <div className="text-center py-6 text-slate-600 text-xs font-mono-sc">
              No ores added. Click "Add Ore" to start.
            </div>
          )}
        </div>
      </ScifiPanel>

      {/* Totals panel */}
      {ores.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <ScifiPanel title="Total Summary" subtitle={`Using ${method.name} · ${(method.yieldPct * 100).toFixed(0)}% yield · ${(method.feePct * 100).toFixed(1)}% fee`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Raw SCU" value={`${fmtScu(totals.rawScu)} SCU`} color="text-slate-300" />
              <StatCard label="Refined SCU" value={`${fmtScu(totals.refinedScu)} SCU`} color="text-cyan-400" />
              <StatCard label="Gross Value" value={`${fmt(totals.grossValue)} aUEC`} color="text-green-400" />
              <StatCard label="Refinery Fee" value={`-${fmt(totals.refineryFee)} aUEC`} color="text-amber-400" />
              <StatCard label="Net Profit" value={`${fmt(totals.netProfit)} aUEC`} color={totals.netProfit >= 0 ? 'text-green-400' : 'text-red-400'} large />
              <StatCard label="Est. Duration" value={fmtDuration(totals.estimatedMinutes)} color="text-blue-400" />
            </div>

            {/* Efficiency bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[10px] font-mono-sc text-slate-600 mb-1">
                <span>Profit efficiency (net / gross)</span>
                <span>{totals.grossValue > 0 ? ((totals.netProfit / totals.grossValue) * 100).toFixed(1) : 0}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{
                    width: `${totals.grossValue > 0 ? Math.max(0, Math.min(100, (totals.netProfit / totals.grossValue) * 100)) : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2 text-[10px] text-slate-600 font-mono-sc">
              <Info size={11} className="shrink-0 mt-0.5" />
              <span>
                Rock Mass (SCU) = the mass number shown on the rock in-game. Prices are community estimates — override the "Price" field for live values.
                Duration is an approximation based on {BASE_REFINERY_MINUTES_PER_SCU} min/raw SCU.
              </span>
            </div>
          </ScifiPanel>
        </motion.div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, large }: { label: string; value: string; color: string; large?: boolean }) {
  return (
    <div className="border border-slate-800/60 rounded-sm p-3 text-center">
      <div className="text-[9px] uppercase tracking-widest text-slate-600 font-mono-sc mb-1">{label}</div>
      <div className={`font-orbitron font-bold ${large ? 'text-base' : 'text-sm'} ${color}`}>{value}</div>
    </div>
  );
}
