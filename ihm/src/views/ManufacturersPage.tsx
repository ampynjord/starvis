'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, Cpu, Crosshair, Package, Pill, Rocket, Settings2, Shield, Shirt, ShoppingBag, SlidersHorizontal, Wrench, Zap } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ShipCard } from '@/components/ship/ShipCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FilterPanel, MobileFilterWrapper } from '@/components/ui/FilterPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { Pagination } from '@/components/ui/Pagination';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import type { ComponentListItem, ItemListItem, Manufacturer, ShipListItem } from '@/types/api';
import { COMPONENT_TYPE_COLORS, COMPONENT_TYPE_LABELS } from '@/utils/constants';

type MfrTab = 'ships' | 'components' | 'items';

const PAGE_SIZE = 24;

const ITEM_CATEGORY_DISPLAY: Record<string, string> = {
  FPS_Weapon:   'Weapons',
  Armor_Helmet: 'Helmet',
  Armor_Torso:  'Core',
  Armor_Arms:   'Arms',
  Armor_Legs:   'Legs',
  Undersuit:    'Undersuit',
  Clothing:     'Clothing',
  Gadget:       'Gadgets',
  Tool:         'Tools',
  Consumable:   'Consumables',
  Attachment:   'Attachments',
  Magazine:     'Magazines',
};

const ITEM_CATEGORY_COLORS: Record<string, string> = {
  Weapons:     'text-red-400',
  Helmet:      'text-blue-300',
  Core:        'text-blue-400',
  Arms:        'text-blue-500',
  Legs:        'text-blue-600',
  Undersuit:   'text-indigo-400',
  Clothing:    'text-purple-400',
  Gadgets:     'text-yellow-400',
  Tools:       'text-green-400',
  Consumables: 'text-orange-400',
  Attachments: 'text-teal-400',
  Magazines:   'text-slate-500',
};

const ITEM_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Weapons:     <Crosshair size={12} />,
  Helmet:      <Shield size={12} />,
  Core:        <Shield size={12} />,
  Arms:        <Shield size={12} />,
  Legs:        <Shield size={12} />,
  Undersuit:   <Shirt size={12} />,
  Clothing:    <Shirt size={12} />,
  Gadgets:     <Cpu size={12} />,
  Tools:       <Wrench size={12} />,
  Consumables: <Pill size={12} />,
  Attachments: <SlidersHorizontal size={12} />,
  Magazines:   <Package size={12} />,
};

const SHIP_SORTS = [
  { value: 'name',           label: 'Name' },
  { value: 'cargo_capacity', label: 'Cargo' },
  { value: 'crew_size',      label: 'Crew' },
  { value: 'scm_speed',      label: 'SCM Speed' },
] as const;

const COMP_SORTS = [
  { value: 'type', label: 'Type' },
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'Size' },
] as const;

function getKeyStat(c: ComponentListItem): string | null {
  const fN = (n: number | null | undefined, unit = '', dec = 0) =>
    n != null ? `${Number(n).toLocaleString('en-US', { maximumFractionDigits: dec, minimumFractionDigits: dec })}${unit}` : null;
  switch (c.type) {
    case 'WeaponGun': return fN(c.weapon_dps, ' DPS', 1);
    case 'Shield': return fN(c.shield_hp, ' HP');
    case 'QuantumDrive': return c.qd_speed != null ? `${(Number(c.qd_speed) / 1e6).toFixed(0)} Mm/s` : null;
    case 'PowerPlant': return fN(c.power_output);
    case 'Cooler': return fN(c.cooling_rate);
    case 'Radar': return fN(c.radar_range, 'm');
    case 'TractorBeam': return c.tractor_max_force != null ? `${(Number(c.tractor_max_force) / 1000).toFixed(0)} kN` : null;
    case 'MiningLaser': return fN(c.mining_speed, '', 1);
    case 'SalvageHead': return fN(c.salvage_speed, '', 2);
    case 'EMP': return fN(c.emp_damage, ' Dmg');
    case 'QuantumInterdictionGenerator': return fN(c.qig_jammer_range, 'm');
    case 'Thruster': return c.thruster_max_thrust != null ? `${(Number(c.thruster_max_thrust) / 1000).toFixed(0)} kN` : null;
    case 'Missile': case 'Torpedo': case 'Bomb': return fN(c.missile_damage, ' Dmg');
    case 'FuelTank': return fN(c.fuel_capacity);
    default: return null;
  }
}

