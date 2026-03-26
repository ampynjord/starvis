/**
 * EquipmentPage — Unified Equipment Browser
 *
 * Display all equipment (items + components) with unified browsing:
 * - Tabs for Components vs Items
 * - Filter, search, sort across categories
 * - Quick stats and buy locations
 */
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wrench,
  Search,
  Filter,
  ChevronDown,
  Package,
  Hammer,
  Zap,
  Crosshair,
  type LucideIcon,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { ScifiPanel } from '@/components/ui/ScifiPanel';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'components' | 'items';

interface EquipmentItem {
  uuid: string;
  name: string;
  type: string;
  sub_type?: string | null;
  manufacturer_name?: string | null;
  size?: number | null;
  mass?: number | null;
  hp?: number | null;
  class_name?: string | null;
}

// ── Category Breakdown ────────────────────────────────────────────────────────

function getCategoryIcon(type: string): LucideIcon {
  if (type.includes('Weapon') || type.includes('Gun')) return Hammer;
  if (type.includes('Shield')) return Zap;
  if (type.includes('Engine') || type.includes('Drive')) return Crosshair;
  if (type.includes('Power')) return Package;
  return Wrench;
}

// ── HeaderStat ────────────────────────────────────────────────────────────────

interface HeaderStatProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}

function HeaderStat({ icon: Icon, label, value }: HeaderStatProps) {
  return (
    <div className="sci-panel p-3 flex items-start gap-2">
      <Icon className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-mono-sc text-cyan-300 truncate">{value}</p>
      </div>
    </div>
  );
}

// ── EquipmentCard ─────────────────────────────────────────────────────────────

interface EquipmentCardProps {
  item: EquipmentItem;
  href: string;
}

function EquipmentCard({ item, href }: EquipmentCardProps) {
  const Icon = getCategoryIcon(item.type);

  return (
    <Link href={href}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02, y: -2 }}
        className="sci-panel p-4 border-l-2 border-cyan-500/30 hover:border-cyan-500/60 transition-all h-full cursor-pointer flex flex-col"
      >
        <div className="flex items-start justify-between mb-3">
          <Icon className="w-5 h-5 text-cyan-400" />
          {item.size && (
            <GlowBadge size="xs">{`Size ${item.size}`}</GlowBadge>
          )}
        </div>

        <h3 className="font-mono-sc text-sm text-cyan-300 mb-2 line-clamp-2">{item.name}</h3>

        <div className="space-y-1 flex-1 text-xs text-slate-400 mb-3">
          {item.type && <p>Type: <span className="text-slate-300">{item.type}</span></p>}
          {item.manufacturer_name && <p>Mfr: <span className="text-slate-300">{item.manufacturer_name}</span></p>}
        </div>

        {item.mass && (
          <div className="pt-2 border-t border-slate-700/50 text-xs text-slate-500">
            Mass: <span className="text-cyan-400 font-mono-sc">{item.mass} kg</span>
          </div>
        )}
      </motion.div>
    </Link>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function EquipmentPage() {
  const env = useEnv();
  const [tab, setTab] = useState<Tab>('components');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Fetch Components
  const { data: componentRes, isLoading: componentsLoading } = useQuery({
    queryKey: ['components-all', env.env],
    queryFn: async () => {
      return await api.components.list({
        env: env.env,
        limit: 1000,
      });
    },
  });
  const components = componentRes?.data || [];

  // Fetch Items
  const { data: itemsRes, isLoading: itemsLoading } = useQuery({
    queryKey: ['items-all', env.env],
    queryFn: async () => {
      return await api.items.list({
        env: env.env,
        limit: 1000,
      });
    },
  });
  const items = itemsRes?.data || [];

  // Get unique types for current tab
  const uniqueTypes = useMemo(() => {
    const data = tab === 'components' ? components : items;
    return [...new Set(data.map((item) => item.type))].sort();
  }, [tab, components, items]);

  // Filter and search
  const filtered = useMemo(() => {
    const data = tab === 'components' ? (components as EquipmentItem[]) : (items as EquipmentItem[]);

    return data
      .filter((item) => !search || item.name?.toLowerCase().includes(search.toLowerCase()))
      .filter((item) => !typeFilter || item.type === typeFilter)
      .slice(0, 100); // Limit display for performance
  }, [tab, components, items, search, typeFilter]);

  const isLoading = tab === 'components' ? componentsLoading : itemsLoading;
  const total = tab === 'components' ? (componentRes?.total || 0) : (itemsRes?.total || 0);

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* ── Header ─────────────────────────────────────────────────────────────────── */}
      <ScifiPanel>
        <div className="p-6 space-y-4 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <Wrench className="w-6 h-6 text-cyan-400" />
            <div>
              <h1 className="text-3xl font-mono-sc text-cyan-300">Equipment Browser</h1>
              <p className="text-sm text-slate-400 mt-1">All ship components & FPS items</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
            <HeaderStat
              icon={Wrench}
              label="Total Components"
              value={`${components.length}`}
            />
            <HeaderStat
              icon={Package}
              label="Total Items"
              value={`${items.length}`}
            />
            <HeaderStat
              icon={Crosshair}
              label="Environment"
              value={env.env.toUpperCase()}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="p-4 border-b border-cyan-500/20 flex gap-2">
          {(['components', 'items'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setTypeFilter('');
              }}
              className={`px-4 py-2 text-sm font-mono-sc transition-all ${
                tab === t
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-600/50'
              }`}
            >
              {t === 'components' ? (
                <>
                  <Wrench className="inline w-4 h-4 mr-1" />
                  Components ({components.length})
                </>
              ) : (
                <>
                  <Package className="inline w-4 h-4 mr-1" />
                  Items ({items.length})
                </>
              )}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="p-4 border-b border-cyan-500/20 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-600" />
            <input
              type="text"
              placeholder={`Search ${tab}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {uniqueTypes.length > 0 && (
            <div className="relative">
              <Filter className="absolute left-3 top-2.5 w-4 h-4 text-slate-600" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:border-cyan-500 appearance-none cursor-pointer"
              >
                <option value="">All Types ({uniqueTypes.length})</option>
                {uniqueTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-600 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Results */}
        <div className="p-4">
          {isLoading ? (
            <LoadingGrid />
          ) : filtered.length === 0 ? (
            <EmptyState title={`No ${tab} found`} />
          ) : (
            <>
              <div className="text-xs text-slate-500 mb-4">
                Showing {filtered.length} of {total} {tab}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <AnimatePresence>
                  {filtered.map((item) => (
                    <EquipmentCard
                      key={item.uuid}
                      item={item}
                      href={tab === 'components' ? `/components/${item.uuid}` : `/items/${item.uuid}`}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </ScifiPanel>
    </motion.div>
  );
}
