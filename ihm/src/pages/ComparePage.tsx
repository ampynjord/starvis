import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart3, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/services/api';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { useDebounce } from '@/hooks/useDebounce';
import { fDimension, fMass, fSpeed } from '@/utils/formatters';

interface ShipSelector {
  slot: 'a' | 'b';
  label: string;
}

export default function ComparePage() {
  const [searchParams] = useSearchParams();
  const [uuidA, setUuidA] = useState(searchParams.get('a') ?? '');
  const [uuidB, setUuidB] = useState(searchParams.get('b') ?? '');
  const [queryA, setQueryA] = useState('');
  const [queryB, setQueryB] = useState('');
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
    { key: 'length', label: 'Length', format: v => fDimension(v) },
    { key: 'width', label: 'Width', format: v => fDimension(v) },
    { key: 'height', label: 'Height', format: v => fDimension(v) },
    { key: 'scm_speed', label: 'SCM', format: v => fSpeed(v) },
    { key: 'afterburner_speed', label: 'Afterburner', format: v => fSpeed(v) },
    { key: 'pitch', label: 'Pitch', format: v => v != null ? `${v.toFixed(0)}°/s` : '—' },
    { key: 'yaw', label: 'Yaw', format: v => v != null ? `${v.toFixed(0)}°/s` : '—' },
    { key: 'roll', label: 'Roll', format: v => v != null ? `${v.toFixed(0)}°/s` : '—' },
    { key: 'crew_max', label: 'Max crew', format: v => v != null ? String(v) : '—' },
    { key: 'cargocapacity', label: 'Cargo (SCU)', format: v => v != null ? v.toLocaleString('en-US') : '—' },
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
          const query = slot === 'a' ? queryA : queryB;
          const setQuery = slot === 'a' ? setQueryA : setQueryB;
          const suggestions = slot === 'a' ? suggestA : suggestB;
          const ship = comparison?.[slot === 'a' ? 'ship1' : 'ship2'];

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
                  <button onClick={() => setUuid('')} className="text-slate-600 hover:text-red-400 transition-colors">
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
                          onClick={() => { setUuid(s.uuid); setQuery(''); }}
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
                  const delta = comparison.deltas[key];
                  if (!delta) return null;
                  return (
                    <motion.tr
                      key={key}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="py-2 px-3 text-slate-500 font-mono-sc text-xs">{label}</td>
                      <td className={`py-2 px-3 text-right font-mono-sc ${delta.better === 'ship1' ? 'text-green-400' : 'text-slate-300'}`}>
                        {format(delta.ship1)}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono-sc ${delta.better === 'ship2' ? 'text-green-400' : 'text-slate-300'}`}>
                        {format(delta.ship2)}
                      </td>
                      <td className={`py-2 px-3 text-right text-xs font-mono-sc ${delta.delta == null ? 'text-slate-700' : delta.delta > 0 ? 'text-cyan-500' : delta.delta < 0 ? 'text-amber-500' : 'text-slate-600'}`}>
                        {delta.delta != null ? (delta.delta > 0 ? '+' : '') + delta.delta.toFixed(0) : '—'}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ScifiPanel>
      )}

      {!uuidA && !uuidB && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-slate-600">
          <BarChart3 size={32} />
          <p className="font-orbitron text-sm tracking-widest">Select two ships to compare</p>
        </div>
      )}
    </div>
  );
}
