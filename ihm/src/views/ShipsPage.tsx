'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { PageTabs } from '@/components/ui/PageTabs';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ShipCard } from '@/components/ship/ShipCard';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useListQueryState } from '@/hooks/useListQueryState';
import { ListFilterBar, ListFilterResetButton, ListFilterSelect } from '@/components/ui/ListFilters';

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

const STATUS_LABELS: Record<string, string> = {
  'flight-ready': 'Flight Ready',
  'in-production': 'In Production',
  'in-development': 'In Development',
  'in-concept': 'In Concept',
  'in-game-only': 'In Game Only',
};

function formatStatusLabel(value: string): string {
  return STATUS_LABELS[value] ?? value.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

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
  const [status, setStatus] = useState('');
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
    queryKey: ['ships.list', env, { page, search: debouncedSearch, manufacturer, status, role, career, variantType, category, sort, order }],
    queryFn: () => api.ships.list({
      env,
      page,
      limit: LIMIT,
      search: debouncedSearch || undefined,
      manufacturer: manufacturer || undefined,
      status: status || undefined,
      role: role || undefined,
      career: career || undefined,
      variant_type: variantType || undefined,
      vehicle_category: category,
      sort,
      order,
    }),
  });

  const hasFilters = !!(manufacturer || status || role || career || variantType || debouncedSearch);

  const switchCategory = (val: string) => {
    setCategory(val);
    setManufacturer('');
    setStatus('');
    setRole('');
    setCareer('');
    setVariantType('');
    const validSorts = SORT_OPTIONS.filter(o => o.categories.includes(val));
    if (!validSorts.find(o => o.value === sort)) setSort('name');
    resetListState();
  };

  const resetFilters = () => {
    setManufacturer('');
    setStatus('');
    setRole('');
    setCareer('');
    setVariantType('');
    resetListState();
  };

  const toggleOrder = () => setOrder(o => o === 'asc' ? 'desc' : 'asc');

  const categoryCount = (val: string) =>
    filters?.vehicle_categories?.find(c => c.value === val)?.count ?? null;

  const availableSorts = SORT_OPTIONS.filter(o => o.categories.includes(category));

  const categoryLabel = CATEGORIES.find(c => c.value === category)?.label ?? 'Ships';

  return (
    <PageShell>
      <PageHeader
        title={categoryLabel}
        count={data?.total}
        countLabel="results"
        search={search}
        searchPlaceholder="Search…"
        onSearch={updateSearch}
      />

      {/* Tabs */}
      <PageTabs
        className="mb-4"
        items={CATEGORIES.map((cat) => ({ ...cat, count: categoryCount(cat.value) }))}
        value={category}
        onChange={switchCategory}
      />

      <ListFilterBar>
        {filters && (filters.manufacturers ?? []).length > 0 && (
          <ListFilterSelect
            value={manufacturer}
            onChange={(value) => { setManufacturer(value); setPage(1); }}
            allLabel="All manufacturers"
            options={(filters.manufacturers ?? []).map((m) => ({ label: m.name, value: m.code }))}
          />
        )}
        {category === 'ship' && filters && (filters.statuses ?? []).length > 0 && (
          <ListFilterSelect
            value={status}
            onChange={(value) => { setStatus(value); setPage(1); }}
            allLabel="All statuses"
            options={(filters.statuses ?? []).map((s) => ({ label: formatStatusLabel(s.value), value: s.value, count: s.count }))}
          />
        )}
        {category === 'ship' && filters && filters.careers.length > 0 && (
          <ListFilterSelect
            value={career}
            onChange={(value) => { setCareer(value); setPage(1); }}
            allLabel="All careers"
            options={filters.careers.map((c) => ({ label: c, value: c }))}
          />
        )}
        {category === 'ship' && filters && filters.roles.length > 0 && (
          <ListFilterSelect
            value={role}
            onChange={(value) => { setRole(value); setPage(1); }}
            allLabel="All roles"
            options={filters.roles.map((r) => ({ label: r, value: r }))}
          />
        )}
        {filters && filters.variant_types.length > 0 && (
          <ListFilterSelect
            value={variantType}
            onChange={(value) => { setVariantType(value); setPage(1); }}
            allLabel="All types"
            options={filters.variant_types.map((vt) => ({ label: vt, value: vt }))}
          />
        )}
        <ListFilterSelect
          value={sort}
          onChange={(value) => { setSort(value); setPage(1); }}
          allLabel="Sort"
          options={availableSorts.map((o) => ({ value: o.value, label: `Sort: ${o.label}` }))}
          showAllOption={false}
        />
        <button
          onClick={toggleOrder}
          title={order === 'asc' ? 'Ascending — click to reverse' : 'Descending — click to reverse'}
          className="sci-panel px-2 py-1.5 text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <ArrowUpDown size={13} className={order === 'desc' ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
        {hasFilters && (
          <ListFilterResetButton onClick={resetFilters} />
        )}
      </ListFilterBar>

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
    </PageShell>
  );
}
