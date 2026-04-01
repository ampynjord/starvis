import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { FilterPanel } from '@/components/ui/FilterPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { useListQueryState } from '@/hooks/useListQueryState';

const LIMIT = 30;

/** Maps raw DB type(s) → display category label */
const ITEM_CATEGORY_MAP: { label: string; types: string[] }[] = [
  { label: 'Weapons',     types: ['FPS_Weapon'] },
  { label: 'Helmet',      types: ['Armor_Helmet'] },
  { label: 'Core',        types: ['Armor_Torso'] },
  { label: 'Arms',        types: ['Armor_Arms'] },
  { label: 'Legs',        types: ['Armor_Legs'] },
  { label: 'Undersuit',   types: ['Undersuit'] },
  { label: 'Clothing',    types: ['Clothing'] },
  { label: 'Gadgets',     types: ['Gadget'] },
  { label: 'Tools',       types: ['Tool'] },
  { label: 'Consumables', types: ['Consumable'] },
  { label: 'Attachments', types: ['Attachment'] },
  { label: 'Magazines',   types: ['Magazine'] },
];

/** Friendly label for a raw DB type, used in the item card */
const TYPE_LABEL: Record<string, string> = {
  FPS_Weapon:    'Weapon',
  Armor_Torso:   'Core',
  Armor_Arms:    'Arms',
  Armor_Legs:    'Legs',
  Armor_Helmet:  'Helmet',
  Undersuit:     'Undersuit',
  Clothing:      'Clothing',
  Gadget:        'Gadget',
  Tool:          'Tool',
  Consumable:    'Consumable',
  Attachment:    'Attachment',
  Magazine:      'Magazine',
};

export default function ItemsPage() {
  const pathname = usePathname();
  const { env } = useEnv();
  const { page, search, debouncedSearch, updateSearch, updatePageWithScroll, resetListState, setPage } = useListQueryState();
  const [manufacturer, setManufacturer] = useState('');
  const mode: 'fps' | 'other' = pathname?.startsWith('/other-items') ? 'other' : 'fps';
  const [activeCategory, setActiveCategory] = useState('');

  const { data: filters } = useQuery({
    queryKey: ['items.filters', env],
    queryFn: () => api.items.filters(env),
    staleTime: 5 * 60_000,
  });

  // Build available category chips from the DB types actually present
  const categories = useMemo(() => {
    const rawTypes = new Set<string>(filters?.types ?? []);
    if (mode === 'fps') {
      const available = ITEM_CATEGORY_MAP.filter((c) => c.types.some((t) => rawTypes.has(t)));
      const allTypes = [...new Set(available.flatMap((c) => c.types))];
      const chips = [{ label: 'All', types: allTypes }, ...available];
      return chips;
    }
    // "other items" mode: anything not in the FPS categories
    const fpsCovered = new Set(ITEM_CATEGORY_MAP.flatMap((c) => c.types));
    const otherTypes = [...rawTypes].filter((t) => !fpsCovered.has(t));
    return [{ label: 'All', types: otherTypes }];
  }, [filters?.types, mode]);

  const selectedCategory = categories.find((c) => c.label === activeCategory) ?? categories[0] ?? { label: '', types: [] };

  const selectCategory = (label: string) => {
    setActiveCategory(label);
    setPage(1);
  };

  const chipTypes = selectedCategory.types ?? [];
  const effectiveType = chipTypes.length === 1 ? chipTypes[0] : undefined;
  const effectiveTypes = chipTypes.length > 1 ? chipTypes.join(',') : undefined;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['items.list', env, { page, search: debouncedSearch, type: effectiveType, types: effectiveTypes, manufacturer }],
    queryFn: () => api.items.list({
      env,
      page, limit: LIMIT,
      search: debouncedSearch || undefined,
      type: effectiveType,
      types: effectiveTypes,
      manufacturer: manufacturer || undefined,
    }),
    enabled: !!filters && categories.length > 0,
  });

  const displayedData = data;

  const hasFilters = !!(manufacturer || debouncedSearch || (activeCategory && activeCategory !== categories[0]?.label));
  const resetFilters = () => { resetListState(); setManufacturer(''); setActiveCategory(categories[0]?.label ?? ''); };

  const filterGroups = filters ? [
    {
      key: 'mfr',
      label: 'Manufacturer',
      defaultOpen: true,
      options: (filters.manufacturers ?? []).map((m) => ({ label: m.name, value: m.code })),
      value: manufacturer,
      onChange: (v: string) => { setManufacturer(v); setPage(1); },
    },
  ] : [];

  const pageTitle = mode === 'other' ? 'Other Items' : 'FPS Gear';

  const getItemDisplayName = (item: { displayName?: string; display_name?: string; name: string }) =>
    item.displayName ?? item.display_name ?? item.name;

  useEffect(() => {
    if (!categories.length) return;
    if (!activeCategory || !categories.some((c) => c.label === activeCategory)) {
      setActiveCategory(categories[0].label);
    }
  }, [categories, activeCategory]);

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">{pageTitle}</h1>
          {data && <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">{data.total.toLocaleString('en-US')} items</p>}
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input type="text" value={search} onChange={e => updateSearch(e.target.value)} placeholder="Search an item…" className="sci-input w-full pl-8 text-xs" />
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => selectCategory(chip.label)}
            className={[
              'px-3 py-1 rounded-sm text-xs font-rajdhani font-semibold tracking-wider transition-all border',
              activeCategory === chip.label
                ? 'bg-cyan-950/60 border-cyan-700 text-cyan-400'
                : 'border-border text-slate-500 hover:text-slate-300 hover:border-slate-600',
            ].join(' ')}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        <div className="w-44 shrink-0">
          {filterGroups.length > 0
            ? <FilterPanel hasFilters={hasFilters} onReset={resetFilters} groups={filterGroups} />
            : <div className="sci-panel p-3 text-xs text-slate-600 animate-pulse">Loading…</div>}
        </div>

        <div className="flex-1 min-w-0">
          {isLoading ? <LoadingGrid message="LOADING…" />
          : error ? <ErrorState error={error as Error} onRetry={() => void refetch()} />
          : displayedData?.data.length === 0 ? <EmptyState icon="🛡" title="No items found" />
          : (
            <>
              <div className="space-y-1.5">
                {displayedData?.data.map((item, i) => (
                  <motion.div key={item.uuid} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                    <div className="sci-panel hover:border-cyan-800 transition-colors px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link href={`/items/${item.uuid}`} className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-orbitron text-sm text-slate-200 truncate">{getItemDisplayName(item)}</span>
                            {item.grade && <GlowBadge color="amber">{item.grade}</GlowBadge>}
                            {item.size != null && <GlowBadge color="slate">S{item.size}</GlowBadge>}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs font-mono-sc text-cyan-700">{TYPE_LABEL[item.type] ?? item.type}</span>
                            {item.sub_type && <span className="text-xs text-slate-600">{item.sub_type}</span>}
                            {item.manufacturer_name && <span className="text-xs text-slate-600">{item.manufacturer_name}</span>}
                          </div>
                        </Link>
                        <Link
                          href={`/missions?search=${encodeURIComponent(getItemDisplayName(item))}`}
                          className="text-xs text-amber-500 hover:text-amber-300 shrink-0"
                        >
                          Mission leads
                        </Link>
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

