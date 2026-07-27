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
import { useEntityList } from '@/hooks/useEntityList';
import { ListFilterBar, ListFilterResetButton, ListFilterSelect } from '@/components/ui/ListFilters';
import {
  DEFAULT_SHIP_ORDER,
  DEFAULT_SHIP_SORT,
  resolveShipCategory,
  SHIP_CATEGORIES,
  SHIPS_LIST_LIMIT,
} from '@/lib/ships-list';
import type { PaginatedResponse, ShipListItem } from '@/types/api';

const LIMIT = SHIPS_LIST_LIMIT;
const CATEGORIES = SHIP_CATEGORIES;

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

/**
 * `initialList` est la première page déjà chargée par la page serveur. Elle n'est
 * réutilisée que si l'état courant correspond exactement à ce qu'elle contient —
 * sinon react-query refait la requête normalement.
 */
export default function ShipsPage({ initialList }: { initialList?: PaginatedResponse<ShipListItem> | null } = {}) {
  const { env } = useEnv();
  const searchParams = useSearchParams();
  const initialCat = resolveShipCategory(searchParams.get('cat'));

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

  const listFilters = { env, manufacturer, status, role, career, variantType, category, sort, order };

  // La page serveur ne charge que la première page LIVE, sans filtre ni
  // recherche, pour la catégorie demandée et le tri par défaut.
  const matchesServerQuery =
    env === 'live' &&
    !manufacturer &&
    !status &&
    !role &&
    !career &&
    !variantType &&
    category === initialCat &&
    sort === DEFAULT_SHIP_SORT &&
    order === DEFAULT_SHIP_ORDER;

  const {
    data,
    isLoading,
    error,
    refetch,
    search,
    updateSearch,
    goToPage,
    resetListState,
  } = useEntityList<ShipListItem>({
    key: 'ships.list',
    filters: listFilters,
    limit: LIMIT,
    initialData: initialList,
    initialDataMatches: matchesServerQuery,
    fetcher: ({ page, limit, search }) =>
      api.ships.list({
        env,
        page,
        limit,
        search,
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

  const hasFilters = !!(manufacturer || status || role || career || variantType || search);

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
            onChange={(value) => { setManufacturer(value); }}
            allLabel="All manufacturers"
            options={(filters.manufacturers ?? []).map((m) => ({ label: m.name, value: m.code }))}
          />
        )}
        {category === 'ship' && filters && (filters.statuses ?? []).length > 0 && (
          <ListFilterSelect
            value={status}
            onChange={(value) => { setStatus(value); }}
            allLabel="All statuses"
            options={(filters.statuses ?? []).map((s) => ({ label: formatStatusLabel(s.value), value: s.value, count: s.count }))}
          />
        )}
        {category === 'ship' && filters && filters.careers.length > 0 && (
          <ListFilterSelect
            value={career}
            onChange={(value) => { setCareer(value); }}
            allLabel="All careers"
            options={filters.careers.map((c) => ({ label: c, value: c }))}
          />
        )}
        {category === 'ship' && filters && filters.roles.length > 0 && (
          <ListFilterSelect
            value={role}
            onChange={(value) => { setRole(value); }}
            allLabel="All roles"
            options={filters.roles.map((r) => ({ label: r, value: r }))}
          />
        )}
        {filters && filters.variant_types.length > 0 && (
          <ListFilterSelect
            value={variantType}
            onChange={(value) => { setVariantType(value); }}
            allLabel="All types"
            options={filters.variant_types.map((vt) => ({ label: vt, value: vt }))}
          />
        )}
        <ListFilterSelect
          value={sort}
          onChange={(value) => { setSort(value); }}
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
              onPageChange={goToPage}
            />
          )}
        </>
      )}
    </PageShell>
  );
}
