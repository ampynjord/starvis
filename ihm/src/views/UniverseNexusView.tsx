'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Rocket,
  Shield,
  MapPin,
  TrendingUp,
  Search,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  LayoutGrid,
  List,
  X,
  Shirt,
  Crosshair,
  Wrench,
  Disc,
  Coffee,
  Cpu,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEnv } from '@/contexts/EnvContext';
import { useEntityNexus } from '@/contexts/NexusContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchUniverseExplore, fetchUniverseTaxonomy } from '@/services/universe-api';
import { localizeCatalogLabel } from '@/lib/catalog-labels';
import type { TaxonomyCategory, UniverseOmniResult } from '@/types/universe';
import { fNumber } from '@/utils/formatters';

const NEXUS_CATEGORY_IDS = new Set([
  'all',
  'ships',
  'vehicles',
  'armor',
  'clothing',
  'weapons',
  'utility',
  'ammo',
  'sustenance',
  'locations',
  'commodities',
]);

function resolveCategory(raw: string | null | undefined, fallback = 'all'): string {
  if (raw && NEXUS_CATEGORY_IDS.has(raw)) return raw;
  return fallback;
}

function getBadgeClass(color?: string): string {
  switch (color) {
    case 'purple':
      return 'bg-purple-950/90 text-purple-300 border-purple-600';
    case 'amber':
      return 'bg-amber-950/90 text-amber-300 border-amber-600';
    case 'cyan':
      return 'bg-cyan-950/90 text-cyan-300 border-cyan-600';
    case 'emerald':
      return 'bg-emerald-950/90 text-emerald-300 border-emerald-600';
    case 'blue':
      return 'bg-blue-950/90 text-blue-300 border-blue-600';
    case 'rose':
      return 'bg-rose-950/90 text-rose-300 border-rose-600';
    case 'indigo':
      return 'bg-indigo-950/90 text-indigo-300 border-indigo-600';
    case 'lime':
      return 'bg-lime-950/90 text-lime-300 border-lime-600';
    default:
      return 'bg-slate-900 text-slate-300 border-slate-700';
  }
}

function renderCategoryIcon(category: string, size = 40) {
  switch (category) {
    case 'ships':
      return <Rocket size={size} />;
    case 'vehicles':
    case 'components':
      return <Cpu size={size} />;
    case 'armor':
      return <Shield size={size} />;
    case 'clothing':
      return <Shirt size={size} />;
    case 'weapons':
      return <Crosshair size={size} />;
    case 'utility':
      return <Wrench size={size} />;
    case 'ammo':
      return <Disc size={size} />;
    case 'sustenance':
      return <Coffee size={size} />;
    case 'locations':
      return <MapPin size={size} />;
    case 'commodities':
      return <TrendingUp size={size} />;
    default:
      return <Shield size={size} />;
  }
}

type UniverseNexusViewProps = {
  /** Prefer this category when the URL has none (e.g. `/locations`). */
  initialCategory?: string;
};

