/**
 * RankingPage — SPViewer-style ship ranking table + bar chart
 * Sort all ships by any stat with percentage bars and chart view
 */
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart2, ChevronDown, ChevronUp, ChevronsUpDown, Table2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { FilterPanel } from '@/components/ui/FilterPanel';
import { fMass, fSpeed, fDimension, fNumber } from '@/utils/formatters';
import type { ShipListItem } from '@/types/api';

interface StatDef {
  key: keyof ShipListItem;
  label: string;
  unit?: string;
  format: (v: number | null) => string;
  higher_is_better: boolean;
  category?: string;
}

const STATS: StatDef[] = [
  // Flight
  { key: 'scm_speed',           label: 'SCM Speed',    unit: 'm/s', format: fSpeed,    higher_is_better: true,  category: 'Flight' },
  { key: 'max_speed',           label: 'Max Speed',    unit: 'm/s', format: fSpeed,    higher_is_better: true,  category: 'Flight' },
  { key: 'boost_speed_forward', label: 'AB Forward',   unit: 'm/s', format: fSpeed,    higher_is_better: true,  category: 'Flight' },
  { key: 'pitch_max',           label: 'Pitch',        unit: '°/s', format: v => v != null ? `${fNumber(v, 0)}°/s` : '—', higher_is_better: true, category: 'Flight' },
  { key: 'yaw_max',             label: 'Yaw',          unit: '°/s', format: v => v != null ? `${fNumber(v, 0)}°/s` : '—', higher_is_better: true, category: 'Flight' },
  { key: 'roll_max',            label: 'Roll',         unit: '°/s', format: v => v != null ? `${fNumber(v, 0)}°/s` : '—', higher_is_better: true, category: 'Flight' },
  // Combat
  { key: 'total_hp',            label: 'Hull HP',      unit: 'HP',  format: v => fNumber(v, 0), higher_is_better: true, category: 'Combat' },
  { key: 'shield_hp',           label: 'Shield HP',    unit: 'HP',  format: v => fNumber(v, 0), higher_is_better: true, category: 'Combat' },
  { key: 'weapon_damage_total', label: 'Weapon DPS',   unit: 'DPS', format: v => fNumber(v, 1), higher_is_better: true, category: 'Combat' },
  { key: 'missile_damage_total',label: 'Missile Dmg',  unit: '',    format: v => fNumber(v, 0), higher_is_better: true, category: 'Combat' },
  // Cargo / Crew
  { key: 'cargo_capacity',      label: 'Cargo',        unit: 'SCU', format: v => fNumber(v, 0), higher_is_better: true, category: 'Transport' },
  { key: 'crew_size',           label: 'Crew',         unit: '',    format: v => fNumber(v, 0), higher_is_better: true, category: 'Transport' },
  // Fuel
  { key: 'hydrogen_fuel_capacity', label: 'H² Fuel',   unit: 'L',   format: v => fNumber(v, 0), higher_is_better: true, category: 'Fuel' },
  { key: 'quantum_fuel_capacity',  label: 'QT Fuel',   unit: 'L',   format: v => fNumber(v, 0), higher_is_better: true, category: 'Fuel' },
  // Dimensions / Mass
  { key: 'mass',                label: 'Mass',         unit: '',    format: fMass,     higher_is_better: false, category: 'Dimensions' },
  { key: 'cross_section_z',     label: 'Length',       unit: 'm',   format: fDimension, higher_is_better: false, category: 'Dimensions' },
  { key: 'cross_section_x',     label: 'Width',        unit: 'm',   format: fDimension, higher_is_better: false, category: 'Dimensions' },
  { key: 'cross_section_y',     label: 'Height',       unit: 'm',   format: fDimension, higher_is_better: false, category: 'Dimensions' },
];

const CATEGORIES = ['All', 'Flight', 'Combat', 'Transport', 'Fuel', 'Dimensions'];
const VEHICLE_CATS = [
  { label: 'Ships', value: 'ship' },
  { label: 'Ground', value: 'ground' },
  { label: 'Grav-lev', value: 'gravlev' },
];

