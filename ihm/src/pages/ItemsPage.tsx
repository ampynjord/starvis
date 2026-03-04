import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/services/api';
import { FilterPanel } from '@/components/ui/FilterPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { useDebounce } from '@/hooks/useDebounce';

const LIMIT = 30;

export default function ItemsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const { data: filters } = useQuery({
    queryKey: ['items.filters'],
    queryFn: api.items.filters,
    staleTime: Infinity,
  });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['items.list', { page, search: debouncedSearch, type, manufacturer }],
    queryFn: () => api.items.list({
      page, limit: LIMIT,
      search: debouncedSearch || undefined,
      type: type || undefined,
      manufacturer: manufacturer || undefined,
    }),
  });

  const hasFilters = !!(type || manufacturer || debouncedSearch);
  const resetFilters = () => { setType(''); setManufacturer(''); setSearch(''); setPage(1); };

  const filterGroups = filters ? [
    { key: 'type', label: 'Type',         options: (filters['types'] ?? []).map((t: string) => ({ label: t, value: t })),   value: type,         onChange: (v: string) => { setType(v); setPage(1); } },
    { key: 'mfr',  label: 'Manufacturer', options: (filters['manufacturers'] ?? []).map((m: string) => ({ label: m, value: m })), value: manufacturer, onChange: (v: string) => { setManufacturer(v); setPage(1); } },
  ] : [];

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">FPS Items</h1>
          {data && <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">{data.total.toLocaleString('en-US')} items</p>}
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search an item…" className="sci-input w-full pl-8 text-xs" />
        </div>
      </div>

      <div className="flex gap-4">
        <div className="w-44 flex-shrink-0">
          {filterGroups.length > 0
            ? <FilterPanel hasFilters={hasFilters} onReset={resetFilters} groups={filterGroups} />
            : <div className="sci-panel p-3 text-xs text-slate-600 animate-pulse">Loading…</div>}
        </div>

        <div className="flex-1 min-w-0">
          {isLoading ? <LoadingGrid message="LOADING…" />
          : error ? <ErrorState error={error as Error} onRetry={() => void refetch()} />
          : data?.data.length === 0 ? <EmptyState icon="🛡" title="No items found" />
          : (
            <>
              <div className="space-y-1.5">
                {data?.data.map((item, i) => (
                  <motion.div key={item.uuid} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                    <div className="sci-panel hover:border-cyan-800 transition-colors px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-orbitron text-sm text-slate-200 truncate">{item.name}</span>
                            {item.grade && <GlowBadge color="amber">{item.grade}</GlowBadge>}
                            {item.size != null && <GlowBadge color="slate">S{item.size}</GlowBadge>}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs font-mono-sc text-cyan-700">{item.type}</span>
                            {item.sub_type && <span className="text-xs text-slate-600">{item.sub_type}</span>}
                            {item.manufacturer_name && <span className="text-xs text-slate-600">{item.manufacturer_name}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              {data && <Pagination className="mt-6" page={data.page} totalPages={data.pages} onPageChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
