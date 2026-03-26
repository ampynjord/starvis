import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
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

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">{title}</h1>
          {data && <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">{data.total.toLocaleString('en-US')} goods indexed</p>}
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input type="text" value={search} onChange={e => updateSearch(e.target.value)} placeholder="Search…" className="sci-input w-full pl-8 text-xs" />
        </div>
      </div>

      {isIndustrial && (
        <div className="sci-panel p-3 mb-4 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400 font-mono-sc">Raw ores, refined materials, fuel/gas and mission goods. Use Mining for Regolith-style composition tools.</p>
          <Link href="/mining" className="text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap">Open Mining</Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => { setActiveCategory(chip.label); setPage(1); }}
            className={[
              'px-3 py-1 rounded text-xs font-rajdhani font-semibold tracking-wider transition-all border',
              activeCategory === chip.label
                ? 'bg-cyan-950/60 border-cyan-700 text-cyan-400'
                : 'border-border text-slate-500 hover:text-slate-300 hover:border-slate-600',
            ].join(' ')}
          >
            {chip.label}
          </button>
        ))}
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
                      <div className="text-right flex-shrink-0 space-y-1">
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
  );
}
