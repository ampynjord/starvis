'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListFilterBar, ListFilterResetButton, ListFilterSelect } from '@/components/ui/ListFilters';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { useListQueryState } from '@/hooks/useListQueryState';

const LIMIT = 30;

export default function CommoditiesPage() {
  const pathname = usePathname();
  const { env } = useEnv();
  const { page, search, debouncedSearch, updateSearch, updatePageWithScroll, setPage } = useListQueryState();
  const [activeCategory, setActiveCategory] = useState('All');

  const { data: categories } = useQuery({
    queryKey: ['commodities.categories', env],
    queryFn: () => api.commodities.categories(env),
    staleTime: Infinity,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['commodities.list', env, { page, search: debouncedSearch, category: activeCategory }],
    queryFn: () => api.commodities.list({
      env,
      page,
      limit: LIMIT,
      search: debouncedSearch || undefined,
      category: activeCategory === 'All' ? undefined : activeCategory,
    }),
  });

  const isIndustrial = pathname?.startsWith('/industrial');
  const title = isIndustrial ? 'Industrial' : 'Trade Goods';

  return (
    <PageShell>
      <PageHeader
        title={title}
        count={data?.total}
        countLabel="goods"
        search={search}
        searchPlaceholder="Search…"
        onSearch={updateSearch}
      />

      {isIndustrial && (
        <div className="sci-panel p-3 mb-4 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400 font-mono-sc">Raw ores, refined materials, fuel/gas and mission goods. Use Mining for Regolith-style composition tools.</p>
          <Link href="/mining" className="text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap">Open Mining</Link>
        </div>
      )}

      <ListFilterBar>
        {(categories ?? []).length > 0 && (
          <ListFilterSelect
            value={activeCategory === 'All' ? '' : activeCategory}
            onChange={(value) => { setActiveCategory(value || 'All'); setPage(1); }}
            allLabel="All categories"
            options={(categories ?? []).map((c) => ({ value: c.label, label: c.label, count: c.count }))}
          />
        )}
        {activeCategory !== 'All' && (
          <ListFilterResetButton onClick={() => { setActiveCategory('All'); setPage(1); }} />
        )}
      </ListFilterBar>

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
                        <Link href={`/missions?search=${encodeURIComponent(c.name)}`} className="text-[10px] text-amber-500 hover:text-amber-300">Mission leads</Link>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            {data && <Pagination className="mt-6" page={data.page} totalPages={data.pages} onPageChange={updatePageWithScroll} />}
          </>
        )}
    </PageShell>
  );
}
