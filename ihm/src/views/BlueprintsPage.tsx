'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Clock,
  ClipboardList,
  FlaskConical,
  Layers,
  Link as LinkIcon,
  Package,
  Scroll,
  Search,
  Settings2,
  Skull,
  Swords,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CraftingRecipe } from '@/types/api';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { useDebounce } from '@/hooks/useDebounce';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(s: number | null): string {
  if (!s) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function fmtReward(min: number | null, max: number | null): string {
  if (min == null && max == null) return '';
  if (min != null && max != null && min !== max)
    return `${min.toLocaleString('en-US')}–${max.toLocaleString('en-US')} aUEC`;
  return `${(max ?? min ?? 0).toLocaleString('en-US')} aUEC`;
}

function fmtName(r: CraftingRecipe): string {
  return r.display_name ?? r.name ?? r.class_name;
}

function cleanUnitFormat(raw: string | null | undefined): string {
  if (!raw || raw === '@LOC_EMPTY') return '';
  if (raw.startsWith('@StatUnits_')) return raw.slice('@StatUnits_'.length).replace(/_/g, ' ');
  if (raw.startsWith('@')) return '';
  return raw;
}

const ADDITIVE_TYPE = 'CraftingGameplayPropertyModifierValueRange_LinearIntegerAdditive';

function isAdditive(modifierType: string | null | undefined): boolean {
  return modifierType === ADDITIVE_TYPE;
}

function fmtModifierValue(v: number, additive: boolean): string {
  if (additive) {
    const sign = v >= 0 ? '+' : '';
    return `${sign}${Math.round(v)}`;
  }
  return `×${v.toFixed(2)}`;
}

function modifierColor(v: number, additive: boolean): string {
  const positive = additive ? v > 0 : v > 1;
  const negative = additive ? v < 0 : v < 1;
  if (positive) return 'text-green-400';
  if (negative) return 'text-red-400';
  return 'text-slate-400';
}

// ── Category color map ────────────────────────────────────────────────────────

type BadgeColor = 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate';

const CAT_COLOR: Record<string, BadgeColor> = {
  FPSArmours:  'amber',
  FPSWeapons:  'red',
  Misc:        'slate',
  Tool:        'cyan',
  Food:        'green',
  Drink:       'cyan',
  Medicine:    'purple',
  Ammunition:  'red',
  Component:   'slate',
  Refining:    'amber',
  Explosive:   'red',
};

function getCatColor(cat: string | null): BadgeColor {
  return CAT_COLOR[cat ?? ''] ?? 'slate';
}

const CAT_ICON: Record<string, React.ReactNode> = {
  FPSArmours:  <Layers size={10} />,
  FPSWeapons:  <Swords size={10} />,
  Tool:        <Settings2 size={10} />,
  Food:        <Package size={10} />,
  Drink:       <Package size={10} />,
  Medicine:    <Trophy size={10} />,
  Ammunition:  <Skull size={10} />,
  Component:   <Zap size={10} />,
  Refining:    <FlaskConical size={10} />,
};

function getCatIcon(cat: string | null): React.ReactNode {
  return CAT_ICON[cat ?? ''] ?? <Scroll size={10} />;
}

// ── BlueprintCard ─────────────────────────────────────────────────────────────

function BlueprintCard({
  r,
  isSelected,
  onClick,
}: { r: CraftingRecipe; isSelected: boolean; onClick: () => void }) {
  const color = getCatColor(r.category);
  const borderColors: Record<BadgeColor, string> = {
    cyan:   'border-l-cyan-600',
    amber:  'border-l-amber-500',
    green:  'border-l-green-500',
    red:    'border-l-red-500',
    purple: 'border-l-purple-500',
    slate:  'border-l-slate-600',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group w-full text-left px-4 py-3 rounded-sm border border-l-2 transition-all duration-150',
        borderColors[color],
        isSelected
          ? 'bg-purple-950/20 border-t-purple-900/60 border-r-purple-900/60 border-b-purple-900/60'
          : 'bg-panel/60 border-t-border border-r-border border-b-border hover:border-t-slate-700 hover:border-r-slate-700 hover:border-b-slate-700 hover:bg-white/[0.02]',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div className={`shrink-0 mt-0.5 flex items-center justify-center w-6 h-6 rounded-sm bg-${color}-950/60 border border-${color}-900/60 text-${color}-400`}>
          {getCatIcon(r.category)}
        </div>

        <div className="flex-1 min-w-0">
          {/* Output item */}
          {(r.display_output_item_name ?? r.output_item_name) && (
            <p className="text-[10px] font-mono-sc text-purple-400/80 uppercase tracking-widest truncate leading-tight mb-0.5">
              {r.display_output_item_name ?? r.output_item_name}
            </p>
          )}
          {/* Name */}
          <p className={`font-rajdhani font-semibold text-sm leading-tight truncate ${isSelected ? 'text-purple-100' : 'text-slate-200 group-hover:text-slate-100'}`}>
            {fmtName(r)}
          </p>

          {/* Tags */}
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {r.category && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-${color}-950/40 border-${color}-900/60 text-${color}-400`}>
                {getCatIcon(r.category)} {r.display_category ?? r.category}
              </span>
            )}
            {r.station_type && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-slate-900/60 border-slate-700 text-slate-400">
                <Settings2 size={8} /> {r.display_station_type ?? r.station_type}
              </span>
            )}
            {r.skill_level != null && r.skill_level > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-amber-950/40 border-amber-900/60 text-amber-400">
                <Trophy size={8} /> Lvl {r.skill_level}
              </span>
            )}
            {((r.missions_count ?? r.unlock_missions?.length ?? 0) > 0) && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono-sc px-1.5 py-0.5 rounded-sm border bg-cyan-950/40 border-cyan-900/60 text-cyan-400">
                <ClipboardList size={8} /> {r.missions_count ?? r.unlock_missions!.length} mission{(r.missions_count ?? r.unlock_missions!.length) > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {r.output_quantity > 1 && (
            <span className="text-xs font-orbitron text-slate-400">×{r.output_quantity}</span>
          )}
          {r.crafting_time_s != null && (
            <span className="text-[10px] font-mono-sc text-slate-600 flex items-center gap-0.5">
              <Clock size={9} />{fmtTime(r.crafting_time_s)}
            </span>
          )}
          {r.ingredients && (
            <span className="text-[10px] font-mono-sc text-slate-600">
              {r.ingredients.length} ing.
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

function DetailPanel({ r, env }: { r: CraftingRecipe; env: string }) {
  const color = getCatColor(r.category);

  // Fetch full recipe (with ingredients + modifiers + missions) if not already loaded
  const { data: full } = useQuery({
    queryKey: ['blueprints.recipe', r.uuid, env],
    queryFn: () => api.crafting.recipe(r.uuid, env),
    staleTime: 5 * 60_000,
    initialData: r.ingredients ? r : undefined,
  });
  const recipe = full ?? r;

  return (
    <ScifiPanel title="Blueprint Detail" subtitle={recipe.class_name}>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {recipe.category && (
            <GlowBadge color={color}>
              {getCatIcon(recipe.category)} {recipe.display_category ?? recipe.category}
            </GlowBadge>
          )}
          {recipe.station_type && (
            <GlowBadge color="slate">
              <Settings2 size={10} /> {recipe.display_station_type ?? recipe.station_type}
            </GlowBadge>
          )}
          {recipe.skill_level != null && recipe.skill_level > 0 && (
            <GlowBadge color="amber"><Trophy size={10} /> Skill Lvl {recipe.skill_level}</GlowBadge>
          )}
        </div>
        <h3 className="font-orbitron text-base text-slate-100 leading-snug">{fmtName(recipe)}</h3>
        {(recipe.display_output_item_name ?? recipe.output_item_name) && (
          <p className="text-xs text-purple-400 font-mono-sc mt-0.5 flex items-center gap-1 flex-wrap">
            <span>→</span>
            {recipe.output_item_uuid ? (
              <Link
                href={`/items/${recipe.output_item_uuid}`}
                className="hover:text-purple-200 underline underline-offset-2 decoration-purple-800 flex items-center gap-0.5"
              >
                {recipe.display_output_item_name ?? recipe.output_item_name}
                <LinkIcon size={9} className="opacity-50" />
              </Link>
            ) : (
              <span>{recipe.display_output_item_name ?? recipe.output_item_name}</span>
            )}
            {recipe.output_quantity > 1 && <span>×{recipe.output_quantity}</span>}
          </p>
        )}
      </div>

      <div className="space-y-2">
        {/* Info row */}
        <div className="grid grid-cols-2 gap-2">
          {recipe.crafting_time_s != null && (
            <div className="sci-panel p-2.5">
              <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
                <Clock size={9} /> Crafting Time
              </p>
              <p className="text-sm font-orbitron text-slate-200">{fmtTime(recipe.crafting_time_s)}</p>
            </div>
          )}
          {recipe.station_type && (
            <div className="sci-panel p-2.5">
              <p className="text-[10px] text-slate-600 font-mono-sc uppercase flex items-center gap-1 mb-0.5">
                <Settings2 size={9} /> Station
              </p>
              <p className="text-sm font-mono-sc text-slate-200">{recipe.display_station_type ?? recipe.station_type}</p>
            </div>
          )}
        </div>

        {/* Ingredients */}
        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <div className="sci-panel p-3">
            <p className="text-[10px] font-mono-sc text-purple-500 uppercase flex items-center gap-1 mb-2">
              <FlaskConical size={10} /> Ingredients ({recipe.ingredients.length})
            </p>
            <div className="space-y-1.5">
              {recipe.ingredients.map((ing) => (
                <div key={ing.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-800/60 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono-sc text-slate-200 truncate">
                      {ing.item_uuid ? (
                        <Link
                          href={`/items/${ing.item_uuid}`}
                          className="hover:text-cyan-300 underline underline-offset-2 decoration-slate-700 inline-flex items-center gap-0.5"
                        >
                          {ing.display_item_name ?? ing.item_name}
                          <LinkIcon size={8} className="opacity-40 shrink-0" />
                        </Link>
                      ) : (
                        ing.display_item_name ?? ing.item_name
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {ing.slot_name && (
                        <p className="text-[10px] text-slate-600 truncate">
                          {ing.display_slot_name ?? ing.slot_name}
                        </p>
                      )}
                      {ing.scu != null && ing.scu > 0 && (
                        <span className="text-[10px] text-slate-600 font-mono-sc">{ing.scu} SCU</span>
                      )}
                      {ing.min_quality > 0 && (
                        <span className="text-[10px] text-slate-600 font-mono-sc">min q{ing.min_quality}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {ing.is_optional && (
                      <span className="text-[9px] text-slate-600 font-mono-sc">optional</span>
                    )}
                    <span className="font-orbitron text-sm text-amber-400 min-w-[24px] text-right">
                      ×{ing.quantity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Slot modifiers */}
        {recipe.modifiers && recipe.modifiers.length > 0 && (
          <div className="sci-panel p-3">
            <p className="text-[10px] font-mono-sc text-cyan-500 uppercase flex items-center gap-1 mb-2">
              <Zap size={10} /> Quality Modifiers
            </p>
            <div className="space-y-1.5">
              {recipe.modifiers.map((mod) => {
                const unit = cleanUnitFormat(mod.unit_format);
                return (
                  <div key={mod.id} className="flex items-start justify-between gap-2 py-1 border-b border-slate-800/60 last:border-0">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-slate-300 font-mono-sc">
                        {mod.display_property_name ?? mod.property_name}
                      </span>
                      {unit && (
                        <span className="text-[10px] text-slate-600 ml-1">({unit})</span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <div className="flex items-center gap-0.5 text-xs font-orbitron">
                        {(() => {
                          const additive = isAdditive(mod.modifier_type);
                          return (
                            <>
                              <span className={modifierColor(mod.modifier_at_start, additive)}>
                                {fmtModifierValue(mod.modifier_at_start, additive)}
                              </span>
                              <span className="text-slate-700">→</span>
                              <span className={modifierColor(mod.modifier_at_end, additive)}>
                                {fmtModifierValue(mod.modifier_at_end, additive)}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                      <span className="text-[10px] text-slate-600">
                        q{mod.start_quality}–q{mod.end_quality}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Associated missions */}
        {recipe.unlock_missions && recipe.unlock_missions.length > 0 && (
          <div className="sci-panel p-3 bg-cyan-950/10 border-cyan-900/30">
            <p className="text-[10px] font-mono-sc text-cyan-500 uppercase flex items-center gap-1 mb-2">
              <ClipboardList size={10} /> Unlock Blueprint ({recipe.unlock_missions.length})
            </p>
            <div className="space-y-1.5">
              {recipe.unlock_missions.map((m) => (
                <Link
                  key={m.uuid}
                  href={`/missions?selected=${m.uuid}`}
                  className="flex items-start justify-between gap-2 p-2 rounded-sm bg-slate-900/40 border border-slate-800 hover:border-cyan-800 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-rajdhani font-semibold text-slate-200 group-hover:text-cyan-300 truncate">
                      {m.title ?? m.class_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {m.faction && (
                        <span className="text-[10px] font-mono-sc text-purple-400">{m.faction}</span>
                      )}
                      {m.mission_type && (
                        <span className="text-[10px] font-mono-sc text-slate-600">{m.mission_type}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(m.reward_max ?? m.reward_min) != null && (
                      <span className="text-xs font-orbitron text-amber-400">
                        {fmtReward(m.reward_min, m.reward_max)}
                      </span>
                    )}
                    <LinkIcon size={10} className="text-slate-700 group-hover:text-cyan-500" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Technical footer */}
        <div className="sci-panel p-2 border-slate-800/40 bg-slate-900/30">
          <p className="text-[10px] font-mono-sc text-slate-600 break-all">{recipe.class_name}</p>
        </div>
      </div>
    </ScifiPanel>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

function FilterChips({
  options,
  value,
  onChange,
  colorFn,
  labelFn,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  colorFn?: (opt: string) => BadgeColor;
  labelFn?: (opt: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        onClick={() => onChange('')}
        className={`px-2 py-1 rounded-sm text-xs font-mono-sc transition-colors border ${!value ? 'bg-cyan-950/60 text-cyan-400 border-cyan-800' : 'text-slate-500 hover:text-slate-300 border-transparent hover:border-border'}`}
      >
        All
      </button>
      {options.map((opt) => {
        const c = colorFn?.(opt) ?? 'slate';
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? '' : opt)}
            className={`flex items-center gap-0.5 px-2 py-1 rounded-sm text-xs font-mono-sc transition-colors border ${active ? `bg-${c}-950/60 text-${c}-400 border-${c}-800` : 'text-slate-500 hover:text-slate-300 border-transparent hover:border-border'}`}
          >
            {labelFn ? labelFn(opt) : opt}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BlueprintsPage() {
  const searchParams = useSearchParams();
  const { env } = useEnv();

  const [search, setSearch] = useState(searchParams?.get('search') ?? '');
  const [category, setCategory] = useState('');
  const [stationType, setStationType] = useState('');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(searchParams?.get('recipe') ?? null);
  const debouncedSearch = useDebounce(search, 350);

  const { data: categories } = useQuery({
    queryKey: ['crafting.categories', env],
    queryFn: () => api.crafting.categories(env),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data: stationTypes } = useQuery({
    queryKey: ['crafting.stationTypes', env],
    queryFn: () => api.crafting.stationTypes(env),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['blueprints.list', env, { search: debouncedSearch, category, stationType }],
    queryFn: () =>
      api.crafting.recipes({
        env,
        search: debouncedSearch || undefined,
        category: category || undefined,
        stationType: stationType || undefined,
        limit: 500,
      }),
  });

  const recipes = useMemo(() => data?.data ?? [], [data]);

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.uuid === selectedUuid) ?? null,
    [recipes, selectedUuid],
  );

  const hasFilters = !!(debouncedSearch || category || stationType);

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm border border-purple-800 bg-purple-950/40 flex items-center justify-center shrink-0">
              <Scroll size={18} className="text-purple-400" />
            </div>
            <div>
              <h1 className="font-orbitron text-xl font-bold text-purple-400 tracking-widest uppercase leading-none">
                Blueprint Database
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 font-mono-sc">
                {(data?.total ?? recipes.length).toLocaleString('en-US')} blueprints
                {categories && ` · ${categories.length} categories`}
              </p>
            </div>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blueprint, output item…"
              className="sci-input w-full pl-8 text-xs"
            />
          </div>
        </div>

        {/* Filter bar */}
        <div className="sci-panel p-3 space-y-3">
          {categories && categories.length > 0 && (
            <div>
              <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">Category</p>
              <FilterChips
                options={categories.map((c) => c.category)}
                value={category}
                onChange={setCategory}
                colorFn={getCatColor}
                labelFn={(opt) => categories.find((c) => c.category === opt)?.displayCategory ?? categories.find((c) => c.category === opt)?.display_category ?? opt}
              />
            </div>
          )}
          {stationTypes && stationTypes.length > 0 && (
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-orbitron text-slate-600 tracking-widest uppercase mb-1.5">Station Type</p>
                <FilterChips
                  options={stationTypes}
                  value={stationType}
                  onChange={setStationType}
                />
              </div>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setCategory(''); setStationType(''); }}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors ml-auto"
                >
                  <X size={12} /> Reset filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
        {/* Blueprint list */}
        <div>
          {isLoading ? (
            <LoadingGrid message="LOADING BLUEPRINTS…" />
          ) : error ? (
            <ErrorState error={error as Error} onRetry={() => void refetch()} />
          ) : !recipes.length ? (
            <EmptyState icon="📜" title="No blueprints found" />
          ) : (
            <div className="space-y-1.5">
              {recipes.map((r, i) => (
                <motion.div
                  key={r.uuid}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.008, 0.3) }}
                >
                  <BlueprintCard
                    r={r}
                    isSelected={selectedUuid === r.uuid}
                    onClick={() => setSelectedUuid(r.uuid)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="xl:sticky xl:top-6">
          {selectedRecipe ? (
            <DetailPanel r={selectedRecipe} env={env} />
          ) : (
            <ScifiPanel title="Blueprint Detail" subtitle="Select a blueprint">
              <p className="text-xs text-slate-500">Click a blueprint in the list to view its details, ingredients and associated missions.</p>
            </ScifiPanel>
          )}
        </div>
      </div>
    </div>
  );
}
