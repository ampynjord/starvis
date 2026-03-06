import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart3, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { useDebounce } from '@/hooks/useDebounce';
import { fDimension, fMass, fSpeed } from '@/utils/formatters';
import type { Ship } from '@/types/api';

interface ShipSelector {
  slot: 'a' | 'b';
  label: string;
}

// Radar chart stats: normalize each stat to 0–100 relative to both ships
const RADAR_STATS: { key: keyof Ship; label: string }[] = [
  { key: 'scm_speed', label: 'SCM Speed' },
  { key: 'max_speed', label: 'Max Speed' },
  { key: 'pitch_max', label: 'Agility' },
  { key: 'total_hp', label: 'Hull HP' },
  { key: 'shield_hp', label: 'Shield HP' },
  { key: 'cargo_capacity', label: 'Cargo' },
];

function buildRadarData(s1: Ship, s2: Ship) {
  return RADAR_STATS.map(({ key, label }) => {
    const v1 = (s1[key] as number | null) ?? 0;
    const v2 = (s2[key] as number | null) ?? 0;
    const m = Math.max(v1, v2);
    return {
      stat: label,
      [s1.name ?? 'Ship A']: m > 0 ? Math.round((v1 / m) * 100) : 0,
      [s2.name ?? 'Ship B']: m > 0 ? Math.round((v2 / m) * 100) : 0,
    };
  });
}

