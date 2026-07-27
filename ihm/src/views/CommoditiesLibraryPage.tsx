'use client';

/**
 * CommoditiesLibraryPage - merged commodities & minerals library.
 * Combines trade goods (paginated list with filters) and the full minerals
 * reference (sortable table with detail drawer), using the Minerals Library style.
 */
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Crosshair,
  FlaskConical,
  Link as LinkIcon,
  Package,
  Pickaxe,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { ListFilterBar, ListFilterResetButton, ListFilterSelect } from '@/components/ui/ListFilters';
import { useEntityList } from '@/hooks/useEntityList';
import { MineralsTable } from '@/components/mining/MineralsTable';
import type { Commodity } from '@/types/api';

// ── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'trade' | 'minerals';

// ── Trade Goods (from CommoditiesPage) ───────────────────────────────────────

const TRADE_LIMIT = 30;

function TradeGoodsTab() {
  const { env } = useEnv();
  const [activeCategory, setActiveCategory] = useState('All');

  const { data: categories } = useQuery({
    queryKey: ['commodities.categories', env],
    queryFn: () => api.commodities.categories(env),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data, isLoading, error, refetch, search, updateSearch, goToPage } = useEntityList<Commodity>({
    key: 'commodities.list',
    filters: { env, category: activeCategory },
    limit: TRADE_LIMIT,
    fetcher: ({ page, limit, search }) =>
      api.commodities.list({
        env,
        page,
        limit,
        search,
        category: activeCategory === 'All' ? undefined : activeCategory,
      }),
  });

  return (
    <div className="min-w-0">
      <ListFilterBar>
        <ListFilterSelect
          value={activeCategory === 'All' ? '' : activeCategory}
          onChange={(value) => { setActiveCategory(value || 'All'); }}
          options={(categories ?? []).map((c) => ({ label: c.count ? `${c.label} (${c.count})` : c.label, value: c.label }))}
          allLabel="All categories"
        />
        {activeCategory !== 'All' && (
          <ListFilterResetButton onClick={() => { setActiveCategory('All'); }} />
        )}
      </ListFilterBar>

        <div className="sci-panel p-3 mb-4 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400 font-mono-sc">Raw ores, refined materials, fuel/gas and trade goods. Use Mining Calculator for yield and profit tools.</p>
          <Link href="/mining-calculator" className="text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap">Open Mining Calculator</Link>
        </div>

        <div className="mb-4 relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search commodities…"
            className="sci-input pl-6 pr-7 py-1.5 text-xs w-full sm:w-64"
          />
          {search && (
            <button type="button" onClick={() => updateSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
              <X size={11} />
            </button>
          )}
        </div>

        {isLoading ? <LoadingGrid message="LOADING…" />
          : error ? <ErrorState error={error as Error} onRetry={() => void refetch()} />
          : !data?.data?.length ? <EmptyState icon="📦" title="No commodities found" />
          : (
            <>
              <div className="space-y-1.5">
                {(data.data ?? []).map((c, i) => (
                  <motion.div key={c.uuid} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                    <div className="sci-panel px-4 py-3 hover:border-cyan-800 transition-colors">
                      <div className="flex items-center gap-3">
                        <Link href={`/commodities/${c.uuid}`} className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-orbitron text-sm text-slate-200">{c.name}</span>
                            {c.type && <GlowBadge color="slate">{c.type}</GlowBadge>}
                            {c.sub_type && <GlowBadge color="slate" size="xs">{c.sub_type}</GlowBadge>}
                          </div>
                          {c.symbol && <p className="text-xs font-mono-sc text-slate-600 mt-0.5">{c.symbol}</p>}
                        </Link>
                        <div className="text-right shrink-0 space-y-1">
                          {c.occupancy_scu != null && <p className="text-xs font-mono-sc text-slate-600">{c.occupancy_scu} μSCU</p>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              {data && <Pagination className="mt-6" page={data.page} totalPages={data.pages} onPageChange={goToPage} />}
            </>
          )}
    </div>
  );
}

// ── Minerals Library (from MineralsLibraryPage) ───────────────────────────────

function MineralsTab() {
  return (
    <MineralsTable
      header={({ priceable }) => (
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="sci-panel px-3 py-1.5 text-[10px] font-mono-sc text-slate-500 flex items-center gap-1.5">
            <FlaskConical size={10} /> {priceable} with known price
          </div>
          <div className="sci-panel px-3 py-1.5 text-[10px] font-mono-sc text-slate-500 flex items-center gap-1.5">
            <Crosshair size={10} /> Click a row to inspect
          </div>
          <Link
            href="/mining-calculator"
            className="sci-panel px-3 py-1.5 text-[10px] font-mono-sc text-cyan-500 hover:text-cyan-300 flex items-center gap-1.5 transition-colors border-cyan-900/40 hover:border-cyan-700"
          >
            <LinkIcon size={10} /> Open Mining Calculator
          </Link>
        </div>
      )}
    />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CommoditiesLibraryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('trade');

  const TABS: { id: Tab; label: string; icon: React.ReactNode; subtitle: string }[] = [
    { id: 'trade', label: 'Trade Goods', icon: <Package size={14} />, subtitle: 'Commodities, ores and trade items' },
    { id: 'minerals', label: 'Minerals Library', icon: <Pickaxe size={14} />, subtitle: 'Mining elements — properties, prices, rock data' },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Commodities"
        subtitle="Trade goods catalogue and complete minerals reference"
      />

      <div className="mb-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max pb-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-mono-sc transition-all whitespace-nowrap border ${
                activeTab === tab.id
                  ? 'border-cyan-500/70 bg-cyan-950/30 text-cyan-300'
                  : 'border-slate-700/40 text-slate-500 hover:border-slate-600/60 hover:text-slate-300'
              }`}
            >
              <span className={activeTab === tab.id ? 'text-cyan-400' : 'text-slate-600'}>
                {tab.icon}
              </span>
              <span className="font-semibold">{tab.label}</span>
            </button>
          ))}
        </div>
        {TABS.find((t) => t.id === activeTab) && (
          <div className="mt-1.5 text-[10px] text-slate-600 font-mono-sc uppercase tracking-widest pl-0.5">
            {TABS.find((t) => t.id === activeTab)!.subtitle}
          </div>
        )}
      </div>

      {activeTab === 'trade' && <TradeGoodsTab />}
      {activeTab === 'minerals' && <MineralsTab />}
    </PageShell>
  );
}
