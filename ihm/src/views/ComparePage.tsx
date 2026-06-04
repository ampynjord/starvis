'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart3, Check, Link, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { useDebounce } from '@/hooks/useDebounce';
import { fDimension, fMass, fSpeed } from '@/utils/formatters';
import type { Ship, ShipListItem } from '@/types/api';

type Slot = 'a' | 'b' | 'c' | 'd';

const SLOTS: { slot: Slot; label: string; color: string; radarColor: string }[] = [
  { slot: 'a', label: 'Ship A', color: 'text-cyan-400',   radarColor: '#22d3ee' },
  { slot: 'b', label: 'Ship B', color: 'text-amber-400',  radarColor: '#fbbf24' },
  { slot: 'c', label: 'Ship C', color: 'text-green-400',  radarColor: '#4ade80' },
  { slot: 'd', label: 'Ship D', color: 'text-purple-400', radarColor: '#c084fc' },
];

const RADAR_STATS: { key: keyof Ship; label: string }[] = [
  { key: 'scm_speed',            label: 'SCM Speed'  },
  { key: 'pitch_max',            label: 'Agility'    },
  { key: 'weapon_damage_total',  label: 'Weapons'    },
  { key: 'total_hp',             label: 'Hull HP'    },
  { key: 'shield_hp',            label: 'Shield'     },
  { key: 'cargo_capacity',       label: 'Cargo'      },
  { key: 'missile_damage_total', label: 'Missiles'   },
  { key: 'hydrogen_fuel_capacity', label: 'Fuel'     },
];

const STAT_ROWS: {
  key: keyof Ship;
  label: string;
  format: (v: number | null | undefined) => string;
  lowerIsBetter?: boolean;
}[] = [
  { key: 'mass',                 label: 'Mass',        format: (v) => fMass(v ?? null),        lowerIsBetter: true },
  { key: 'cross_section_z',      label: 'Length',      format: (v) => fDimension(v ?? null) },
  { key: 'cross_section_x',      label: 'Width',       format: (v) => fDimension(v ?? null) },
  { key: 'cross_section_y',      label: 'Height',      format: (v) => fDimension(v ?? null) },
  { key: 'scm_speed',            label: 'SCM',         format: (v) => fSpeed(v ?? null) },
  { key: 'max_speed',            label: 'Max speed',   format: (v) => fSpeed(v ?? null) },
  { key: 'boost_speed_forward',  label: 'Boost fwd',   format: (v) => fSpeed(v ?? null) },
  { key: 'pitch_max',            label: 'Pitch',       format: (v) => v != null ? `${v.toFixed(0)}°/s` : '—' },
  { key: 'yaw_max',              label: 'Yaw',         format: (v) => v != null ? `${v.toFixed(0)}°/s` : '—' },
  { key: 'roll_max',             label: 'Roll',        format: (v) => v != null ? `${v.toFixed(0)}°/s` : '—' },
  { key: 'crew_size',            label: 'Crew',        format: (v) => v != null ? String(v) : '—' },
  { key: 'cargo_capacity',       label: 'Cargo (SCU)', format: (v) => v != null ? v.toLocaleString('en-US') : '—' },
  { key: 'total_hp',             label: 'Total HP',    format: (v) => v != null ? v.toLocaleString('en-US') : '—' },
  { key: 'shield_hp',            label: 'Shield HP',   format: (v) => v != null ? v.toLocaleString('en-US') : '—' },
  { key: 'missile_damage_total', label: 'Missiles',    format: (v) => v != null ? v.toLocaleString('en-US') : '—' },
  { key: 'weapon_damage_total',  label: 'Weapons',     format: (v) => v != null ? v.toLocaleString('en-US') : '—' },
  { key: 'hydrogen_fuel_capacity', label: 'H² Fuel',   format: (v) => v != null ? `${v.toFixed(0)} u` : '—' },
  { key: 'quantum_fuel_capacity',  label: 'QT Fuel',   format: (v) => v != null ? `${v.toFixed(0)} u` : '—' },
];

/** Build radar data normalized 0–100 relative to all active ships */
function buildRadarData(ships: (Ship | undefined)[], names: string[]) {
  return RADAR_STATS.map(({ key, label }) => {
    const vals = ships.map((s) => (s?.[key] as number | null | undefined) ?? 0);
    const max = Math.max(...vals);
    const point: Record<string, unknown> = { stat: label };
    ships.forEach((_, i) => {
      point[names[i]] = max > 0 ? Math.round((vals[i] / max) * 100) : 0;
    });
    return point;
  });
}