function ComponentRow({ c }: { c: ComponentListItem }) {
  const color = COMPONENT_TYPE_COLORS[c.type] ?? 'text-slate-400';
  const keyStat = getKeyStat(c);
  return (
    <Link
      href={`/components/${c.uuid}`}
      className="flex items-center gap-3 px-3 py-2 rounded hover:bg-white/5 transition-colors border border-transparent hover:border-slate-800"
    >
      <span className={`text-xs font-mono-sc w-28 shrink-0 truncate ${color}`}>
        {COMPONENT_TYPE_LABELS[c.type] ?? c.type}
      </span>
      <span className="flex-1 text-sm text-slate-300 truncate">{c.name}</span>
      {keyStat && <span className={`text-xs font-mono-sc shrink-0 ${color}`}>{keyStat}</span>}
      {c.size != null && <span className="text-xs font-mono-sc text-slate-600 shrink-0">S{c.size}</span>}
      {c.grade && <span className="text-xs font-mono-sc text-slate-600 shrink-0">{c.grade}</span>}
    </Link>
  );
}

function ItemRow({ item, category }: { item: ItemListItem; category: string }) {
  const color = ITEM_CATEGORY_COLORS[category] ?? 'text-slate-400';
  const label = item.display_name ?? item.displayName ?? item.name;
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded hover:bg-white/5 transition-colors border border-transparent hover:border-slate-800">
      {item.sub_type && (
        <span className={`text-xs font-mono-sc w-28 shrink-0 truncate ${color}`}>{item.sub_type}</span>
      )}
      <span className="flex-1 text-sm text-slate-300 truncate">{label}</span>
      {item.size != null && <span className="text-xs font-mono-sc text-slate-600 shrink-0">S{item.size}</span>}
      {item.grade && <span className="text-xs font-mono-sc text-slate-600 shrink-0">{item.grade}</span>}
    </div>
  );
}

