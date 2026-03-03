import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import { FilterPanel } from '@/components/ui/FilterPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { useDebounce } from '@/hooks/useDebounce';
import { COMPONENT_TYPE_COLORS } from '@/utils/constants';
import { motion } from 'framer-motion';

const LIMIT = 30;

export default function ComponentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [size, setSize] = useState('');
  const [grade, setGrade] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const { data: filters } = useQuery({
    queryKey: ['components.filters'],
    queryFn: api.components.filters,
    staleTime: Infinity,
  });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['components.list', { page, search: debouncedSearch, type, size, grade, manufacturer }],
    queryFn: () => api.components.list({
      page, limit: LIMIT,
      search: debouncedSearch || undefined,
      type: type || undefined,
      size: size ? Number(size) : undefined,
      grade: grade || undefined,
      manufacturer: manufacturer || undefined,
    }),
  });

  const hasFilters = !!(type || size || grade || manufacturer || debouncedSearch);
  const resetFilters = () => { setType(''); setSize(''); setGrade(''); setManufacturer(''); setSearch(''); setPage(1); };

  const filterGroups = filters ? [
    { key: 'type', label: 'Type',      options: (filters['types'] ?? []).map((t: string) => ({ label: t, value: t })),     value: type,         onChange: (v: string) => { setType(v); setPage(1); } },
    { key: 'size', label: 'Taille',    options: (filters['sizes'] ?? []).map((s: string) => ({ label: `S${s}`, value: s })), value: size,         onChange: (v: string) => { setSize(v); setPage(1); } },
    { key: 'grade', label: 'Grade',    options: (filters['grades'] ?? []).map((g: string) => ({ label: g, value: g })),     value: grade,        onChange: (v: string) => { setGrade(v); setPage(1); } },
    { key: 'mfr', label: 'Fabricant',  options: (filters['manufacturers'] ?? []).map((m: string) => ({ label: m, value: m })), value: manufacturer, onChange: (v: string) => { setManufacturer(v); setPage(1); } },
  ] : [];

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Composants</h1>
          {data && <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">{data.pagination.total.toLocaleString('fr-FR')} composants</p>}
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Rechercher un composant…" className="sci-input w-full pl-8 text-xs" />
        </div>
      </div>

      <div className="flex gap-4">
        <div className="w-44 flex-shrink-0">
          {filterGroups.length > 0 ? (
            <FilterPanel hasFilters={hasFilters} onReset={resetFilters} groups={filterGroups} />
          ) : (
            <div className="sci-panel p-3 text-xs text-slate-600 animate-pulse">Chargement…</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {isLoading ? <LoadingGrid message="CHARGEMENT…" />
          : error ? <ErrorState error={error as Error} onRetry={() => void refetch()} />
          : data?.data.length === 0 ? <EmptyState icon="⚙" title="Aucun composant" />
          : (
            <>
              <div className="space-y-1.5">
                {data?.data.map((comp, i) => (
                  <motion.div key={comp.uuid} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                    <Link to={`/components/${comp.uuid}`} className="block sci-panel hover:border-cyan-800 transition-colors px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-orbitron text-sm text-slate-200 truncate">{comp.name}</span>
                            {comp.grade && <GlowBadge color="amber">{comp.grade}</GlowBadge>}
                            {comp.size != null && <GlowBadge color="slate">S{comp.size}</GlowBadge>}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`text-xs font-mono-sc ${COMPONENT_TYPE_COLORS[comp.type] ?? 'text-slate-500'}`}>{comp.type}</span>
                            {comp.sub_type && <span className="text-xs text-slate-600">{comp.sub_type}</span>}
                            {comp.manufacturer_name && <span className="text-xs text-slate-600">{comp.manufacturer_name}</span>}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
              {data && <Pagination className="mt-6" page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
