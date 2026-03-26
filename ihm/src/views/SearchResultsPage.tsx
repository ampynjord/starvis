import { useQuery } from '@tanstack/react-query';
import { Search, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { useDebounce } from '@/hooks/useDebounce';

type Tab = 'all' | 'ships' | 'components' | 'items' | 'commodities' | 'missions' | 'recipes';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ships', label: 'Ships' },
  { key: 'components', label: 'Components' },
  { key: 'items', label: 'Items' },
  { key: 'commodities', label: 'Commodities' },
  { key: 'missions', label: 'Missions' },
  { key: 'recipes', label: 'Crafting' },
];

function entityLink(type: string, uuid: string): string {
  switch (type) {
    case 'ships': return `/ships/${uuid}`;
    case 'components': return `/components/${uuid}`;
    case 'items': return `/items/${uuid}`;
    case 'commodities': return `/commodities/${uuid}`;
    case 'missions': return `/missions/${uuid}`;
    case 'recipes': return `/crafting`;
    default: return '#';
  }
}

export default function SearchResultsPage() {
  const { env } = useEnv();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, 300);
  const [activeTab, setActiveTab] = useState<Tab>('all');

  const { data: results, isLoading } = useQuery({
    queryKey: ['search.full', debouncedQuery, env],
    queryFn: () => api.search(debouncedQuery, 20, env),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const handleSearch = (value: string) => {
    setQuery(value);
    const params = new URLSearchParams();
    if (value) params.set('q', value);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const sections = [
    { key: 'ships' as const, label: 'Ships', items: results?.ships ?? [] },
    { key: 'components' as const, label: 'Components', items: results?.components ?? [] },
    { key: 'items' as const, label: 'Items', items: results?.items ?? [] },
    { key: 'commodities' as const, label: 'Commodities', items: results?.commodities ?? [] },
    { key: 'missions' as const, label: 'Missions', items: results?.missions ?? [] },
    { key: 'recipes' as const, label: 'Crafting', items: results?.recipes ?? [] },
  ];

  const filteredSections = activeTab === 'all'
    ? sections.filter((s) => s.items.length > 0)
    : sections.filter((s) => s.key === activeTab && s.items.length > 0);

  const totalCount = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="max-w-screen-lg mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Search size={18} className="text-cyan-400" />
        <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
          Search
        </h1>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search ships, components, items, commodities, missions..."
          className="sci-input w-full pl-9 text-sm"
          autoFocus
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((tab) => {
          const count = tab.key === 'all' ? totalCount : (sections.find((s) => s.key === tab.key)?.items.length ?? 0);
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-mono-sc rounded border transition-colors ${
                activeTab === tab.key
                  ? 'border-cyan-700 bg-cyan-950/40 text-cyan-400'
                  : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {tab.label}
              {count > 0 && <span className="ml-1.5 text-[10px] text-slate-600">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Results */}
      {isLoading && debouncedQuery.length >= 2 ? (
        <LoadingGrid message="Searching..." />
      ) : debouncedQuery.length < 2 ? (
        <div className="text-center py-16 text-slate-700 text-sm font-rajdhani">
          Type at least 2 characters to search
        </div>
      ) : filteredSections.length === 0 ? (
        <div className="text-center py-16 text-slate-700 text-sm font-rajdhani">
          No results found for "{debouncedQuery}"
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSections.map((section) => (
            <ScifiPanel
              key={section.key}
              title={section.label}
              subtitle={`${section.items.length} result${section.items.length > 1 ? 's' : ''}`}
            >
              <div className="divide-y divide-slate-800/50">
                {section.items.map((item: any) => (
                  <Link
                    key={item.uuid}
                    href={entityLink(section.key, item.uuid)}
                    className="flex items-center justify-between px-3 py-2.5 hover:bg-cyan-950/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-rajdhani font-semibold text-slate-200 truncate">
                        {item.name || item.title || item.class_name}
                      </div>
                      <div className="text-[10px] text-slate-600 flex items-center gap-2">
                        {item.type && <span>{item.type}</span>}
                        {item.sub_type && <span>· {item.sub_type}</span>}
                        {item.size != null && <span>· S{item.size}</span>}
                        {item.manufacturer_code && <span>· {item.manufacturer_code}</span>}
                        {item.role && <span>· {item.role}</span>}
                      </div>
                    </div>
                    <ChevronRight size={12} className="text-slate-600 shrink-0" />
                  </Link>
                ))}
              </div>
            </ScifiPanel>
          ))}
        </div>
      )}
    </div>
  );
}