function StatBar({ value, max, invert }: { value: number; max: number; invert?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const isTop = pct >= 95;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isTop ? 'bg-amber-400' : invert ? 'bg-rose-500/70' : 'bg-cyan-500/80'}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[10px] font-mono-sc text-slate-500 w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function SortIcon({ col, active, order }: { col: string; active: string; order: 'asc' | 'desc' }) {
  if (col !== active) return <ChevronsUpDown size={12} className="text-slate-700" />;
  return order === 'desc'
    ? <ChevronDown size={12} className="text-cyan-400" />
    : <ChevronUp size={12} className="text-cyan-400" />;
}

export default function RankingPage() {
  const { env } = useEnv();
  const [sortKey, setSortKey]       = useState<keyof ShipListItem>('scm_speed');
  const [order, setOrder]           = useState<'asc' | 'desc'>('desc');
  const [vehicleCat, setVehicleCat] = useState('ship');
  const [statCat, setStatCat]       = useState('Flight');
  const [viewMode, setViewMode]     = useState<'table' | 'chart'>('table');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ships.ranking', sortKey, order, vehicleCat, env],
    queryFn: () => api.ships.ranking(String(sortKey), order, vehicleCat, env),
    staleTime: 5 * 60_000,
  });

  const handleSort = (key: keyof ShipListItem) => {
    if (key === sortKey) setOrder(o => o === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setOrder('desc'); }
  };

  const visibleStats = STATS.filter(s => statCat === 'All' || s.category === statCat);
  const activeStatDef = STATS.find(s => s.key === sortKey) ?? STATS[0];

  // Compute max per stat for percentage bars
  const ships = data ?? [];
  const maxByKey: Partial<Record<keyof ShipListItem, number>> = {};
  for (const stat of visibleStats) {
    const vals = ships.map(s => parseFloat(String(s[stat.key] ?? 0))).filter(v => v > 0);
    maxByKey[stat.key] = vals.length ? Math.max(...vals) : 1;
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase flex items-center gap-2">
            <Trophy size={18} className="text-amber-400" />
            Ranking
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-mono-sc">
            {ships.length} ships · sorted by <span className="text-cyan-500">{activeStatDef.label}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex gap-1 border border-slate-800 rounded p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Table view"
              className={`p-1.5 rounded transition-colors ${viewMode === 'table' ? 'bg-cyan-950/60 text-cyan-400' : 'text-slate-600 hover:text-slate-300'}`}
            >
              <Table2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              title="Chart view"
              className={`p-1.5 rounded transition-colors ${viewMode === 'chart' ? 'bg-cyan-950/60 text-cyan-400' : 'text-slate-600 hover:text-slate-300'}`}
            >
              <BarChart2 size={14} />
            </button>
          </div>

          {/* Vehicle category toggle */}
          <div className="flex gap-1">
            {VEHICLE_CATS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setVehicleCat(value)}
                className={`px-3 py-1.5 text-xs font-rajdhani font-semibold uppercase tracking-wider rounded border transition-all ${
                  vehicleCat === value
                    ? 'bg-cyan-950/60 border-cyan-800 text-cyan-400'
                    : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Left filter: stat categories */}
        <div className="w-40 flex-shrink-0">
          <FilterPanel
            hasFilters={statCat !== 'All'}
            onReset={() => setStatCat('All')}
            groups={[{
              key: 'cat',
              label: 'Stat category',
              options: CATEGORIES.map(c => ({ label: c, value: c })),
              value: statCat,
              onChange: (v: string) => { setStatCat(v); },
            }]}
          />
        </div>

        {/* Table / Chart */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          {isLoading ? (
            <LoadingGrid message="COMPUTING RANKINGS…" />
          ) : error ? (
            <ErrorState error={error as Error} onRetry={() => void refetch()} />
          ) : viewMode === 'chart' ? (
            /* ─── Bar Chart view ─── */
            <div className="space-y-6">
              {visibleStats.map((stat) => {
                const chartData = ships
                  .filter((s) => (s[stat.key] as number | null) != null && (s[stat.key] as number) > 0)
                  .slice(0, 20)
                  .map((s) => ({
                    name: (s.name ?? s.class_name ?? '').slice(0, 18),
                    value: parseFloat(String(s[stat.key])),
                    uuid: s.uuid,
                  }));
                if (!chartData.length) return null;
                const isActive = stat.key === sortKey;
                return (
                  <div
                    key={stat.key as string}
                    className={`sci-panel p-4 ${isActive ? 'border-cyan-800/60' : ''}`}
                  >
                    <p
                      className={`font-orbitron text-xs font-bold uppercase tracking-widest mb-3 cursor-pointer ${isActive ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                      onClick={() => handleSort(stat.key)}
                    >
                      {stat.label}
                      {stat.unit ? ` (${stat.unit})` : ''}
                    </p>
                    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 22)}>
                      <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 0, right: 80, bottom: 0, left: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
                        <XAxis
                          type="number"
                          tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                          tickFormatter={(v: number) => stat.format(v)}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={120}
                          tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'Rajdhani, sans-serif' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', fontSize: '11px' }}
                          formatter={(v: number) => [stat.format(v), stat.label]}
                          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        />
                        <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={16}>
                          {chartData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={i === 0 ? '#fbbf24' : i < 3 ? '#22d3ee' : '#334155'}
                            />
                          ))}
                          <LabelList
                            dataKey="value"
                            position="right"
                            formatter={(v: number) => stat.format(v)}
                            style={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ─── Table view ─── */
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-3 py-2 text-slate-600 font-mono-sc uppercase tracking-wider w-8">#</th>
                  <th className="text-left px-3 py-2 text-slate-600 font-mono-sc uppercase tracking-wider">Ship</th>
                  <th className="text-left px-3 py-2 text-slate-600 font-mono-sc uppercase tracking-wider">Mfr</th>
                  {visibleStats.map(stat => (
                    <th
                      key={stat.key as string}
                      className={`text-right px-3 py-2 font-mono-sc uppercase tracking-wider cursor-pointer whitespace-nowrap select-none transition-colors ${
                        stat.key === sortKey ? 'text-cyan-400' : 'text-slate-600 hover:text-slate-300'
                      }`}
                      onClick={() => handleSort(stat.key)}
                    >
                      <span className="flex items-center justify-end gap-1">
                        {stat.label}
                        <SortIcon col={stat.key as string} active={sortKey as string} order={order} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ships.map((ship, i) => (
                  <motion.tr
                    key={ship.uuid}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.5) }}
                    className="border-b border-slate-900 hover:bg-white/[0.02] group"
                  >
                    <td className="px-3 py-1.5 text-slate-600 font-mono-sc text-center">
                      {i === 0 ? <span className="text-amber-400 font-bold">1</span>
                       : i === 1 ? <span className="text-slate-400">2</span>
                       : i === 2 ? <span className="text-amber-700">3</span>
                       : <span className="text-slate-700">{i + 1}</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <Link to={`/ships/${ship.uuid}`} className="text-slate-200 hover:text-cyan-400 font-rajdhani font-semibold group-hover:underline transition-colors">
                        {ship.name ?? ship.class_name}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      {ship.manufacturer_code && (
                        <GlowBadge color="slate" size="xs">{ship.manufacturer_code}</GlowBadge>
                      )}
                    </td>
                    {visibleStats.map(stat => {
                      const raw = ship[stat.key] as number | null;
                      const val = raw != null ? parseFloat(String(raw)) : null;
                      const max = maxByKey[stat.key] ?? 1;
                      return (
                        <td key={stat.key as string} className={`px-3 py-1.5 text-right ${stat.key === sortKey ? 'bg-cyan-950/20' : ''}`}>
                          {val != null && val > 0 ? (
                            <div>
                              <div className="text-slate-200 font-mono-sc mb-0.5">{stat.format(val)}</div>
                              <StatBar value={val} max={max} invert={!stat.higher_is_better} />
                            </div>
                          ) : (
                            <span className="text-slate-700">—</span>
                          )}
                        </td>
                      );
                    })}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
