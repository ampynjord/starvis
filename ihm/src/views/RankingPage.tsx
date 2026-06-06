'use client';

/**
 * RankingPage - ship ranking table + bar chart
 */
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart2, ChevronDown, ChevronUp, ChevronsUpDown, Table2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { ListFilterBar, ListFilterResetButton, ListFilterSelect } from '@/components/ui/ListFilters';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTabs } from '@/components/ui/PageTabs';
import { PageShell } from '@/components/ui/PageShell';
import { useEnv } from '@/contexts/EnvContext';
import { api } from '@/services/api';
import type { RankingStat, ShipListItem } from '@/types/api';
import { fDimension, fMass, fNumber, fSpeed } from '@/utils/formatters';

const FALLBACK_STAT_CATEGORIES = ['All', 'Flight', 'Combat', 'Transport', 'Fuel', 'Dimensions'];
const FALLBACK_VEHICLE_CATEGORIES = [
  { label: 'Ships', value: 'ship' },
  { label: 'Ground', value: 'ground' },
  { label: 'Grav-lev', value: 'gravlev' },
];
const FALLBACK_TOP_OPTIONS = [
  { label: 'Top 25', value: 25 },
  { label: 'Top 50', value: 50 },
  { label: 'Top 100', value: 100 },
  { label: 'All', value: 0 },
];
const DEFAULT_SORT: Record<string, keyof ShipListItem> = {
  ship: 'scm_speed',
  ground: 'max_speed',
  gravlev: 'scm_speed',
};

function formatStatValue(stat: RankingStat, value: number | null): string {
  if (value == null) return '—';
  switch (stat.key) {
    case 'scm_speed':
    case 'max_speed':
    case 'boost_speed_forward':
      return fSpeed(value);
    case 'pitch_max':
    case 'yaw_max':
    case 'roll_max':
      return `${fNumber(value, 0)}°/s`;
    case 'mass':
      return fMass(value);
    case 'cross_section_x':
    case 'cross_section_y':
    case 'cross_section_z':
      return fDimension(value);
    case 'weapon_damage_total':
      return fNumber(value, 1);
    default:
      return fNumber(value, 0);
  }
}

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
  return order === 'desc' ? <ChevronDown size={12} className="text-cyan-400" /> : <ChevronUp size={12} className="text-cyan-400" />;
}

