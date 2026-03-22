import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { FilterPanel } from '@/components/ui/FilterPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { useDebounce } from '@/hooks/useDebounce';

const LIMIT = 30;

export default function CommoditiesPage() {
  const { env } = useEnv();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const { data: types } = useQuery({ queryKey: ['commodities.types', env], queryFn: () => api.commodities.types(env), staleTime: Infinity });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['commodities.list', env, { page, search: debouncedSearch, type }],
    queryFn: () => api.commodities.list({ env, page, limit: LIMIT, search: debouncedSearch || undefined, type: type || undefined }),
  });

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Commodities</h1>
          {data && <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">{data.total.toLocaleString('en-US')} commodities</p>}
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Rechercher…" className="sci-input w-full pl-8 text-xs" />
        </div>
      </div>

      <div className="flex gap-4">
        <div className="w-44 flex-shrink-0">
          <FilterPanel
            hasFilters={!!(type || debouncedSearch)}
            onReset={() => { setType(''); setSearch(''); setPage(1); }}
            groups={[{
              key: 'type', label: 'Type',
              options: (types ?? []).map((t: string) => ({ label: t, value: t })),
              value: type,
              onChange: (v: string) => { setType(v); setPage(1); },
            }]}
          />
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
                    <Link to={`/commodities/${c.uuid}`} className="block sci-panel px-4 py-3 hover:border-cyan-800 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-orbitron text-sm text-slate-200">{c.name}</span>
                            {c.type && <GlowBadge color="slate">{c.type}</GlowBadge>}
                            {c.sub_type && <GlowBadge color="slate" size="xs">{c.sub_type}</GlowBadge>}
                          </div>
                          {c.symbol && <p className="text-xs font-mono-sc text-slate-600 mt-0.5">{c.symbol}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {c.occupancy_scu != null && <p className="text-xs font-mono-sc text-slate-600">{c.occupancy_scu} μSCU</p>}
                        </div>
                      </div>
                    </Link>
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
