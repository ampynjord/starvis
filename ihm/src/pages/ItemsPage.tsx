import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
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

interface ItemCategoryDef {
  label: string;
  test: (type: string) => boolean;
}

const FPS_CATEGORY_DEFS: ItemCategoryDef[] = [
  { label: 'Helmets / Armor / Undersuits', test: (t) => /(helmet|armor|undersuit|plastron|leg|jambiere|wearable)/i.test(t) },
  { label: 'Weapons / Ammo / Grenades', test: (t) => /(weapon|ammo|munition|grenade|magazine)/i.test(t) },
  { label: 'Tools / Tool Modules', test: (t) => /(tool|mining|salvage|tractor|module)/i.test(t) },
  { label: 'Attachments', test: (t) => /(attachment|scope|barrel|underbarrel|muzzle)/i.test(t) },
  { label: 'Medical', test: (t) => /(medical|medpen|paramed|med)/i.test(t) },
  { label: 'Clothing / Backpacks', test: (t) => /(clothing|backpack|wear)/i.test(t) },
];

function isFpsType(t: string): boolean {
  return /(helmet|armor|undersuit|clothing|backpack|weapon|ammo|munition|grenade|magazine|tool|module|attachment|medical|medpen|paramed|food|drink|gadget)/i.test(t);
}

function buildModeCategories(rawTypes: string[], mode: 'fps' | 'other'): { label: string; types: string[] }[] {
  const source = rawTypes.filter(Boolean);
  const normalized = mode === 'fps' ? source.filter(isFpsType) : source.filter((t) => !isFpsType(t));

  if (mode === 'other') {
    return [
      { label: 'All Other Items', types: normalized },
      { label: 'Mission / Objective Objects', types: normalized.filter((t) => /(mission|objective|token|key|data|artifact)/i.test(t)) },
      { label: 'Misc Unclassified', types: normalized.filter((t) => !/(mission|objective|token|key|data|artifact)/i.test(t)) },
    ].filter((c) => c.types.length > 0);
  }

  const used = new Set<string>();

  const categories = FPS_CATEGORY_DEFS.map((def) => {
    const types = normalized.filter((t) => def.test(t));
    types.forEach((t) => used.add(t));
    return { label: def.label, types };
  }).filter((c) => c.types.length > 0);

  const remaining = normalized.filter((t) => !used.has(t));
  if (remaining.length > 0) categories.push({ label: 'Other FPS Gear', types: remaining });

  return [{ label: 'All FPS Gear', types: normalized }, ...categories];
}

export default function ItemsPage() {
  const location = useLocation();
  const { env } = useEnv();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const mode: 'fps' | 'other' = location.pathname.startsWith('/other-items') ? 'other' : 'fps';
  const [activeCategory, setActiveCategory] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const { data: filters } = useQuery({
    queryKey: ['items.filters', env],
    queryFn: () => api.items.filters(env),
    staleTime: Infinity,
  });

  const categories = useMemo(
    () => buildModeCategories(filters?.types ?? [], mode),
    [filters?.types, mode],
  );

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
  const resetFilters = () => { setManufacturer(''); setSearch(''); setPage(1); setActiveCategory(categories[0]?.label ?? ''); };

  const filterGroups = filters ? [
    { key: 'mfr', label: 'Manufacturer', options: (filters['manufacturers'] ?? []).map((m: string) => ({ label: m, value: m })), value: manufacturer, onChange: (v: string) => { setManufacturer(v); setPage(1); } },
  ] : [];

  const pageTitle = mode === 'other' ? 'Other Items' : 'FPS Gear';

  useEffect(() => {
    if (!categories.length) return;
    if (!activeCategory || !categories.some((c) => c.label === activeCategory)) {
      setActiveCategory(categories[0].label);
    }
  }, [categories, activeCategory]);

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">{pageTitle}</h1>
          {data && <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">{data.total.toLocaleString('en-US')} items</p>}
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search an item…" className="sci-input w-full pl-8 text-xs" />
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

      <div className="flex gap-4">
        <div className="w-44 flex-shrink-0">
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
                        <Link to={`/items/${item.uuid}`} className="flex-1 min-w-0">
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
                        </Link>
                        <Link
                          to={`/missions?search=${encodeURIComponent(item.name)}`}
                          className="text-xs text-amber-500 hover:text-amber-300 flex-shrink-0"
                        >
                          Mission leads
                        </Link>
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
