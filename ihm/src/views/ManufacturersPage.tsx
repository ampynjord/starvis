import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight, Cpu, Crosshair, Package, Pill, Rocket, Settings2, Shield, Shirt, ShoppingBag, SlidersHorizontal, Wrench, Zap } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { ShipCard } from '@/components/ship/ShipCard';
import type { ComponentListItem, ItemListItem, Manufacturer } from '@/types/api';
import { COMPONENT_TYPE_COLORS } from '@/utils/constants';

type MfrTab = 'ships' | 'components' | 'items';

/** Maps raw DB type to a friendly display category */
const ITEM_CATEGORY_DISPLAY: Record<string, string> = {
  FPS_Weapon:    'Weapons',
  Armor_Helmet:  'Helmet',
  Armor_Torso:   'Core',
  Armor_Arms:    'Arms',
  Armor_Legs:    'Legs',
  Undersuit:     'Undersuit',
  Clothing:      'Clothing',
  Gadget:        'Gadgets',
  Tool:          'Tools',
  Consumable:    'Consumables',
  Attachment:    'Attachments',
  Magazine:      'Magazines',
};

const ITEM_CATEGORY_COLORS: Record<string, string> = {
  Weapons:      'text-red-400',
  Helmet:       'text-blue-300',
  Core:         'text-blue-400',
  Arms:         'text-blue-500',
  Legs:         'text-blue-600',
  Undersuit:    'text-indigo-400',
  Clothing:     'text-purple-400',
  Gadgets:      'text-yellow-400',
  Tools:        'text-green-400',
  Consumables:  'text-orange-400',
  Attachments:  'text-teal-400',
  Magazines:    'text-slate-500',
};

/** Icon per category (lucide) */
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

function ComponentRow({ c }: { c: ComponentListItem }) {
  const color = COMPONENT_TYPE_COLORS[c.type] ?? 'text-slate-400';
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded hover:bg-white/5 transition-colors border border-transparent hover:border-slate-800">
      <span className={`text-xs font-mono-sc w-28 shrink-0 truncate ${color}`}>{c.type}</span>
      <span className="flex-1 text-sm text-slate-300 truncate">{c.name}</span>
      {c.size != null && (
        <span className="text-xs font-mono-sc text-slate-600 shrink-0">S{c.size}</span>
      )}
      {c.grade && (
        <span className="text-xs font-mono-sc text-slate-600 shrink-0">{c.grade}</span>
      )}
    </div>
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
      {item.size != null && (
        <span className="text-xs font-mono-sc text-slate-600 shrink-0">S{item.size}</span>
      )}
      {item.grade && (
        <span className="text-xs font-mono-sc text-slate-600 shrink-0">{item.grade}</span>
      )}
    </div>
  );
}

