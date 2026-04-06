import { useQuery } from '@tanstack/react-query';
import { MapPin, Search, ShoppingBag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { CanonicalMeta } from '@/components/ui/CanonicalMeta';
import { useListQueryState } from '@/hooks/useListQueryState';
import type { Shop } from '@/types/api';

const LIMIT = 60;

export default function ShopsPage() {
  const { env } = useEnv();
  const { page, search, debouncedSearch, updateSearch, updatePageWithScroll, setPage } = useListQueryState();
  const [activeType, setActiveType] = useState('');

  // Fetch current page with server-side search + type filter
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['shops.list', env, { page, search: debouncedSearch, type: activeType }],
    queryFn: () => api.shops.list({ env, page, limit: LIMIT, search: debouncedSearch || undefined, type: activeType || undefined }),
  });

  // Fetch all types once (fetch all with high limit, extract unique types)
  const { data: allForTypes } = useQuery({
    queryKey: ['shops.allForTypes', env],
    queryFn: () => api.shops.list({ env, limit: 200 }),
    staleTime: Infinity,
  });

  const shopTypes = useMemo(() => {
    if (!allForTypes?.data) return [];
    const types = new Set<string>();
    for (const s of allForTypes.data) {
      if (s.shop_type) types.add(s.shop_type);
    }
    return Array.from(types).sort();
  }, [allForTypes]);

  const shopList = data?.data ?? [];

  // Group by system only when no search/type filter active
  const isFiltered = !!(debouncedSearch || activeType);

  const bySystem = useMemo(() => {
    if (isFiltered) return null;
    return shopList.reduce<Record<string, Shop[]>>((acc, shop) => {
      const key = shop.system ?? 'Unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(shop);
      return acc;
    }, {});
  }, [shopList, isFiltered]);

  const switchType = (t: string) => {
    setActiveType(t);
    setPage(1);
  };

  return (
    <div className="max-w-(--breakpoint-xl) mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Shops</h1>
          {data && (
            <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">
              {data.total.toLocaleString('en-US')} shops
            </p>
          )}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input
            type="text"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search shops or locations…"
            className="sci-input w-full pl-8 text-xs"
          />
        </div>
      </div>

      {/* Shop type chips */}
      {shopTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => switchType('')}
            className={`px-3 py-1 text-xs font-mono-sc rounded-sm border transition-colors ${
              activeType === ''
                ? 'border-cyan-700 bg-cyan-950/40 text-cyan-400'
                : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
            }`}
          >
            All
          </button>
          {shopTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchType(t)}
              className={`px-3 py-1 text-xs font-mono-sc rounded-sm border transition-colors ${
                activeType === t
                  ? 'border-cyan-700 bg-cyan-950/40 text-cyan-400'
                  : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingGrid message="LOADING SHOPS…" />
      ) : error ? (
        <ErrorState error={error as Error} onRetry={() => void refetch()} />
      ) : !shopList.length ? (
        <EmptyState icon="🛒" title="No shops found" />
      ) : isFiltered ? (
        /* Flat list when filtering */
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {shopList.map((shop) => <ShopCard key={shop.id} shop={shop} />)}
          </div>
          {data && data.pages > 1 && (
            <Pagination className="mt-4" page={data.page} totalPages={data.pages} onPageChange={updatePageWithScroll} />
          )}
        </>
      ) : (
        /* Grouped by system when not filtering */
        <>
          {Object.entries(bySystem ?? {}).sort((a, b) => a[0].localeCompare(b[0])).map(([system, shops]) => (
            <ScifiPanel
              key={system}
              title={system}
              subtitle={`${shops.length} shop${shops.length !== 1 ? 's' : ''}`}
              actions={<MapPin size={14} className="text-slate-600" />}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {shops.map((shop) => <ShopCard key={shop.id} shop={shop} />)}
              </div>
            </ScifiPanel>
          ))}
          {data && data.pages > 1 && (
            <Pagination className="mt-4" page={data.page} totalPages={data.pages} onPageChange={updatePageWithScroll} />
          )}
        </>
      )}
    </div>
  );
}

function ShopCard({ shop }: { shop: Shop }) {
  return (
    <div className="sci-panel px-3 py-2.5">
      <div className="flex items-start gap-2">
        <ShoppingBag size={13} className="text-cyan-700 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-slate-300 font-rajdhani font-semibold truncate">{shop.name}</p>
          <p className="text-xs text-slate-600 truncate">
            {shop.location ?? [shop.city, shop.system].filter(Boolean).join(' · ') ?? '—'}
          </p>
          {shop.shop_type && (
            <div className="mt-1">
              <GlowBadge color="slate">{shop.display_shop_type ?? shop.shop_type}</GlowBadge>
            </div>
          )}
          <CanonicalMeta
            compact
            className="mt-1"
            sourceType={shop.source_type}
            sourceName={shop.source_name}
            confidenceScore={shop.confidence_score}
          />
        </div>
      </div>
    </div>
  );
}
