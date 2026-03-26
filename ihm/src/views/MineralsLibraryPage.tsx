/**
 * MineralsLibraryPage — Comprehensive Minerals Reference
 *
 * Display all minable minerals with:
 * - Name, instability, resistance properties
 * - Number of rocks containing each mineral
 * - Average probability in deposits
 * - Click to see detailed composition in rocks
 */
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Pickaxe,
  Search,
  Crosshair,
  Database,
  TrendingUp,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { MiningElement } from '@/types/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—';
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(decimals);
}

function rarityBadge(instability: number | null): string {
  if (instability == null) return 'Unknown';
  if (instability >= 900) return '★★★ Ultra Rare';
  if (instability >= 300) return '★★ Rare';
  if (instability >= 50) return '★ Uncommon';
  return 'Common';
}

function rarityColor(instability: number | null): string {
  if (instability == null) return 'bg-slate-700';
  if (instability >= 900) return 'bg-amber-900/40';
  if (instability >= 300) return 'bg-purple-900/40';
  if (instability >= 50) return 'bg-blue-900/40';
  return 'bg-green-900/40';
}

// ── HeaderStat ────────────────────────────────────────────────────────────────

interface HeaderStatProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  className?: string;
}

function HeaderStat({ icon: Icon, label, value, className = '' }: HeaderStatProps) {
  return (
    <div className={`sci-panel p-3 flex items-start gap-2 ${className}`}>
      <Icon className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-mono-sc text-cyan-300 truncate">{value}</p>
      </div>
    </div>
  );
}

// ── SortButton ────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'instability' | 'resistance' | 'rocks';

interface SortButtonProps {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  onSort: (key: SortKey) => void;
}

function SortButton({ label, sortKey, current, onSort }: SortButtonProps) {
  const isActive = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`px-3 py-1.5 text-xs font-mono-sc transition-all ${
        isActive
          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
          : 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-600/50'
      }`}
    >
      {label}
    </button>
  );
}

// ── MineralRow ────────────────────────────────────────────────────────────────

interface MineralRowProps {
  mineral: MiningElement;
}

function MineralRow({ mineral }: MineralRowProps) {
  const rarity = rarityBadge(mineral.instability ?? 0);
  const color = rarityColor(mineral.instability ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`sci-panel p-4 border-l-2 border-cyan-500/30 hover:border-cyan-500/60 transition-all cursor-pointer group ${color}`}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Name & Rarity */}
        <div className="flex flex-col justify-center gap-2">
          <h3 className="font-mono-sc text-sm text-cyan-300 group-hover:text-cyan-200 transition-colors">
            {mineral.name || 'Unknown'}
          </h3>
          <GlowBadge size="sm">{rarity}</GlowBadge>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 bg-black/20 rounded">
            <p className="text-slate-500">Instability</p>
            <p className="text-amber-400 font-mono-sc">{formatNumber(mineral.instability, 2)}</p>
          </div>
          <div className="p-2 bg-black/20 rounded">
            <p className="text-slate-500">Resistance</p>
            <p className="text-blue-400 font-mono-sc">{formatNumber(mineral.resistance, 4)}</p>
          </div>
        </div>

        {/* Rocks & Probability */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 bg-black/20 rounded">
            <p className="text-slate-500">Found In</p>
            <p className="text-cyan-400 font-mono-sc">{mineral.rocks_containing ?? 0} rocks</p>
          </div>
          <div className="p-2 bg-black/20 rounded">
            <p className="text-slate-500">Avg Prob</p>
            <p className="text-cyan-400 font-mono-sc">{mineral.avg_probability_pct != null ? `${mineral.avg_probability_pct}%` : '—'}</p>
          </div>
        </div>

        {/* View Details */}
        <div className="flex items-center justify-end">
          <Link
            href={`/mining`}
            className="p-2 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/40 transition-colors flex gap-2 items-center text-xs"
          >
            View Details
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MineralsLibraryPage() {
  const env = useEnv();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');

  const { data: minerals = [], isLoading, error } = useQuery({
    queryKey: ['minerals-library', env.env],
    queryFn: () => api.mining.elements(env.env),
  });

  const filtered = useMemo(() => {
    let result = minerals.filter((m) => !search || m.name?.toLowerCase().includes(search.toLowerCase()));

    // Sort
    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'instability':
          return (b.instability ?? 0) - (a.instability ?? 0);
        case 'resistance':
          return (b.resistance ?? 0) - (a.resistance ?? 0);
        case 'rocks':
          return (b.rocks_containing ?? 0) - (a.rocks_containing ?? 0);
        default:
          return (a.name || '').localeCompare(b.name || '');
      }
    });

    return sorted;
  }, [minerals, search, sortBy]);

  if (isLoading) return <LoadingGrid />;
  if (error) return <ErrorState error={error} />;
  if (!minerals.length) return <EmptyState title="No minerals found" />;

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* ── Header ─────────────────────────────────────────────────────────────────── */}
      <ScifiPanel>
        <div className="p-6 space-y-4 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <Pickaxe className="w-6 h-6 text-amber-400" />
            <div>
              <h1 className="text-3xl font-mono-sc text-cyan-300">Minerals Library</h1>
              <p className="text-sm text-slate-400 mt-1">Complete reference of all mineable elements</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
            <HeaderStat icon={Database} label="Total Minerals" value={`${minerals.length}`} />
            <HeaderStat
              icon={Crosshair}
              label="Average Rarity"
              value={`${formatNumber((minerals.reduce((sum, m) => sum + (m.instability ?? 0), 0) / minerals.length) * 100, 1)}%`}
            />
            <HeaderStat
              icon={TrendingUp}
              label="Environment"
              value={env.env.toUpperCase()}
            />
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="p-4 border-b border-cyan-500/20 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-600" />
            <input
              type="text"
              placeholder="Search minerals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <SortButton label="Name" sortKey="name" current={sortBy} onSort={setSortBy} />
            <SortButton label="Rarity" sortKey="instability" current={sortBy} onSort={setSortBy} />
            <SortButton label="Resistance" sortKey="resistance" current={sortBy} onSort={setSortBy} />
            <SortButton label="Found In" sortKey="rocks" current={sortBy} onSort={setSortBy} />
          </div>
        </div>

        {/* Results */}
        <div className="p-4 space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500">No minerals match your search</div>
          ) : (
            filtered.map((mineral) => <MineralRow key={mineral.uuid} mineral={mineral} />)
          )}
        </div>
      </ScifiPanel>
    </motion.div>
  );
}
