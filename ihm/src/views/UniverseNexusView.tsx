'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Rocket,
  Zap,
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
} from 'lucide-react';
import { useEnv } from '@/contexts/EnvContext';
import { useEntityNexus } from '@/contexts/NexusContext';
import { fetchUniverseExplore } from '@/services/universe-api';
import type { UniverseOmniResult } from '@/types/universe';
import { fNumber } from '@/utils/formatters';

const CATEGORIES = [
  { id: 'all', label: "Tout l'Univers", icon: Sparkles, color: 'text-cyan-400' },
  { id: 'ships', label: 'Flotte & Véhicules', icon: Rocket, color: 'text-cyan-400' },
  { id: 'components', label: 'Composants & Armes', icon: Zap, color: 'text-amber-400' },
  { id: 'items', label: 'Équipement FPS', icon: Shield, color: 'text-emerald-400' },
  { id: 'locations', label: 'Lieux & Stations', icon: MapPin, color: 'text-violet-400' },
  { id: 'commodities', label: 'Marché & Commerce', icon: TrendingUp, color: 'text-rose-400' },
];

export function UniverseNexusView() {
  const { env } = useEnv();
  const { openNexus } = useEntityNexus();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const { data, isLoading } = useQuery({
    queryKey: ['universe-explore', selectedCategory, search, page, env],
    queryFn: () =>
      fetchUniverseExplore({
        category: selectedCategory,
        search: search || undefined,
        page,
        limit: 24,
        env,
      }),
    staleTime: 30_000,
  });

  const entities: UniverseOmniResult[] = data?.data || [];
  const total = data?.total || 0;
  const pages = data?.pages || 1;

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
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
            <span>UNIVERS CONNECTÉ STAR CITIZEN 4.10.2</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black font-rajdhani text-white tracking-wide">
            STARVIS — NEXUS UNIVERSEL
          </h1>
          <p className="text-sm sm:text-base text-slate-300 font-rajdhani leading-relaxed">
            Fin des silos cloisonnés : naviguez d'un vaisseau vers ses armes, les stations qui le vendent,
            les prix aUEC et la Starmap en temps réel, sans aucune coupure de contexte.
          </p>
        </div>
      </div>

      {/* Fluid Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-mono-sc uppercase tracking-wider transition-all shrink-0 ${
                isActive
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/60 shadow-lg shadow-cyan-950/50'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800/80'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-cyan-400' : 'text-slate-500'} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Control Bar: Search Input, View Mode, Counter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800/80">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Filtrer par nom humain (ex: Gladius, Panther, MicroTech)..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-rajdhani"
          />
        </div>

        {/* Counter & View Switcher */}
        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs font-mono-sc text-slate-400">
          <span>
            {isLoading ? 'Chargement...' : `${fNumber(total)} entité(s) répertoriée(s)`}
          </span>
          <div className="flex items-center gap-1 border-l border-slate-800 pl-3">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'text-slate-500 hover:text-slate-300'}`}
              title="Vue Grille"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'text-slate-500 hover:text-slate-300'}`}
              title="Vue Télémétrique"
            >
              <List size={15} />
            </button>
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
                        {item.category === 'ships' ? (
                          <Rocket size={40} />
                        ) : item.category === 'components' ? (
                          <Zap size={40} />
                        ) : item.category === 'locations' ? (
                          <MapPin size={40} />
                        ) : item.category === 'commodities' ? (
                          <TrendingUp size={40} />
                        ) : (
                          <Shield size={40} />
                        )}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />

                    {/* Badge */}
                    {item.badge && (
                      <div className="absolute top-2.5 right-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono-sc font-medium border ${
                            item.badge.color === 'purple'
                              ? 'bg-purple-950/90 text-purple-300 border-purple-600'
                              : item.badge.color === 'amber'
                              ? 'bg-amber-950/90 text-amber-300 border-amber-600'
                              : item.badge.color === 'cyan'
                              ? 'bg-cyan-950/90 text-cyan-300 border-cyan-600'
                              : 'bg-slate-900/90 text-slate-300 border-slate-700'
                          }`}
                        >
                          {item.badge.label}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Body Info */}
                  <div className="p-4 space-y-1.5">
                    <span className="text-[11px] font-mono-sc text-cyan-400 block truncate">
                      {item.manufacturer || (item.system ? `Système ${item.system}` : item.category)}
                    </span>
                    <h3 className="font-bold text-base font-rajdhani text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                      {item.name}
                    </h3>
                    <p className="text-xs font-mono-sc text-slate-400 truncate">
                      {item.type} {item.subType ? `• ${item.subType}` : ''}
                    </p>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="px-4 py-3 border-t border-slate-900 bg-slate-950/40 flex items-center justify-between">
                  {item.priceAuec ? (
                    <span className="text-xs font-bold font-mono-sc text-emerald-400">
                      {fNumber(Math.round(item.priceAuec))} aUEC
                    </span>
                  ) : item.storePriceUsd ? (
                    <span className="text-xs font-bold font-mono-sc text-slate-300">
                      ${item.storePriceUsd} USD
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono-sc text-slate-500 uppercase">En jeu</span>
                  )}

                  <button
                    onClick={() => openNexus(item.category, item.id)}
                    className="flex items-center gap-1 text-xs font-mono-sc text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>Inspecter</span>
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
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">Famille</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Constructeur / Lieu</th>
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
                        {item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{item.type}</td>
                    <td className="px-4 py-3 text-slate-400">{item.manufacturer || item.system || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-cyan-400 hover:text-cyan-300">Inspecter →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="py-24 text-center space-y-3">
          <p className="text-slate-400 font-rajdhani text-lg">Aucune entité trouvée pour cette sélection.</p>
          <button
            onClick={() => {
              setSearch('');
              setSelectedCategory('all');
            }}
            className="px-4 py-2 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-300 text-xs font-mono-sc"
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}

      {/* Pagination Controls */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border border-slate-800 bg-slate-900/60 disabled:opacity-40 text-slate-300 hover:text-white"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-mono-sc text-slate-400 px-3">
            Page {page} sur {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="p-2 rounded-lg border border-slate-800 bg-slate-900/60 disabled:opacity-40 text-slate-300 hover:text-white"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