/** Returns index of best value; null if all tied */
function bestIndex(
  ships: (Ship | undefined)[],
  key: keyof Ship,
  lowerIsBetter = false,
): number | null {
  const vals = ships.map((s) => (s?.[key] as number | null | undefined) ?? null);
  const allNull = vals.every((v) => v === null);
  if (allNull) return null;
  const nums = vals.map((v) => v ?? (lowerIsBetter ? Infinity : -Infinity));
  const best = lowerIsBetter ? Math.min(...nums) : Math.max(...nums);
  const bestIdxs = nums.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
  return bestIdxs.length === ships.filter(Boolean).length ? null : (bestIdxs[0] ?? null);
}

interface SlotState {
  uuid: string;
  query: string;
  ship: ShipListItem | null;
}

const initSlot = (): SlotState => ({ uuid: '', query: '', ship: null });

export default function ComparePage() {
  const searchParams = useSearchParams();
  const { env } = useEnv();
  const [copied, setCopied] = useState(false);
  const [slots, setSlots] = useState<Record<Slot, SlotState>>({
    a: { ...initSlot(), uuid: searchParams?.get('a') ?? '' },
    b: { ...initSlot(), uuid: searchParams?.get('b') ?? '' },
    c: { ...initSlot(), uuid: searchParams?.get('c') ?? '' },
    d: { ...initSlot(), uuid: searchParams?.get('d') ?? '' },
  });

  const updateSlot = (slot: Slot, patch: Partial<SlotState>) =>
    setSlots((prev) => ({ ...prev, [slot]: { ...prev[slot], ...patch } }));

  const dA = useDebounce(slots.a.query, 300);
  const dB = useDebounce(slots.b.query, 300);
  const dC = useDebounce(slots.c.query, 300);
  const dD = useDebounce(slots.d.query, 300);
  const debounced: Record<Slot, string> = { a: dA, b: dB, c: dC, d: dD };

  const suggestA = useQuery({ queryKey: ['ships.search', dA, env], queryFn: () => api.ships.search(dA, 6, env), enabled: dA.length >= 2 });
  const suggestB = useQuery({ queryKey: ['ships.search', dB, env], queryFn: () => api.ships.search(dB, 6, env), enabled: dB.length >= 2 });
  const suggestC = useQuery({ queryKey: ['ships.search', dC, env], queryFn: () => api.ships.search(dC, 6, env), enabled: dC.length >= 2 });
  const suggestD = useQuery({ queryKey: ['ships.search', dD, env], queryFn: () => api.ships.search(dD, 6, env), enabled: dD.length >= 2 });
  const suggestions: Record<Slot, ShipListItem[] | undefined> = {
    a: suggestA.data, b: suggestB.data, c: suggestC.data, d: suggestD.data,
  };

  const qA = useQuery({ queryKey: ['ships.get', slots.a.uuid, env], queryFn: () => api.ships.get(slots.a.uuid, env), enabled: !!slots.a.uuid });
  const qB = useQuery({ queryKey: ['ships.get', slots.b.uuid, env], queryFn: () => api.ships.get(slots.b.uuid, env), enabled: !!slots.b.uuid });
  const qC = useQuery({ queryKey: ['ships.get', slots.c.uuid, env], queryFn: () => api.ships.get(slots.c.uuid, env), enabled: !!slots.c.uuid });
  const qD = useQuery({ queryKey: ['ships.get', slots.d.uuid, env], queryFn: () => api.ships.get(slots.d.uuid, env), enabled: !!slots.d.uuid });
  const shipData: Record<Slot, Ship | undefined> = { a: qA.data, b: qB.data, c: qC.data, d: qD.data };
  const isLoading = [qA, qB, qC, qD].some((q) => q.isFetching);

  const activeSlots = SLOTS.filter((s) => !!slots[s.slot].uuid);
  const activeShips = activeSlots.map((s) => shipData[s.slot]);
  const shipNames = activeSlots.map((s) => shipData[s.slot]?.name ?? s.label);

  const canShowComparison = activeSlots.length >= 2;

  const handleShare = () => {
    const params = new URLSearchParams();
    SLOTS.forEach(({ slot }) => { if (slots[slot].uuid) params.set(slot, slots[slot].uuid); });
    const url = `${window.location.origin}/compare?${params.toString()}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <PageShell>
      <PageHeader
        title="Compare"
        subtitle="Compare up to 4 ships side by side"
        actions={canShowComparison ? (
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1.5 sci-panel px-3 py-1.5 text-xs font-mono-sc text-slate-400 hover:text-cyan-400 transition-colors"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Link size={12} />}
            {copied ? 'Copied!' : 'Share'}
          </button>
        ) : undefined}
      />

      {/* Ship selectors */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SLOTS.map(({ slot, label, color }) => {
          const state = slots[slot];
          const info = shipData[slot];
          const sugg = suggestions[slot];
          const isOptional = slot === 'c' || slot === 'd';

          return (
            <ScifiPanel key={slot} title={`${label}${isOptional ? ' (opt.)' : ''}`}>
              {state.uuid && info ? (
                <div className="space-y-2">
                  {info.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={info.thumbnail}
                      alt={info.name}
                      className="w-full h-14 object-cover rounded opacity-80"
                    />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono-sc text-slate-600">{info.manufacturer_code}</p>
                      <p className={`font-orbitron text-sm ${color} truncate`}>{info.name}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {info.career
                          ? <GlowBadge color="cyan" size="xs">{info.career}</GlowBadge>
                          : info.vehicle_category && info.vehicle_category !== 'ship'
                            ? <GlowBadge color="amber" size="xs">{info.vehicle_category}</GlowBadge>
                            : null
                        }
                      </div>
                    </div>
                    <button
                      onClick={() => updateSlot(slot, { uuid: '', ship: null })}
                      className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={state.query}
                    onChange={(e) => updateSlot(slot, { query: e.target.value })}
                    placeholder="Search…"
                    className="sci-input w-full text-sm"
                  />
                  {debounced[slot].length >= 2 && sugg && sugg.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 right-0 sci-panel z-40 overflow-hidden">
                      {sugg.map((s) => (
                        <button
                          key={s.uuid}
                          type="button"
                          onClick={() => updateSlot(slot, { uuid: s.uuid, ship: s, query: '' })}
                          className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-cyan-950/40 transition-colors truncate"
                        >
                          <span className="text-cyan-700 mr-2 text-xs">{s.manufacturer_code}</span>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </ScifiPanel>
          );
        })}
      </div>

      {isLoading && <LoadingGrid message="LOADING SHIPS…" />}

      {/* Comparison table */}
      {canShowComparison && !isLoading && (
        <ScifiPanel title="Comparison" subtitle="Highlighted = best value">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-mono-sc text-slate-600 w-28">Stat</th>
                  {activeSlots.map((s, i) => (
                    <th key={s.slot} className={`text-right py-2 px-3 text-xs font-orbitron ${s.color}`}>
                      {activeShips[i]?.name ?? s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {STAT_ROWS.map(({ key, label, format, lowerIsBetter }) => {
                  const best = bestIndex(activeShips, key, lowerIsBetter);
                  const vals = activeShips.map((s) => (s?.[key] as number | null | undefined) ?? null);
                  const hasAny = vals.some((v) => v !== null);
                  if (!hasAny) return null;
                  return (
                    <motion.tr
                      key={key}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="py-1.5 px-3 text-slate-500 font-mono-sc text-xs">{label}</td>
                      {activeShips.map((ship, i) => (
                        <td
                          key={activeSlots[i].slot}
                          className={`py-1.5 px-3 text-right font-mono-sc text-xs ${
                            best === i ? 'text-green-400 font-bold' : 'text-slate-300'
                          }`}
                        >
                          {format(ship?.[key] as number | null | undefined)}
                        </td>
                      ))}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ScifiPanel>
      )}

      {/* Radar chart — all active ships (up to 4) */}
      {canShowComparison && !isLoading && activeShips.filter(Boolean).length >= 2 && (
        <ScifiPanel title="Radar Overview" subtitle="Normalized 0–100 relative to selected ships">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                data={buildRadarData(activeShips, shipNames)}
                margin={{ top: 8, right: 40, bottom: 8, left: 40 }}
              >
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis
                  dataKey="stat"
                  tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'Rajdhani, sans-serif' }}
                />
                {activeSlots.map((s, i) => (
                  <Radar
                    key={s.slot}
                    name={shipNames[i]}
                    dataKey={shipNames[i]}
                    stroke={s.radarColor}
                    fill={s.radarColor}
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                ))}
                <Legend iconSize={10} wrapperStyle={{ fontSize: '11px', fontFamily: 'Rajdhani, sans-serif' }} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', fontSize: '11px' }}
                  formatter={(val: number) => [`${val}%`]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </ScifiPanel>
      )}

      {activeSlots.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-slate-600">
          <BarChart3 size={32} />
          <p className="font-orbitron text-sm tracking-widest">Select up to 4 ships to compare</p>
        </div>
      )}
    </PageShell>
  );
}