export default function ComparePage() {
  const [searchParams] = useSearchParams();
  const [uuidA, setUuidA] = useState(searchParams.get('a') ?? '');
  const [uuidB, setUuidB] = useState(searchParams.get('b') ?? '');
  const [queryA, setQueryA] = useState('');
  const [queryB, setQueryB] = useState('');
  const [shipA, setShipA] = useState<{ uuid: string; name: string; manufacturer_code: string | null; career: string | null; vehicle_category: string | null; manufacturer_name?: string | null } | null>(null);
  const [shipB, setShipB] = useState<{ uuid: string; name: string; manufacturer_code: string | null; career: string | null; vehicle_category: string | null; manufacturer_name?: string | null } | null>(null);
  const dA = useDebounce(queryA, 300);
  const dB = useDebounce(queryB, 300);

  const { data: suggestA } = useQuery({
    queryKey: ['ships.search', dA],
    queryFn: () => api.ships.search(dA, 6),
    enabled: dA.length >= 2,
  });
  const { data: suggestB } = useQuery({
    queryKey: ['ships.search', dB],
    queryFn: () => api.ships.search(dB, 6),
    enabled: dB.length >= 2,
  });

  const { data: comparison, isLoading } = useQuery({
    queryKey: ['ships.compare', uuidA, uuidB],
    queryFn: () => api.ships.compare(uuidA, uuidB),
    enabled: !!(uuidA && uuidB),
  });

  const STAT_ROWS: { key: string; label: string; format: (v: number | null) => string }[] = [
    { key: 'mass', label: 'Mass', format: v => fMass(v) },
    { key: 'cross_section_z', label: 'Length', format: v => fDimension(v) },
    { key: 'cross_section_x', label: 'Width', format: v => fDimension(v) },
    { key: 'cross_section_y', label: 'Height', format: v => fDimension(v) },
    { key: 'scm_speed', label: 'SCM', format: v => fSpeed(v) },
    { key: 'max_speed', label: 'Max speed', format: v => fSpeed(v) },
    { key: 'boost_speed_forward', label: 'Boost fwd', format: v => fSpeed(v) },
    { key: 'pitch_max', label: 'Pitch', format: v => v != null ? `${v.toFixed(0)}°/s` : '—' },
    { key: 'yaw_max', label: 'Yaw', format: v => v != null ? `${v.toFixed(0)}°/s` : '—' },
    { key: 'roll_max', label: 'Roll', format: v => v != null ? `${v.toFixed(0)}°/s` : '—' },
    { key: 'crew_size', label: 'Crew', format: v => v != null ? String(v) : '—' },
    { key: 'cargo_capacity', label: 'Cargo (SCU)', format: v => v != null ? v.toLocaleString('en-US') : '—' },
    { key: 'total_hp', label: 'Total HP', format: v => v != null ? v.toLocaleString('en-US') : '—' },
    { key: 'shield_hp', label: 'Shield HP', format: v => v != null ? v.toLocaleString('en-US') : '—' },
  ];

  return (
    <div className="max-w-screen-lg mx-auto space-y-6">
      <div>
        <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest">COMPARE</h1>
        <p className="text-sm text-slate-500 mt-0.5">Compare two ships side by side</p>
      </div>

      {/* Ship selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {([{ slot: 'a', label: 'Ship A' }, { slot: 'b', label: 'Ship B' }] as ShipSelector[]).map(({ slot, label }) => {
          const uuid = slot === 'a' ? uuidA : uuidB;
          const setUuid = slot === 'a' ? setUuidA : setUuidB;
          const setShip = slot === 'a' ? setShipA : setShipB;
          const query = slot === 'a' ? queryA : queryB;
          const setQuery = slot === 'a' ? setQueryA : setQueryB;
          const suggestions = slot === 'a' ? suggestA : suggestB;
          const ship = comparison?.full?.[slot === 'a' ? 'ship1' : 'ship2'] ?? (slot === 'a' ? shipA : shipB);

          return (
            <ScifiPanel key={slot} title={label}>
              {ship && uuid ? (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono-sc text-cyan-700">{ship.manufacturer_name}</p>
                    <p className="font-orbitron text-sm text-slate-200">{ship.name}</p>
                    <div className="flex gap-1.5 mt-1">
                      {ship.career && <GlowBadge color="cyan">{ship.career}</GlowBadge>}
                      {ship.vehicle_category && <GlowBadge color="slate">{ship.vehicle_category}</GlowBadge>}
                    </div>
                  </div>
                  <button onClick={() => { setUuid(''); setShip(null); }} className="text-slate-600 hover:text-red-400 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={`Search…`}
                    className="sci-input w-full text-sm"
                  />
                  {suggestions && suggestions.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 right-0 sci-panel z-40 overflow-hidden">
                      {suggestions.map(s => (
                        <button
                          key={s.uuid}
                          onClick={() => { setUuid(s.uuid); setShip(s); setQuery(''); }}
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

      {/* Results */}
      {isLoading && <LoadingGrid message="COMPARING…" />}

      {comparison && (
        <ScifiPanel title="Comparison" subtitle="Green = better, blue row = equivalent">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-mono-sc text-slate-600 w-32">Stat</th>
                  <th className="text-right py-2 px-3 text-xs font-orbitron text-cyan-400">{comparison.ship1.name}</th>
                  <th className="text-right py-2 px-3 text-xs font-orbitron text-amber-400">{comparison.ship2.name}</th>
                  <th className="text-right py-2 px-3 text-xs font-mono-sc text-slate-600">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {STAT_ROWS.map(({ key, label, format }) => {
                  const delta = comparison.comparison[key];
                  if (!delta) return null;
                  // higher = better for most stats; diff = ship2 - ship1
                  const better = delta.diff > 0 ? 'ship2' : delta.diff < 0 ? 'ship1' : null;
                  return (
                    <motion.tr
                      key={key}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="py-2 px-3 text-slate-500 font-mono-sc text-xs">{label}</td>
                      <td className={`py-2 px-3 text-right font-mono-sc ${better === 'ship1' ? 'text-green-400' : 'text-slate-300'}`}>
                        {format(delta.ship1)}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono-sc ${better === 'ship2' ? 'text-green-400' : 'text-slate-300'}`}>
                        {format(delta.ship2)}
                      </td>
                      <td className={`py-2 px-3 text-right text-xs font-mono-sc ${delta.diff === 0 ? 'text-slate-700' : delta.diff > 0 ? 'text-cyan-500' : 'text-amber-500'}`}>
                        {delta.diff !== 0 ? (delta.diff > 0 ? '+' : '') + delta.diff.toFixed(0) : '—'}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ScifiPanel>
      )}

      {/* Radar chart */}
      {comparison?.full?.ship1 && comparison?.full?.ship2 && (() => {
        const radarData = buildRadarData(comparison.full.ship1, comparison.full.ship2);
        const n1 = comparison.ship1.name ?? 'Ship A';
        const n2 = comparison.ship2.name ?? 'Ship B';
        return (
          <ScifiPanel title="Radar Overview" subtitle="Normalized 0–100 relative to the two ships">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top: 8, right: 32, bottom: 8, left: 32 }}>
                  <PolarGrid stroke="#1e293b" />
                  <PolarAngleAxis dataKey="stat" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'Rajdhani, sans-serif' }} />
                  <Radar name={n1} dataKey={n1} stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.15} strokeWidth={2} />
                  <Radar name={n2} dataKey={n2} stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.15} strokeWidth={2} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '11px', fontFamily: 'Rajdhani, sans-serif' }} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', fontSize: '11px' }}
                    formatter={(val: number) => [`${val}%`]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </ScifiPanel>
        );
      })()}

      {!uuidA && !uuidB && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-slate-600">
          <BarChart3 size={32} />
          <p className="font-orbitron text-sm tracking-widest">Select two ships to compare</p>
        </div>
      )}
    </div>
  );
}