export default function RankingPage() {
  const { env } = useEnv();
  const [sortKey, setSortKey] = useState<keyof ShipListItem>('scm_speed');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [vehicleCat, setVehicleCat] = useState('ship');
  const [statCat, setStatCat] = useState('Flight');
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [topN, setTopN] = useState(50);
  const [manufacturer, setManufacturer] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ships.ranking', sortKey, order, vehicleCat, statCat, manufacturer, topN, env],
    queryFn: () =>
      api.ships.ranking({
        sort_by: String(sortKey),
        order,
        category: vehicleCat,
        stat_category: statCat,
        manufacturer: manufacturer || undefined,
        top: topN,
        env,
      }),
    staleTime: 5 * 60_000,
  });

  const { data: filters } = useQuery({
    queryKey: ['ships.filters', env],
    queryFn: () => api.ships.filters(env),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const stats = data?.stats ?? [];
  const displayShips = data?.ships ?? [];
  const activeStatDef = stats.find((stat) => stat.key === data?.sort) ?? stats.find((stat) => stat.key === sortKey) ?? stats[0];
  const statCategories = data?.statCategories ?? FALLBACK_STAT_CATEGORIES;
  const vehicleCategories = data?.vehicleCategories ?? FALLBACK_VEHICLE_CATEGORIES;
  const topOptions = data?.topOptions ?? FALLBACK_TOP_OPTIONS;
  const manufacturerOptions = (filters?.manufacturers ?? []).map((m) => ({ label: m.name, value: m.code }));
  const hasFilters = !!manufacturer;

  const handleSort = (key: keyof ShipListItem) => {
    if (key === sortKey) setOrder((current) => (current === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setOrder('desc');
    }
  };

  const switchVehicleCat = (cat: string) => {
    setVehicleCat(cat);
    setManufacturer('');
    setSortKey(DEFAULT_SORT[cat] ?? 'max_speed');
    setOrder('desc');
  };

  return (
    <PageShell>
      <PageHeader
        title="Ranking"
        subtitle={
          activeStatDef
            ? `${displayShips.length}${data && topN > 0 && data.total > displayShips.length ? `/${data.total}` : ''} ships · sorted by ${activeStatDef.label}`
            : undefined
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 border border-slate-800 rounded-sm p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="Table view"
                className={`p-1.5 rounded-sm transition-colors ${viewMode === 'table' ? 'bg-cyan-950/60 text-cyan-400' : 'text-slate-600 hover:text-slate-300'}`}
              >
                <Table2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('chart')}
                title="Chart view"
                className={`p-1.5 rounded-sm transition-colors ${viewMode === 'chart' ? 'bg-cyan-950/60 text-cyan-400' : 'text-slate-600 hover:text-slate-300'}`}
              >
                <BarChart2 size={14} />
              </button>
            </div>
          </div>
        }
      />

      <PageTabs
        className="mb-4"
        items={vehicleCategories}
        value={vehicleCat}
        onChange={switchVehicleCat}
      />

      <ListFilterBar>
        <ListFilterSelect
          value={statCat}
          onChange={(value) => setStatCat(value || 'All')}
          options={statCategories.filter((category) => category !== 'All').map((category) => ({ label: category, value: category }))}
          allLabel="All stat categories"
        />
        <ListFilterSelect
          value={manufacturer}
          onChange={setManufacturer}
          options={manufacturerOptions}
          allLabel="All manufacturers"
        />
        <ListFilterSelect
          value={String(topN)}
          onChange={(value) => setTopN(Number(value))}
          options={topOptions.map((option) => ({ label: option.label, value: String(option.value) }))}
          allLabel="Top"
          showAllOption={false}
        />
        {(hasFilters || statCat !== 'All') && (
          <ListFilterResetButton
            onClick={() => {
              setStatCat('All');
              setManufacturer('');
            }}
          />
        )}
      </ListFilterBar>

      <div className="min-w-0 overflow-x-auto">
          {isLoading ? (
            <LoadingGrid message="COMPUTING RANKINGS…" />
          ) : error ? (
            <ErrorState error={error as Error} onRetry={() => void refetch()} />
          ) : viewMode === 'chart' && activeStatDef ? (
            <div className="sci-panel p-4">
              <p className="font-orbitron text-xs font-bold uppercase tracking-widest mb-1 text-cyan-400">
                {activeStatDef.label}
                {activeStatDef.unit ? ` (${activeStatDef.unit})` : ''}
              </p>
              <p className="text-[10px] font-mono-sc text-slate-600 mb-4">Click a stat column in table view to change the chart</p>
              {!data?.chartData.length ? (
                <p className="text-xs text-slate-600 font-mono-sc py-8 text-center">No data for this stat</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(300, data.chartData.length * 24)}>
                  <BarChart data={data.chartData} layout="vertical" margin={{ top: 0, right: 80, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
                    <XAxis
                      type="number"
                      tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                      tickFormatter={(value: number) => formatStatValue(activeStatDef, value)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'Rajdhani, sans-serif' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', fontSize: '11px' }}
                      formatter={(value: number) => [formatStatValue(activeStatDef, value), activeStatDef.label]}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={18}>
                      {data.chartData.map((item, index) => (
                        <Cell key={item.uuid} fill={index === 0 ? '#fbbf24' : index < 3 ? '#22d3ee' : '#334155'} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="right"
                        formatter={(value: number) => formatStatValue(activeStatDef, value)}
                        style={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-3 py-2 text-slate-600 font-mono-sc uppercase tracking-wider w-8">#</th>
                  <th className="text-left px-3 py-2 text-slate-600 font-mono-sc uppercase tracking-wider">Ship</th>
                  <th className="text-left px-3 py-2 text-slate-600 font-mono-sc uppercase tracking-wider">Mfr</th>
                  {stats.map((stat) => (
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
                {displayShips.map((ship, index) => (
                  <motion.tr
                    key={ship.uuid}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.01, 0.4) }}
                    className="border-b border-slate-900 hover:bg-white/2 group"
                  >
                    <td className="px-3 py-1.5 text-slate-600 font-mono-sc text-center">
                      {index === 0 ? (
                        <span className="text-amber-400 font-bold">1</span>
                      ) : index === 1 ? (
                        <span className="text-slate-400">2</span>
                      ) : index === 2 ? (
                        <span className="text-amber-700">3</span>
                      ) : (
                        <span className="text-slate-700">{index + 1}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/ships/${ship.uuid}`}
                        className="text-slate-200 hover:text-cyan-400 font-rajdhani font-semibold group-hover:underline transition-colors"
                      >
                        {ship.name ?? ship.class_name}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      {ship.manufacturer_code && (
                        <GlowBadge color="slate" size="xs">
                          {ship.manufacturer_code}
                        </GlowBadge>
                      )}
                    </td>
                    {stats.map((stat) => {
                      const value = Number(ship[stat.key] ?? 0);
                      const max = data?.maxByKey[stat.key] ?? 1;
                      return (
                        <td key={stat.key as string} className={`px-3 py-1.5 text-right ${stat.key === sortKey ? 'bg-cyan-950/20' : ''}`}>
                          {value > 0 ? (
                            <div>
                              <div className="text-slate-200 font-mono-sc mb-0.5">{formatStatValue(stat, value)}</div>
                              <StatBar value={value} max={max} invert={!stat.higher_is_better} />
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
    </PageShell>
  );
}
