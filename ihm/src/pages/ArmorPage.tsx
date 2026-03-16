import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/services/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FilterPanel } from '@/components/ui/FilterPanel';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { Pagination } from '@/components/ui/Pagination';
import { useDebounce } from '@/hooks/useDebounce';

const LIMIT = 40;

// Item types considered FPS/armor gear
const ARMOR_TYPES = ['Armor', 'Helmet', 'Undersuit', 'Backpack', 'WeaponPersonal', 'FPS Weapon', 'Gadget', 'Clothing'];

const TYPE_COLORS: Record<string, 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate'> = {
  Armor: 'cyan',
  Helmet: 'cyan',
  Undersuit: 'slate',
  Backpack: 'slate',
  WeaponPersonal: 'red',
  'FPS Weapon': 'red',
  Gadget: 'amber',
  Clothing: 'purple',
};

export default function ArmorPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const { data: filtersData } = useQuery({
    queryKey: ['items.filters'],
    queryFn: () => api.items.filters(),
    staleTime: Infinity,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['armor.list', { page, search: debouncedSearch, type, manufacturer }],
    queryFn: () =>
      api.items.list({
        page,
        limit: LIMIT,
        search: debouncedSearch || undefined,
        type: type || undefined,
        manufacturer: manufacturer || undefined,
      }),
  });

  // Filter client-side to only armor/fps gear unless type is already set
  const items = type
    ? (data?.data ?? [])
    : (data?.data ?? []).filter((item) =>
        ARMOR_TYPES.some((at) => item.type === at || item.class_name?.toLowerCase().includes(at.toLowerCase())),
      );

  // Filter the available type options to armor-relevant ones
  const armorTypeOptions = (filtersData?.types ?? [])
    .filter((t: string) => ARMOR_TYPES.some((at) => at.toLowerCase() === t.toLowerCase() || t.includes(at)))
    .map((t: string) => ({ label: t, value: t }));

  const manufacturerOptions = (filtersData?.manufacturers ?? []).map((m: string) => ({
    label: m,
    value: m,
  }));

  const hasFilters = !!(type || manufacturer || debouncedSearch);

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
            Armures &amp; Équipement FPS
          </h1>
          {data && (
            <p className="text-sm text-slate-500 mt-0.5 font-mono-sc">
              {items.length.toLocaleString('en-US')} équipements
            </p>
          )}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher un équipement…"
            className="sci-input w-full pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex gap-4">
        <div className="w-44 flex-shrink-0">
          <FilterPanel
            hasFilters={hasFilters}
            onReset={() => { setType(''); setManufacturer(''); setSearch(''); setPage(1); }}
            groups={[
              {
                key: 'type',
                label: 'Type',
                options: armorTypeOptions,
                value: type,
                onChange: (v: string) => { setType(v); setPage(1); },
              },
              {
                key: 'manufacturer',
                label: 'Fabricant',
                options: manufacturerOptions,
                value: manufacturer,
                onChange: (v: string) => { setManufacturer(v); setPage(1); },
              },
            ]}
          />
        </div>

        <div className="flex-1 min-w-0">
          {isLoading ? (
            <LoadingGrid message="CHARGEMENT ÉQUIPEMENTS…" />
          ) : error ? (
            <ErrorState error={error as Error} onRetry={() => void refetch()} />
          ) : !items.length ? (
            <EmptyState icon="🛡" title="Aucun équipement trouvé" />
          ) : (
            <>
              <div className="space-y-1.5">
                {items.map((item, i) => {
                  const color = TYPE_COLORS[item.type ?? ''] ?? 'slate';
                  return (
                    <motion.div
                      key={item.uuid}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    >
                      <div className="sci-panel px-4 py-3 hover:border-cyan-800 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-orbitron text-sm text-slate-200 truncate">
                                {item.name}
                              </span>
                              {item.type && (
                                <GlowBadge color={color}>{item.type}</GlowBadge>
                              )}
                              {item.sub_type && (
                                <GlowBadge color="slate" size="xs">{item.sub_type}</GlowBadge>
                              )}
                            </div>
                            <p className="text-xs font-mono-sc text-slate-700 mt-0.5">{item.class_name}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {item.manufacturer_name && (
                              <p className="text-xs font-mono-sc text-slate-500">{item.manufacturer_name}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              {data && data.pages > 1 && (
                <div className="mt-4">
                  <Pagination page={page} totalPages={data.pages} onPageChange={setPage} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