export function UniverseNexusView({ initialCategory }: UniverseNexusViewProps = {}) {
  const { env } = useEnv();
  const { openNexus } = useEntityNexus();
  const { language, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const categories = [
    { id: 'all', label: t('cat_all'), icon: Sparkles, color: 'text-cyan-400' },
    { id: 'ships', label: t('cat_ships'), icon: Rocket, color: 'text-cyan-400' },
    { id: 'vehicles', label: t('cat_vehicles'), icon: Cpu, color: 'text-amber-400' },
    { id: 'armor', label: t('cat_armor'), icon: Shield, color: 'text-emerald-400' },
    { id: 'clothing', label: t('cat_clothing'), icon: Shirt, color: 'text-indigo-400' },
    { id: 'weapons', label: t('cat_weapons'), icon: Crosshair, color: 'text-rose-400' },
    { id: 'utility', label: t('cat_utility'), icon: Wrench, color: 'text-amber-400' },
    { id: 'ammo', label: t('cat_ammo'), icon: Disc, color: 'text-yellow-400' },
    { id: 'sustenance', label: t('cat_sustenance'), icon: Coffee, color: 'text-lime-400' },
    { id: 'locations', label: t('cat_locations'), icon: MapPin, color: 'text-violet-400' },
    { id: 'commodities', label: t('cat_commodities'), icon: TrendingUp, color: 'text-rose-400' },
  ];

  const [selectedCategory, setSelectedCategory] = useState<string>(() =>
    resolveCategory(searchParams.get('category'), resolveCategory(initialCategory)),
  );
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'flight-ready' | 'in-concept' | 'lore'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  useEffect(() => {
    document.title = t('doc_title');
  }, [language, t]);

  useEffect(() => {
    const fromUrl = resolveCategory(searchParams.get('category'), resolveCategory(initialCategory));
    setSelectedCategory((prev) => (prev === fromUrl ? prev : fromUrl));
  }, [searchParams, initialCategory]);

  useEffect(() => {
    if (pathname !== '/' && pathname !== '/explore') return;
    const current = searchParams.get('category');
    const next = selectedCategory === 'all' ? null : selectedCategory;
    if ((current ?? null) === next) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('category', next);
    else params.delete('category');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [selectedCategory, pathname, router, searchParams]);

  // Live Taxonomy Query
  const { data: taxonomy } = useQuery({
    queryKey: ['universe-taxonomy', env],
    queryFn: () => fetchUniverseTaxonomy(env),
    staleTime: 60_000,
  });

  // Main Exploration Query
  const { data, isLoading } = useQuery({
    queryKey: ['universe-explore', selectedCategory, selectedSubCategory, statusFilter, search, page, env, language],
    queryFn: () =>
      fetchUniverseExplore({
        category: selectedCategory,
        subCategory: selectedSubCategory !== 'all' ? selectedSubCategory : undefined,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page,
        limit: 24,
        env,
        lang: language,
      }),
    staleTime: 30_000,
  });

  const entities: UniverseOmniResult[] = data?.data || [];
  const total = data?.total || 0;
  const pages = data?.pages || 1;

  const activeTaxonomyCategory = taxonomy?.find((c: TaxonomyCategory) => c.id === selectedCategory);
  const subCategories = activeTaxonomyCategory?.subCategories || [];

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    setSelectedSubCategory('all');
    setStatusFilter('all');
    setPage(1);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Cockpit HUD Hero Header */}
      <div className="relative rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-cyan-500/20 p-6 sm:p-8 overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-mono-sc">
            <Sparkles size={13} className="animate-pulse" />
            <span>{t('hero_badge')}</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black font-rajdhani text-white tracking-wide">
            {t('hero_title')}
          </h1>
          <p className="text-sm sm:text-base text-slate-300 font-rajdhani leading-relaxed">
            {t('hero_desc')}
          </p>
        </div>
      </div>

      {/* Cockpit Unified Command Console */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-3 sm:p-4 space-y-3 backdrop-blur-md shadow-xl">
        {/* Category Pills Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = selectedCategory === cat.id;
            const catTax = taxonomy?.find((c: TaxonomyCategory) => c.id === cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono-sc uppercase tracking-wider transition-all shrink-0 ${
                  isActive
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-sm font-semibold'
                    : 'bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800/60 border border-slate-800/60'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-cyan-400' : 'text-slate-500'} />
                <span>{cat.label}</span>
                {catTax?.total ? (
                  <span className="text-[10px] opacity-60 font-mono">({catTax.total})</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Dynamic Sub-Category Pills Bar (when category is selected and has subcategories) */}
        {subCategories.length > 0 && selectedCategory !== 'all' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1.5 border-t border-slate-800/60 scrollbar-none">
            <span className="text-[10px] font-mono-sc text-slate-500 uppercase shrink-0 mr-1 hidden sm:inline">
              {language === 'fr' ? 'Sous-catégorie :' : 'Subcategory:'}
            </span>
            <button
              onClick={() => {
                setSelectedSubCategory('all');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-mono-sc transition-all shrink-0 border ${
                selectedSubCategory === 'all'
                  ? 'bg-slate-800 text-cyan-300 border-cyan-500/50 font-bold shadow-sm'
                  : 'bg-slate-950/40 text-slate-400 hover:text-slate-200 border-slate-800/60'
              }`}
            >
              {t('sub_all')} ({activeTaxonomyCategory?.total || total})
            </button>
            {subCategories.map((sub) => {
              const isSubActive = selectedSubCategory === sub.id;
              const label = language === 'fr' ? sub.label_fr : sub.label_en;
              return (
                <button
                  key={sub.id}
                  onClick={() => {
                    setSelectedSubCategory(sub.id);
                    setPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono-sc transition-all shrink-0 border ${
                    isSubActive
                      ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500/60 font-bold shadow-sm'
                      : 'bg-slate-950/40 text-slate-400 hover:text-slate-200 border-slate-800/60'
                  }`}
                >
                  <span>{label}</span>
                  <span className="text-[10px] opacity-75 font-mono">({sub.count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Action Controls Deck */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
          {/* Search Box with Clear Button & Shortcut Badge */}
          <div className="relative flex-1 max-w-lg">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('filter_placeholder')}
              className="w-full pl-8 pr-16 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800/90 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-rajdhani transition-colors"
            />
            {search ? (
              <button
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
                title="Effacer"
              >
                <X size={13} />
              </button>
            ) : (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono-sc text-slate-600 border border-slate-800 px-1.5 py-0.5 rounded bg-slate-900 pointer-events-none">
                Ctrl+K
              </span>
            )}
          </div>

          {/* Status Filters (for all and ships when not selected through subcategories) */}
          {selectedCategory === 'all' && (
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono-sc">
              <span className="text-slate-500 uppercase mr-1 hidden lg:inline">Statut:</span>
              {[
                { id: 'all', label: language === 'fr' ? 'Tous' : 'All' },
                { id: 'flight-ready', label: language === 'fr' ? 'En vol' : 'Flight-Ready' },
                { id: 'in-concept', label: language === 'fr' ? 'Concept' : 'Concept' },
                { id: 'lore', label: language === 'fr' ? 'Lore / SQ42' : 'Lore / SQ42' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => {
                    setStatusFilter(st.id as any);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all shrink-0 border ${
                    statusFilter === st.id
                      ? 'bg-slate-800 text-white border-cyan-500/50 font-bold'
                      : 'bg-slate-950/40 text-slate-400 hover:text-slate-300 border-slate-800/60'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}

          {/* Counter & View Switcher */}
          <div className="flex items-center justify-between md:justify-end gap-3 text-xs font-mono-sc text-slate-400 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>
                {isLoading ? t('loading_explorer') : t('entities_indexed', { count: fNumber(total) })}
              </span>
            </div>
            <div className="flex items-center gap-1 border-l border-slate-800 pl-3">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'text-slate-500 hover:text-slate-300'}`}
                title={t('grid_view')}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'table' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'text-slate-500 hover:text-slate-300'}`}
                title={t('table_view')}
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Entities Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-56 rounded-xl bg-slate-900/40 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : entities.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {entities.map((item) => (
              <motion.div
                key={`${item.category}-${item.id}`}
                layout
                whileHover={{ y: -3 }}
                transition={{ duration: 0.15 }}
                className="group relative rounded-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/40 shadow-lg hover:shadow-cyan-950/30 overflow-hidden flex flex-col justify-between transition-all"
              >
                <div>
                  {/* Thumbnail Banner */}
                  <div className="relative w-full h-36 bg-slate-900 flex items-center justify-center overflow-hidden border-b border-slate-800/80">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="text-slate-700 group-hover:text-cyan-500/50 transition-colors">
                        {renderCategoryIcon(item.category, 40)}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />

                    {/* Badge */}
                    {item.badge && (
                      <div className="absolute top-2.5 right-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono-sc font-medium border ${getBadgeClass(
                            item.badge.color,
                          )}`}
                        >
                          {localizeCatalogLabel(language, item.badge.label)}
                        </span>
                      </div>
                    )}

                    {/* Manufacturer or Category Tag */}
                    <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-[10px] font-mono-sc text-slate-400">
                        {item.manufacturer || localizeCatalogLabel(language, item.category)}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-2">
                    <h3 className="font-bold text-white group-hover:text-cyan-300 font-rajdhani text-lg leading-tight transition-colors line-clamp-1">
                      {item.name}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono-sc line-clamp-1">
                      {localizeCatalogLabel(language, item.type)}
                      {item.subType ? ` • ${localizeCatalogLabel(language, item.subType)}` : ''}
                    </p>
                  </div>
                </div>

                {/* Footer Meta / Pivot CTA */}
                <div className="p-4 pt-0 flex items-center justify-between border-t border-slate-900 mt-2">
                  <div className="text-xs font-mono-sc">
                    {item.priceAuec ? (
                      <span className="text-emerald-400 font-bold">{fNumber(item.priceAuec)} aUEC</span>
                    ) : item.storePriceUsd ? (
                      <span className="text-cyan-400 font-bold">${item.storePriceUsd} USD</span>
                    ) : (
                      <span className="text-slate-600 uppercase text-[10px]">{t('in_game')}</span>
                    )}
                  </div>

                  <button
                    onClick={() => openNexus(item.category, item.id)}
                    className="flex items-center gap-1 text-xs font-mono-sc text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>{t('inspect')}</span>
                    <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          /* Table View */
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden">
            <table className="w-full text-left text-xs font-mono-sc text-slate-300">
              <thead className="bg-slate-900/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">{language === 'fr' ? 'Nom' : 'Name'}</th>
                  <th className="px-4 py-3">{language === 'fr' ? 'Catégorie' : 'Category'}</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">{language === 'fr' ? 'Constructeur / Lieu' : 'Manufacturer / Location'}</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {entities.map((item) => (
                  <tr
                    key={`${item.category}-${item.id}`}
                    onClick={() => openNexus(item.category, item.id)}
                    className="hover:bg-slate-900/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-white font-rajdhani text-sm">
                      {item.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] uppercase text-cyan-300">
                        {localizeCatalogLabel(language, item.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{localizeCatalogLabel(language, item.type)}</td>
                    <td className="px-4 py-3 text-slate-400">{item.manufacturer || item.system || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-cyan-400 hover:text-cyan-300">{t('inspect')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="py-24 text-center space-y-3">
          <p className="text-slate-400 font-rajdhani text-lg">{t('no_results')}</p>
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('all');
              setSelectedSubCategory('all');
              setSelectedCategory('all');
            }}
            className="px-4 py-2 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-300 text-xs font-mono-sc hover:bg-cyan-900 transition-colors"
          >
            {language === 'fr' ? 'Réinitialiser les filtres' : 'Reset filters'}
          </button>
        </div>
      )}

      {/* Pagination Controls */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-4 py-1.5 text-xs font-mono-sc text-slate-400 bg-slate-950 border border-slate-800 rounded-lg">
            {t('page_of', { page, pages })}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
