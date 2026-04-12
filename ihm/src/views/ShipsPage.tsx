'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ShipCard } from '@/components/ship/ShipCard';
import { FilterPanel } from '@/components/ui/FilterPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useListQueryState } from '@/hooks/useListQueryState';

const LIMIT = 24;

const CATEGORIES = [
  { value: 'ship',    label: 'Ships' },
  { value: 'ground',  label: 'Ground Vehicles' },
  { value: 'gravlev', label: 'Grav-Lev' },
] as const;

const SORT_OPTIONS: { value: string; label: string; categories: string[] }[] = [
  { value: 'name',           label: 'Name',       categories: ['ship', 'ground', 'gravlev'] },
  { value: 'scm_speed',      label: 'SCM Speed',  categories: ['ship'] },
  { value: 'max_speed',      label: 'Max Speed',  categories: ['ship', 'ground', 'gravlev'] },
  { value: 'cargo_capacity', label: 'Cargo',      categories: ['ship', 'ground', 'gravlev'] },
  { value: 'crew_size',      label: 'Crew',       categories: ['ship', 'ground', 'gravlev'] },
  { value: 'total_hp',       label: 'Hull HP',    categories: ['ship'] },
];

export default function ShipsPage() {
  const { env } = useEnv();
  const searchParams = useSearchParams();
  const initialCat = CATEGORIES.find(c => c.value === searchParams.get('cat'))?.value ?? 'ship';
  const {
    page,
    search,
    debouncedSearch,
    setPage,
    updateSearch,
    updatePageWithScroll,
    resetListState,
  } = useListQueryState();

  const [category, setCategory] = useState<string>(initialCat);
  const [manufacturer, setManufacturer] = useState('');
  const [role, setRole] = useState('');
  const [career, setCareer] = useState('');
  const [variantType, setVariantType] = useState('');
  const [sort, setSort] = useState('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');

  const { data: filters } = useQuery({
    queryKey: ['ships.filters', env, category],
    queryFn: () => api.ships.filters(env, category),
    staleTime: Infinity,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ships.list', env, { page, search: debouncedSearch, manufacturer, role, career, variantType, category, sort, order }],
    queryFn: () => api.ships.list({
      env,
      page,
      limit: LIMIT,
      search: debouncedSearch || undefined,
      manufacturer: manufacturer || undefined,
      role: role || undefined,
      career: career || undefined,
      variant_type: variantType || undefined,
      vehicle_category: category,
      sort,
      order,
    }),
  });

  const hasFilters = !!(manufacturer || role || career || variantType || debouncedSearch);

  const switchCategory = (val: string) => {
    setCategory(val);
    setManufacturer('');
    setRole('');
    setCareer('');
    setVariantType('');
    const validSorts = SORT_OPTIONS.filter(o => o.categories.includes(val));
    if (!validSorts.find(o => o.value === sort)) setSort('name');
    resetListState();
  };

  const resetFilters = () => {
    setManufacturer('');
    setRole('');
    setCareer('');
    setVariantType('');
    resetListState();
  };

  const toggleOrder = () => setOrder(o => o === 'asc' ? 'desc' : 'asc');

  const categoryCount = (val: string) =>
    filters?.vehicle_categories?.find(c => c.value === val)?.count ?? null;

  const availableSorts = SORT_OPTIONS.filter(o => o.categories.includes(category));

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-800">
        {CATEGORIES.map(cat => {
          const count = categoryCount(cat.value);
          const active = category === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => switchCategory(cat.value)}
              className={`px-4 py-2 text-xs font-mono-sc uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                active
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {cat.label}
              {count !== null && (
                <span className={`ml-2 ${active ? 'text-cyan-600' : 'text-slate-700'}`}>
                  {count.toLocaleString('en-US')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-500 font-mono-sc">
          {data ? `${data.total.toLocaleString('en-US')} results` : <span className="invisible">–</span>}
        </p>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <select
            value={sort}
            onChange={e => { setSort(e.target.value); setPage(1); }}
            className="sci-input text-xs py-1.5"
          >
            {availableSorts.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={toggleOrder}
            title={order === 'asc' ? 'Ascending — click to reverse' : 'Descending — click to reverse'}
            className="sci-panel px-2 py-1.5 text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <ArrowUpDown size={13} className={order === 'desc' ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>

          {/* Search */}
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
            <input
              type="text"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search…"
              className="sci-input w-full pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Filters */}
        <div className="w-44 shrink-0">
          {filters ? (
            <FilterPanel
              hasFilters={hasFilters}
              onReset={resetFilters}
              groups={[
                {
                  key: 'manufacturer', label: 'Manufacturer',
                  options: (filters.manufacturers ?? []).map(m => ({ label: m.name, value: m.code })),
                  value: manufacturer,
                  onChange: v => { setManufacturer(v); setPage(1); },
                },
                ...(category === 'ship' ? [
                  {
                    key: 'career', label: 'Career',
                    options: filters.careers.map(c => ({ label: c, value: c })),
                    value: career,
                    onChange: (v: string) => { setCareer(v); setPage(1); },
                  },
                  {
                    key: 'role', label: 'Role',
                    options: filters.roles.map(r => ({ label: r, value: r })),
                    value: role,
                    onChange: (v: string) => { setRole(v); setPage(1); },
                  },
                ] : []),
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
            <LoadingGrid
              rows={3}
              cols={4}
              message={`LOADING ${CATEGORIES.find(c => c.value === category)?.label.toUpperCase() ?? 'SHIPS'}…`}
            />
          ) : error ? (
            <ErrorState error={error as Error} onRetry={() => void refetch()} />
          ) : data?.data.length === 0 ? (
            <EmptyState icon="🚀" title="Nothing found" message="Try adjusting your filters." />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {data?.data.map((ship, i) => (
                  <ShipCard key={ship.uuid} ship={ship} index={i} />
                ))}
              </div>
              {data && (
                <Pagination
                  className="mt-6"
                  page={data.page}
                  totalPages={data.pages}
                  onPageChange={updatePageWithScroll}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