export default function ManufacturersPage() {
  const { env } = useEnv();
  const [selected, setSelected] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MfrTab>('ships');
  const [mfrSearch, setMfrSearch] = useState('');

  // Ships tab state
  const [shipSort, setShipSort] = useState<string>('name');
  const [shipOrder, setShipOrder] = useState<'asc' | 'desc'>('asc');
  const [shipPage, setShipPage] = useState(1);

  // Components tab state
  const [compTypeFilter, setCompTypeFilter] = useState('');
  const [compSort, setCompSort] = useState<string>('type');
  const [compOrder, setCompOrder] = useState<'asc' | 'desc'>('asc');
  const [compPage, setCompPage] = useState(1);

  // Items tab state
  const [activeItemCat, setActiveItemCat] = useState('All');

  const { data: manufacturers, isLoading, error, refetch } = useQuery({
    queryKey: ['manufacturers.list', env],
    queryFn: () => api.manufacturers.list(env),
  });

  const { data: shipsByMfr, isLoading: loadingShips } = useQuery({
    queryKey: ['manufacturers.ships', selected, env],
    queryFn: () => api.manufacturers.ships(selected!, env),
    enabled: !!selected && activeTab === 'ships',
  });

  const { data: componentsByMfr, isLoading: loadingComponents } = useQuery({
    queryKey: ['manufacturers.components', selected, env],
    queryFn: () => api.manufacturers.components(selected!, env),
    enabled: !!selected && activeTab === 'components',
  });

  const { data: itemsByMfr, isLoading: loadingItems } = useQuery({
    queryKey: ['manufacturers.items', selected, env],
    queryFn: () => api.manufacturers.items(selected!, env),
    enabled: !!selected && activeTab === 'items',
  });

  // Filter manufacturers by search
  const filteredMfrs = useMemo(
    () =>
      (manufacturers ?? []).filter(
        (m: Manufacturer) =>
          !mfrSearch ||
          m.name.toLowerCase().includes(mfrSearch.toLowerCase()) ||
          m.code.toLowerCase().includes(mfrSearch.toLowerCase()),
      ),
    [manufacturers, mfrSearch],
  );

  // Sort + paginate ships
  const sortedShips = useMemo(() => {
    if (!shipsByMfr) return [];
    return [...shipsByMfr].sort((a, b) => {
      const av = a[shipSort as keyof ShipListItem] as number | string | null | undefined;
      const bv = b[shipSort as keyof ShipListItem] as number | string | null | undefined;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return shipOrder === 'asc' ? cmp : -cmp;
    });
  }, [shipsByMfr, shipSort, shipOrder]);

  const shipPages = Math.ceil(sortedShips.length / PAGE_SIZE);
  const pagedShips = sortedShips.slice((shipPage - 1) * PAGE_SIZE, shipPage * PAGE_SIZE);

  // Filter + sort + paginate components
  const filteredComps = useMemo(() => {
    if (!componentsByMfr) return [];
    const items = compTypeFilter
      ? componentsByMfr.filter((c) => c.type === compTypeFilter)
      : componentsByMfr;
    return [...items].sort((a, b) => {
      let cmp = 0;
      if (compSort === 'type') cmp = (a.type ?? '').localeCompare(b.type ?? '');
      else if (compSort === 'name') cmp = a.name.localeCompare(b.name);
      else if (compSort === 'size') cmp = (a.size ?? 0) - (b.size ?? 0);
      return compOrder === 'asc' ? cmp : -cmp;
    });
  }, [componentsByMfr, compTypeFilter, compSort, compOrder]);

  const compPages = Math.ceil(filteredComps.length / PAGE_SIZE);
  const pagedComps = filteredComps.slice((compPage - 1) * PAGE_SIZE, compPage * PAGE_SIZE);

  const compTypes = useMemo(
    () => [...new Set((componentsByMfr ?? []).map((c) => c.type))].sort(),
    [componentsByMfr],
  );

  const itemsByCategory = useMemo(
    () =>
      (itemsByMfr ?? []).reduce<Record<string, ItemListItem[]>>((acc, item) => {
        const cat = ITEM_CATEGORY_DISPLAY[item.type ?? ''] ?? (item.type ?? 'Other');
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
      }, {}),
    [itemsByMfr],
  );

  const selectedMfr = (manufacturers ?? []).find((m: Manufacturer) => m.code === selected);

  const selectMfr = (code: string) => {
    setSelected(code || null);
    setActiveTab('ships');
    setActiveItemCat('All');
    setCompTypeFilter('');
    setShipPage(1);
    setCompPage(1);
  };

  const tabs: { key: MfrTab; label: string; count: number; icon: React.ReactNode }[] = [
    { key: 'ships',      label: 'Ships',      count: selectedMfr?.ship_count ?? 0,      icon: <Rocket size={12} /> },
    { key: 'components', label: 'Components', count: selectedMfr?.component_count ?? 0, icon: <Settings2 size={12} /> },
    { key: 'items',      label: 'Items',      count: selectedMfr?.item_count ?? 0,      icon: <ShoppingBag size={12} /> },
  ];

  if (isLoading) return <LoadingGrid message="LOADING…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;

  return (
    <PageShell>
      <PageHeader
        title="Manufacturers"
        count={manufacturers?.length}
        countLabel="manufacturers"
        search={mfrSearch}
        searchPlaceholder="Search manufacturer…"
        onSearch={(v) => { setMfrSearch(v); setSelected(null); }}
      />

      <div className="flex gap-4">
        {/* Filter sidebar */}
        <div className="w-52 shrink-0">
          <MobileFilterWrapper hasFilters={!!selected}>
            <FilterPanel
              hasFilters={!!selected}
              onReset={() => selectMfr('')}
              groups={[
                {
                  key: 'manufacturer',
                  label: `Manufacturer (${filteredMfrs.length})`,
                  options: filteredMfrs.map((m: Manufacturer) => ({
                    label: `${m.code} — ${m.name}`,
                    value: m.code,
                  })),
                  value: selected ?? '',
                  onChange: selectMfr,
                  defaultOpen: true,
                },
              ]}
            />
          </MobileFilterWrapper>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {selectedMfr ? (
            <>
              {/* Manufacturer header */}
              <ScifiPanel>
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest">{selectedMfr.code}</p>
                    <h2 className="font-orbitron text-xl text-slate-100 mt-0.5">{selectedMfr.name}</h2>
                    {selectedMfr.known_for && (
                      <p className="text-sm text-slate-500 mt-1 italic">{selectedMfr.known_for}</p>
                    )}
                    {selectedMfr.description && (
                      <p className="text-sm text-slate-400 mt-2 leading-relaxed">{selectedMfr.description}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 shrink-0">
                    <div className="sci-panel p-3 text-center">
                      <Rocket size={16} className="text-cyan-400 mx-auto mb-1" />
                      <p className="font-orbitron text-lg text-slate-200">{selectedMfr.ship_count}</p>
                      <p className="text-xs text-slate-600">Ships</p>
                    </div>
                    <div className="sci-panel p-3 text-center">
                      <Settings2 size={16} className="text-blue-400 mx-auto mb-1" />
                      <p className="font-orbitron text-lg text-slate-200">{selectedMfr.component_count}</p>
                      <p className="text-xs text-slate-600">Components</p>
                    </div>
                    <div className="sci-panel p-3 text-center">
                      <ShoppingBag size={16} className="text-purple-400 mx-auto mb-1" />
                      <p className="font-orbitron text-lg text-slate-200">{selectedMfr.item_count}</p>
                      <p className="text-xs text-slate-600">Items</p>
                    </div>
                  </div>
                </div>
              </ScifiPanel>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-slate-800">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono-sc uppercase tracking-wider border-b-2 -mb-px transition-colors ${
                      activeTab === tab.key
                        ? 'border-cyan-500 text-cyan-400'
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.count > 0 && (
                      <span className={`ml-1 ${activeTab === tab.key ? 'text-cyan-600' : 'text-slate-700'}`}>
                        ({tab.count})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Ships tab */}
              {activeTab === 'ships' && (
                <>
                  {/* Sort toolbar */}
                  <div className="flex items-center justify-end gap-2">
                    <select
                      value={shipSort}
                      onChange={(e) => { setShipSort(e.target.value); setShipPage(1); }}
                      className="sci-input text-xs py-1.5"
                    >
                      {SHIP_SORTS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShipOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                      title={shipOrder === 'asc' ? 'Ascending' : 'Descending'}
                      className="sci-panel px-2 py-1.5 text-slate-400 hover:text-cyan-400 transition-colors"
                    >
                      <ArrowUpDown size={13} className={shipOrder === 'desc' ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    </button>
                  </div>

                  {loadingShips ? (
                    <LoadingGrid message="Loading ships…" />
                  ) : pagedShips.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {pagedShips.map((s, i) => <ShipCard key={s.uuid} ship={s} index={i} />)}
                      </div>
                      {shipPages > 1 && (
                        <Pagination className="mt-4" page={shipPage} totalPages={shipPages} onPageChange={setShipPage} />
                      )}
                    </>
                  ) : (
                    <EmptyState icon="🚀" title="No ships" message="This manufacturer has no ships." />
                  )}
                </>
              )}

              {/* Components tab */}
              {activeTab === 'components' && (
                <>
                  {loadingComponents ? (
                    <LoadingGrid message="Loading components…" />
                  ) : (
                    <>
                      {/* Type filter chips */}
                      {compTypes.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                          {['', ...compTypes].map((t) => {
                            const color = COMPONENT_TYPE_COLORS[t] ?? 'text-slate-400';
                            const active = compTypeFilter === t;
                            return (
                              <button
                                key={t || '__all__'}
                                onClick={() => { setCompTypeFilter(t); setCompPage(1); }}
                                className={[
                                  'px-2.5 py-1 rounded-sm text-xs font-mono-sc tracking-wide border transition-all',
                                  active
                                    ? 'bg-cyan-950/60 border-cyan-700 text-cyan-400'
                                    : `border-slate-800 ${t ? color : 'text-slate-500'} hover:border-slate-600`,
                                ].join(' ')}
                              >
                                {t ? (COMPONENT_TYPE_LABELS[t] ?? t) : 'All'}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Sort toolbar */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-600 font-mono-sc">
                          {filteredComps.length} component{filteredComps.length !== 1 ? 's' : ''}
                        </p>
                        <div className="flex items-center gap-2">
                          <select
                            value={compSort}
                            onChange={(e) => { setCompSort(e.target.value); setCompPage(1); }}
                            className="sci-input text-xs py-1.5"
                          >
                            {COMP_SORTS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setCompOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                            className="sci-panel px-2 py-1.5 text-slate-400 hover:text-cyan-400 transition-colors"
                          >
                            <ArrowUpDown size={13} className={compOrder === 'desc' ? 'rotate-180 transition-transform' : 'transition-transform'} />
                          </button>
                        </div>
                      </div>

                      {pagedComps.length > 0 ? (
                        <>
                          <ScifiPanel>
                            <div className="divide-y divide-slate-900">
                              {pagedComps.map((c) => <ComponentRow key={c.uuid} c={c} />)}
                            </div>
                          </ScifiPanel>
                          {compPages > 1 && (
                            <Pagination className="mt-4" page={compPage} totalPages={compPages} onPageChange={setCompPage} />
                          )}
                        </>
                      ) : (
                        <EmptyState icon="⚙️" title="No components" message="No components match the current filter." />
                      )}
                    </>
                  )}
                </>
              )}

              {/* Items tab */}
              {activeTab === 'items' && (
                <>
                  {loadingItems ? (
                    <LoadingGrid message="Loading items…" />
                  ) : Object.keys(itemsByCategory).length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        {['All', ...Object.keys(itemsByCategory).sort()].map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setActiveItemCat(cat)}
                            className={[
                              'px-2.5 py-1 rounded-sm text-xs font-mono-sc tracking-wide border transition-all',
                              activeItemCat === cat
                                ? 'bg-cyan-950/60 border-cyan-700 text-cyan-400'
                                : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300',
                            ].join(' ')}
                          >
                            {cat === 'All' ? 'All' : (
                              <span className="flex items-center gap-1">
                                <span className={ITEM_CATEGORY_COLORS[cat] ?? 'text-slate-400'}>{ITEM_CATEGORY_ICONS[cat]}</span>
                                {cat}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      {Object.entries(itemsByCategory)
                        .filter(([cat]) => activeItemCat === 'All' || cat === activeItemCat)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([cat, items]) => (
                          <ScifiPanel
                            key={cat}
                            title={
                              <span className="flex items-center gap-1.5">
                                <span className={ITEM_CATEGORY_COLORS[cat] ?? 'text-slate-400'}>
                                  {ITEM_CATEGORY_ICONS[cat] ?? <Package size={12} />}
                                </span>
                                {cat}
                              </span>
                            }
                            subtitle={`${items.length} items`}
                          >
                            <div className="divide-y divide-slate-900">
                              {items.map((item) => <ItemRow key={item.uuid} item={item} category={cat} />)}
                            </div>
                          </ScifiPanel>
                        ))}
                    </div>
                  ) : (
                    <EmptyState icon="🛍️" title="No items" message="This manufacturer has no FPS items." />
                  )}
                </>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-700">
              <Zap size={32} />
              <p className="font-orbitron text-sm tracking-widest">Select a manufacturer</p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
