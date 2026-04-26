import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FilterPanel } from '@/components/ui/FilterPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { useListQueryState } from '@/hooks/useListQueryState';

const LIMIT = 30;

interface CommodityCategoryDef {
  label: string;
  test: (type: string) => boolean;
}

const COMMODITY_CATEGORY_DEFS: CommodityCategoryDef[] = [
  { label: 'Raw Ore / Minerals', test: (t) => /(raw|ore|mineral|gem)/i.test(t) },
  { label: 'Refined Materials', test: (t) => /(refined|processed|alloy|ingot)/i.test(t) },
  { label: 'Fuel / Gas / Fluids', test: (t) => /(fuel|gas|liquid|hydrogen|quantum)/i.test(t) },
  { label: 'Agriculture / Food', test: (t) => /(agri|agriculture|food|bio|organic)/i.test(t) },
  { label: 'Medical / Contraband', test: (t) => /(medical|drug|narcotic|contraband)/i.test(t) },
];

function buildCommodityCategories(rawTypes: string[]): { label: string; types: string[] }[] {
  const normalized = rawTypes.filter(Boolean);
  const used = new Set<string>();

  const categories = COMMODITY_CATEGORY_DEFS.map((def) => {
    const types = normalized.filter((t) => def.test(t));
    types.forEach((t) => used.add(t));
    return { label: def.label, types };
  }).filter((c) => c.types.length > 0);

  const misc = normalized.filter((t) => !used.has(t));
  if (misc.length > 0) categories.push({ label: 'Other Trade Goods', types: misc });

  return [{ label: 'All', types: [] }, ...categories];
}

export default function CommoditiesPage() {
  const pathname = usePathname();
  const { env } = useEnv();
  const { page, search, debouncedSearch, updateSearch, updatePageWithScroll, setPage } = useListQueryState();
  const [activeCategory, setActiveCategory] = useState('All');

  const { data: types } = useQuery({ queryKey: ['commodities.types', env], queryFn: () => api.commodities.types(env), staleTime: Infinity });

  const categories = useMemo(
    () => buildCommodityCategories(types ?? []),
    [types],
  );

  const selectedCategory = categories.find((c) => c.label === activeCategory) ?? categories[0];
  const chipTypes = selectedCategory?.types ?? [];
  const effectiveType = chipTypes.length === 1 ? chipTypes[0] : undefined;
  const effectiveTypes = chipTypes.length > 1 ? chipTypes.join(',') : undefined;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['commodities.list', env, { page, search: debouncedSearch, type: effectiveType, types: effectiveTypes }],
    queryFn: () => api.commodities.list({
      env,
      page,
      limit: LIMIT,
      search: debouncedSearch || undefined,
      type: effectiveType,
      types: effectiveTypes,
    }),
  });

  const isIndustrial = pathname?.startsWith('/industrial');
  const title = isIndustrial ? 'Industrial' : 'Trade Goods';

  const filterGroups = categories.length > 0 ? [
    {
      key: 'category',
      label: 'Category',
      options: categories.map(c => ({ label: c.label, value: c.label })),
      value: activeCategory,
      onChange: (v: string) => { setActiveCategory(v); setPage(1); },
    },
  ] : [];

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto">
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

      <div className="flex gap-4">
        <div className="w-44 shrink-0">
          {filterGroups.length > 0 ? (
            <FilterPanel
              hasFilters={activeCategory !== 'All'}
              onReset={() => { setActiveCategory('All'); setPage(1); }}
              groups={filterGroups}
            />
          ) : (
            <div className="sci-panel p-3 text-xs text-slate-600 animate-pulse">Loading…</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
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
        </div>
      </div>
    </div>
  );
}
