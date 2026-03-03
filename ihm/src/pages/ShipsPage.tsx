import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/services/api';
import { ShipCard } from '@/components/ship/ShipCard';
import { FilterPanel } from '@/components/ui/FilterPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useDebounce } from '@/hooks/useDebounce';

const LIMIT = 24;

export default function ShipsPage() {
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [role, setRole]     = useState('');
  const [career, setCareer] = useState('');
  const [size, setSize]     = useState('');
  const [variantType, setVariantType] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const { data: filters } = useQuery({
    queryKey: ['ships.filters'],
    queryFn: api.ships.filters,
    staleTime: Infinity,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ships.list', { page, search: debouncedSearch, manufacturer, role, career, size, variantType }],
    queryFn: () => api.ships.list({
      page, limit: LIMIT,
      search: debouncedSearch || undefined,
      manufacturer: manufacturer || undefined,
      role: role || undefined,
      career: career || undefined,
      size: size ? Number(size) : undefined,
      variant_type: variantType || undefined,
    }),
  });

  const hasFilters = !!(manufacturer || role || career || size || variantType || debouncedSearch);

  const resetFilters = () => {
    setManufacturer(''); setRole(''); setCareer('');
    setSize(''); setVariantType(''); setSearch(''); setPage(1);
  };

  return (
    <div className="max-w-screen-2xl mx-auto">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
            Ships
          </h1>
          {data && (
            <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">
              {data.total.toLocaleString('en-US')} ships
            </p>
          )}
        </div>
        {/* Search */}
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search a ship…"
            className="sci-input w-full pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex gap-4">
        {/* Filters */}
        <div className="w-44 flex-shrink-0">
          {filters ? (
            <FilterPanel
              hasFilters={hasFilters}
              onReset={resetFilters}
              groups={[
                {
                  key: 'manufacturer', label: 'Manufacturer',
                  options: filters.manufacturers.map(m => ({ label: m.name, value: m.code })),
                  value: manufacturer,
                  onChange: v => { setManufacturer(v); setPage(1); },
                },
                {
                  key: 'career', label: 'Career',
                  options: filters.careers.map(c => ({ label: c, value: c })),
                  value: career,
                  onChange: v => { setCareer(v); setPage(1); },
                },
                {
                  key: 'role', label: 'Role',
                  options: filters.roles.map(r => ({ label: r, value: r })),
                  value: role,
                  onChange: v => { setRole(v); setPage(1); },
                },
                {
                  key: 'size', label: 'Size',
                  options: filters.sizes.map(s => ({ label: `Size ${s}`, value: s })),
                  value: size,
                  onChange: v => { setSize(v); setPage(1); },
                },
                {
                  key: 'variant_type', label: 'Type',
                  options: filters.variant_types.map(vt => ({ label: vt, value: vt })),
                  value: variantType,
                  onChange: v => { setVariantType(v); setPage(1); },
                },
              ]}
            />
          ) : (
            <div className="sci-panel p-3 text-xs text-slate-600 animate-pulse">Loading…</div>
          )}
        </div>

        {/* Grid */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <LoadingGrid rows={3} cols={4} message="LOADING SHIPS…" />
          ) : error ? (
            <ErrorState error={error as Error} onRetry={() => void refetch()} />
          ) : data?.data.length === 0 ? (
            <EmptyState icon="🚀" title="No ships found" message="Try adjusting your filters." />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {data?.data.map((ship, i) => (
                  <ShipCard key={ship.uuid} ship={ship} index={i} />
                ))}
              </div>
              {data && (
                <Pagination
                  className="mt-6"
                  page={data.page}
                  totalPages={data.pages}
                  onPageChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