export default function ManufacturersPage() {
  const { env } = useEnv();
  const [selected, setSelected] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MfrTab>('ships');
  const [activeItemCat, setActiveItemCat] = useState<string>('All');
  const [mfrListOpen, setMfrListOpen] = useState(false);

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

  const selectedMfr = manufacturers?.find((m: Manufacturer) => m.code === selected);

  // Group items by display category (e.g. Armor_Arms + Armor_Torso + … → "Armor")
  const itemsByCategory = itemsByMfr?.reduce<Record<string, ItemListItem[]>>((acc, item) => {
    const cat = ITEM_CATEGORY_DISPLAY[item.type ?? ''] ?? (item.type ?? 'Other');
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // Group components by type
  const componentsByType = componentsByMfr?.reduce<Record<string, ComponentListItem[]>>((acc, c) => {
    const key = c.type ?? 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  if (isLoading) return <LoadingGrid message="LOADING…" />;
  if (error)     return <ErrorState error={error as Error} onRetry={() => void refetch()} />;

  const tabs: { key: MfrTab; label: string; count: number; icon: React.ReactNode }[] = [
    { key: 'ships',      label: 'Ships',      count: selectedMfr?.ship_count ?? 0,      icon: <Rocket size={12} /> },
    { key: 'components', label: 'Components', count: selectedMfr?.component_count ?? 0, icon: <Settings2 size={12} /> },
    { key: 'items',      label: 'Items',      count: selectedMfr?.item_count ?? 0,      icon: <ShoppingBag size={12} /> },
  ];

  return (
    <div className="max-w-(--breakpoint-xl) mx-auto space-y-6">
      <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Manufacturers</h1>

      <div className="flex gap-6">
        {/* Sidebar — manufacturer list */}
        <div className="w-64 shrink-0">
          {/* Mobile toggle */}
          <button
            onClick={() => setMfrListOpen((o: boolean) => !o)}
            className={[
              'md:hidden flex items-center gap-2 mb-3 px-3 py-1.5 rounded-sm text-xs font-mono-sc uppercase tracking-wider border transition-colors w-full',
              mfrListOpen || selected
                ? 'border-cyan-700 text-cyan-400 bg-cyan-950/40'
                : 'border-slate-700 text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            <Building2 size={13} />
            {selected ? manufacturers?.find((m: Manufacturer) => m.code === selected)?.name ?? 'Manufacturer' : 'Manufacturer'}
          </button>
          <div className={mfrListOpen ? 'block md:block' : 'hidden md:block'}>
          <div className="sci-panel overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-mono-sc text-slate-600 uppercase">
                {manufacturers?.length ?? 0} manufacturers
              </p>
            </div>
            <div className="space-y-0.5 p-1.5 max-h-[calc(100vh-200px)] overflow-y-auto">
              {manufacturers?.map((m: Manufacturer) => (
                <button
                  key={m.code}
                  onClick={() => {
                    if (m.code === selected) {
                      setSelected(null);
                    } else {
                      setSelected(m.code);
                      setActiveTab('ships');
                      setActiveItemCat('All');
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-left transition-all ${
                    m.code === selected
                      ? 'bg-cyan-950/60 border border-cyan-800 text-cyan-400'
                      : 'hover:bg-white/5 text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-orbitron text-xs font-bold truncate">{m.code}</p>
                    <p className="text-xs text-slate-600 truncate">{m.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <div className="flex flex-col items-end gap-0.5">
                      {m.ship_count > 0 && (
                        <span className="text-[10px] font-mono-sc text-slate-600 flex items-center gap-0.5">
                          <Rocket size={8} />{m.ship_count}
                        </span>
                      )}
                      {m.component_count > 0 && (
                        <span className="text-[10px] font-mono-sc text-slate-600 flex items-center gap-0.5">
                          <Settings2 size={8} />{m.component_count}
                        </span>
                      )}
                      {m.item_count > 0 && (
                        <span className="text-[10px] font-mono-sc text-slate-600 flex items-center gap-0.5">
                          <ShoppingBag size={8} />{m.item_count}
                        </span>
                      )}
                    </div>
                    <ChevronRight size={10} className="text-slate-700" />
                  </div>
                </button>
              ))}
            </div>
          </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-4">
          {selectedMfr ? (
            <>
              {/* Header */}
              <ScifiPanel>
                <div className="flex items-start gap-4">
                  <div className="flex-1">
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
              <div className="flex gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-sc rounded border transition-colors ${
                      activeTab === tab.key
                        ? 'border-cyan-700 bg-cyan-950/40 text-cyan-400'
                        : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.count > 0 && (
                      <span className="text-[10px] text-slate-600">({tab.count})</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content — Ships */}
              {activeTab === 'ships' && (
                <>
                  {loadingShips ? (
                    <LoadingGrid message="Loading ships…" />
                  ) : shipsByMfr && shipsByMfr.length > 0 ? (
                    <ScifiPanel title="Ships" subtitle={`${shipsByMfr.length} ships`}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {shipsByMfr.map((s, i) => <ShipCard key={s.uuid} ship={s} index={i} />)}
                      </div>
                    </ScifiPanel>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-700">
                      <Rocket size={24} />
                      <p className="font-rajdhani text-sm">No ships found</p>
                    </div>
                  )}
                </>
              )}

              {/* Tab content — Components */}
              {activeTab === 'components' && (
                <>
                  {loadingComponents ? (
                    <LoadingGrid message="Loading components…" />
                  ) : componentsByType && Object.keys(componentsByType).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(componentsByType)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([type, comps]) => (
                          <ScifiPanel
                            key={type}
                            title={type}
                            subtitle={`${comps.length} components`}
                          >
                            <div className="divide-y divide-slate-900">
                              {comps.map((c) => <ComponentRow key={c.uuid} c={c} />)}
                            </div>
                          </ScifiPanel>
                        ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-700">
                      <Settings2 size={24} />
                      <p className="font-rajdhani text-sm">No ship components found</p>
                    </div>
                  )}
                </>
              )}

              {/* Tab content — Items (FPS) */}
              {activeTab === 'items' && (
                <>
                  {loadingItems ? (
                    <LoadingGrid message="Loading items…" />
                  ) : itemsByCategory && Object.keys(itemsByCategory).length > 0 ? (
                    <div className="space-y-3">
                      {/* Category chips */}
                      <div className="flex flex-wrap gap-2">
                        {['All', ...Object.keys(itemsByCategory).sort()].map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setActiveItemCat(cat)}
                            className={[
                              'px-3 py-1 rounded-sm text-xs font-rajdhani font-semibold tracking-wider transition-all border',
                              activeItemCat === cat
                                ? 'bg-cyan-950/60 border-cyan-700 text-cyan-400'
                                : 'border-border text-slate-500 hover:text-slate-300 hover:border-slate-600',
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
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-700">
                      <Package size={24} />
                      <p className="font-rajdhani text-sm">No FPS items found</p>
                    </div>
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
    </div>
  );
}

