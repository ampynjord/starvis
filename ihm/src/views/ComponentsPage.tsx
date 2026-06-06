'use client';

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/services/api";
import { useEnv } from "@/contexts/EnvContext";
import { LoadingGrid } from "@/components/ui/LoadingGrid";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlowBadge } from "@/components/ui/GlowBadge";
import { useListQueryState } from "@/hooks/useListQueryState";
import {
  COMPONENT_TYPE_COLORS,
  COMPONENT_TYPE_LABELS,
  GAME_COMPONENT_CATEGORIES,
  GAME_COMPONENT_CATEGORY_TYPES,
  type GameComponentCategory,
} from "@/utils/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import type { ComponentListItem } from "@/types/api";
import { getComponentMetricGroups, getComponentPrimaryMetrics } from "@/utils/componentMetrics";

const LIMIT = 30;

// ── P4K-faithful category taxonomy ────────────────────────────────────────────

interface CategoryDef {
  label: GameComponentCategory;
  slug: string;
  types: string[];
  subcategories?: ComponentSubcategory[];
}

interface CategoryFilterConfig {
  damage?: boolean;
  size?: boolean;
  grade?: boolean;
  componentClass?: boolean;
  bespoke?: boolean;
  manufacturer?: boolean;
}

interface ComponentSubcategory {
  key: string;
  label: string;
  types?: string[];
  subTypes?: string[];
  weaponDamageType?: string;
  cmType?: string;
}

const categorySlug = (category: string) => category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const CATEGORY_SUBCATEGORIES: Partial<Record<GameComponentCategory, ComponentSubcategory[]>> = {
  Ordnance: [
    { key: "missile", label: "Missile", subTypes: ["Missile"] },
    { key: "torpedo", label: "Torpedo", subTypes: ["Torpedo"] },
    { key: "bomb", label: "Bomb", subTypes: ["Bomb"] },
    { key: "rockets", label: "Rockets", subTypes: ["Rocket"] },
  ],
  Utility: [
    { key: "mining-laser", label: "Mining Laser", types: ["MiningLaser"] },
    { key: "mining-laser-gadget", label: "Mining Laser Gadget", types: ["MiningArm", "MiningModifier"] },
    { key: "salvage-head", label: "Salvage Head", types: ["SalvageHead"] },
    { key: "tractor-beam", label: "Tractor Beam", types: ["TractorBeam"] },
  ],
  "Ordnance Racks": [
    { key: "missile-racks", label: "Missile Racks", types: ["MissileRack"], subTypes: ["Missile", "MissileRack", "Missile Rack"] },
    { key: "torpedo-racks", label: "Torpedo Racks", types: ["TorpedoRack", "MissileRack"], subTypes: ["Torpedo", "TorpedoRack", "Torpedo Rack"] },
    { key: "bomb-racks", label: "Bomb Racks", types: ["BombRack", "MissileRack"], subTypes: ["Bomb", "BombRack", "Bomb Rack"] },
    { key: "rocket-pods", label: "Rocket Pods", types: ["RocketPod", "MissileRack"], subTypes: ["Rocket", "RocketPod", "Rocket Pod"] },
  ],
  Turrets: [
    { key: "manned-turrets", label: "Manned Turrets", types: ["Turret", "TurretBase"] },
    { key: "remote-turrets", label: "Remote Turrets", types: ["TurretUnmanned"] },
  ],
  Weapons: [
    { key: "beam", label: "Beam", subTypes: ["Beam"] },
    { key: "cannon", label: "Cannon", subTypes: ["Cannon"] },
    { key: "gatling", label: "Gatling", subTypes: ["Gatling"] },
    { key: "repeater", label: "Repeater", subTypes: ["Repeater"] },
    { key: "scattergun", label: "Scattergun", subTypes: ["Scattergun"] },
  ],
  CM: [
    { key: "noise", label: "Noise", cmType: "Noise" },
    { key: "decoy", label: "Decoy", cmType: "Decoy" },
  ],
};

const WEAPON_DAMAGE_TYPES = ["Ballistic", "Laser", "Distortion", "Plasma", "Tachyon"];
const COMPONENT_CLASS_FILTERS = ["Civilian", "Military", "Competition", "Stealth", "Industrial"];
const DEFAULT_FILTER_CONFIG: CategoryFilterConfig = {
  damage: false,
  size: true,
  grade: true,
  componentClass: true,
  bespoke: true,
  manufacturer: true,
};
const CATEGORY_FILTER_CONFIG: Partial<Record<GameComponentCategory, CategoryFilterConfig>> = {
  Liveries: { damage: false, size: false, grade: false, componentClass: false, bespoke: false, manufacturer: true },
  "Jump Modules": { size: true, bespoke: true, manufacturer: true },
  Radar: { size: true, bespoke: true, manufacturer: true },
  EMP: { size: true, bespoke: true, manufacturer: true },
  QI: { size: true, bespoke: true, manufacturer: true },
  Turrets: { size: true, bespoke: true, manufacturer: true },
  CM: { size: true, bespoke: true, manufacturer: true },
  Weapons: { ...DEFAULT_FILTER_CONFIG, damage: true },
};

const CATEGORIES: CategoryDef[] = GAME_COMPONENT_CATEGORIES.map((label) => ({
  label,
  slug: categorySlug(label),
  types: GAME_COMPONENT_CATEGORY_TYPES[label],
  subcategories: CATEGORY_SUBCATEGORIES[label],
}));

function ComponentStats({ comp }: { comp: ComponentListItem }) {
  const rendered = getComponentPrimaryMetrics(comp);
  if (!rendered.length) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {rendered.map((s) => (
        <span key={s.label} className="flex items-center gap-1">
          <span className="text-[10px] font-mono-sc text-slate-600 uppercase">{s.label}</span>
          <span className="text-xs font-mono-sc text-slate-300 font-semibold">{s.value}</span>
        </span>
      ))}
    </div>
  );
}

function ComponentMetricStrip({ comp }: { comp: ComponentListItem }) {
  const groups = getComponentMetricGroups(comp).filter((group) => group.key !== "identity");
  if (!groups.length) return null;

  return (
    <div className="mt-3 overflow-x-auto pb-1">
      <div className="flex gap-2 min-w-max">
        {groups.map((group) => (
          <div
            key={group.key}
            className="min-w-44 rounded-sm border border-slate-800/80 bg-slate-950/35 px-2.5 py-2"
          >
            <p className="text-[10px] font-mono-sc uppercase tracking-widest text-cyan-700 mb-1.5">
              {group.title}
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {group.metrics.map((metric) => (
                <div key={`${group.key}-${metric.label}`} className="min-w-0">
                  <p className="text-[9px] font-mono-sc uppercase text-slate-600 truncate">
                    {metric.label}
                  </p>
                  <p className="text-[11px] font-mono-sc text-slate-300 tabular-nums truncate">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-type chips ─────────────────────────────────────────────────────────────

function FilterChips({
  items,
  selected,
  onSelect,
  allLabel = "All",
}: { items: { key: string; label: string }[]; selected: string; onSelect: (v: string) => void; allLabel?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      <button
        type="button"
        onClick={() => onSelect("")}
        className={`px-3 py-1 rounded-sm text-xs font-mono-sc uppercase tracking-wide border transition-colors ${
          !selected
            ? "bg-cyan-950/40 border-cyan-700 text-cyan-300"
            : "border-border text-slate-500 hover:text-slate-300 hover:border-slate-600"
        }`}
      >
        {allLabel}
      </button>
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          onClick={() => onSelect(selected === item.key ? "" : item.key)}
          className={`px-3 py-1 rounded-sm text-xs font-mono-sc uppercase tracking-wide border transition-colors ${
            selected === item.key
              ? "bg-cyan-950/40 border-cyan-700 text-cyan-300"
              : "border-border text-slate-500 hover:text-slate-300 hover:border-slate-600"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ComponentsPage() {
  const { env } = useEnv();
  const { page, search, debouncedSearch, setPage, updateSearch, updatePageWithScroll } = useListQueryState();

  // Category tab and optional curated subcategory within that category.
  const [categoryIdx, setCategoryIdx] = useState(0);
  const [selectedSubcategoryKey, setSelectedSubcategoryKey] = useState("");
  const [weaponDamageType, setWeaponDamageType] = useState("");
  const [size, setSize] = useState("");
  const [grade, setGrade] = useState("");
  const [componentClass, setComponentClass] = useState("");
  const [bespoke, setBespoke] = useState("");
  const [manufacturer, setManufacturer] = useState("");

  const { data: apiCategories } = useQuery({
    queryKey: ["components.categories", env],
    queryFn: () => api.components.categories(env),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const categories = (apiCategories?.length
    ? apiCategories.map((cat) => ({
        label: cat.label as GameComponentCategory,
        slug: cat.slug,
        types: cat.types,
        subcategories: CATEGORY_SUBCATEGORIES[cat.label as GameComponentCategory],
      }))
    : CATEGORIES) as CategoryDef[];
  const category = categories[Math.min(categoryIdx, categories.length - 1)] ?? CATEGORIES[0];
  const selectedSubcategory = category.subcategories?.find((item) => item.key === selectedSubcategoryKey);
  const filterConfig = { ...DEFAULT_FILTER_CONFIG, ...CATEGORY_FILTER_CONFIG[category.label] };

  function handleCategoryChange(idx: number) {
    setCategoryIdx(idx);
    setSelectedSubcategoryKey("");
    setWeaponDamageType("");
    setSize("");
    setGrade("");
    setComponentClass("");
    setBespoke("");
    setManufacturer("");
    setPage(1);
  }

  function handleSubcategorySelect(key: string) {
    setSelectedSubcategoryKey(key);
    setPage(1);
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "components.list",
      env,
      {
        page,
        search: debouncedSearch,
        category: category.slug,
        subcategory: selectedSubcategoryKey,
        weaponDamageType,
        size,
        grade,
        componentClass,
        bespoke,
        manufacturer,
      },
    ],
    queryFn: () =>
      api.components.list({
        env,
        page,
        limit: LIMIT,
        search: debouncedSearch || undefined,
        category: category.slug,
        types: selectedSubcategory?.types?.join(",") || undefined,
        sub_types: selectedSubcategory?.subTypes?.join(",") || undefined,
        weapon_damage_type: filterConfig.damage ? weaponDamageType || selectedSubcategory?.weaponDamageType || undefined : undefined,
        cm_type: selectedSubcategory?.cmType || undefined,
        size: filterConfig.size && size ? Number(size) : undefined,
        grade: filterConfig.grade ? grade || undefined : undefined,
        component_class: filterConfig.componentClass ? componentClass || undefined : undefined,
        is_bespoke: filterConfig.bespoke && bespoke !== "" ? bespoke === "true" : undefined,
        manufacturer: filterConfig.manufacturer ? manufacturer || undefined : undefined,
      }),
  });

  // Filters (size / grade) from the API
  const { data: filters } = useQuery({
    queryKey: ["components.filters", env],
    queryFn: () => api.components.filters(env),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <PageShell>
      <PageHeader
        title="Components"
        count={data?.total}
        countLabel="components"
        search={search}
        searchPlaceholder="Search a component…"
        onSearch={updateSearch}
      />

      {/* Category tabs */}
      <div className="flex gap-1 mb-4 border-b border-border pb-3">
        {categories.map((cat, idx) => (
          <button
            type="button"
            key={cat.slug}
            onClick={() => handleCategoryChange(idx)}
            className={`px-4 py-2 text-sm font-rajdhani font-bold uppercase tracking-wide rounded-sm transition-colors ${
              categoryIdx === idx
                ? "bg-cyan-950/40 border border-cyan-800 text-cyan-300"
                : "border border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {(category.subcategories?.length ?? 0) > 0 && (
        <FilterChips
          items={category.subcategories!.map((item) => ({ key: item.key, label: item.label }))}
          selected={selectedSubcategoryKey}
          onSelect={handleSubcategorySelect}
        />
      )}

      {filterConfig.damage && (
        <FilterChips
          items={WEAPON_DAMAGE_TYPES.map((item) => ({ key: item, label: item }))}
          selected={weaponDamageType}
          onSelect={(value) => {
            setWeaponDamageType(value);
            setPage(1);
          }}
          allLabel="All damage"
        />
      )}

      {/* Size / Grade inline filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {filterConfig.size && (filters?.sizes ?? []).length > 0 && (
          <select
            value={size}
            onChange={(e) => { setSize(e.target.value); setPage(1); }}
            className="bg-panel border border-border text-slate-400 text-xs rounded-sm px-2 py-1"
          >
            <option value="">All sizes</option>
            {[...new Set((filters?.sizes ?? []).map(Number))].sort((a, b) => a - b).map((s) => (
              <option key={s} value={String(s)}>S{s}</option>
            ))}
          </select>
        )}
        {filterConfig.grade && (filters?.grades?.length ?? 0) > 0 && (
          <select
            value={grade}
            onChange={(e) => { setGrade(e.target.value); setPage(1); }}
            className="bg-panel border border-border text-slate-400 text-xs rounded-sm px-2 py-1"
          >
            <option value="">All grades</option>
            {(filters?.grades ?? []).map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        )}
        {filterConfig.componentClass && COMPONENT_CLASS_FILTERS.length > 0 && (
          <select
            value={componentClass}
            onChange={(e) => { setComponentClass(e.target.value); setPage(1); }}
            className="bg-panel border border-border text-slate-400 text-xs rounded-sm px-2 py-1"
          >
            <option value="">All classes</option>
            {[...new Map<string, { value: string; label?: string; count?: number }>([
              ...COMPONENT_CLASS_FILTERS.map((value) => [value, { value, label: value }] as const),
              ...(filters?.componentClasses ?? []).map((item) => [item.value, item] as const),
            ]).values()].map((componentClassFilter) => (
              <option key={componentClassFilter.value} value={componentClassFilter.value}>
                {componentClassFilter.label ?? componentClassFilter.value}
              </option>
            ))}
          </select>
        )}
        {filterConfig.manufacturer && (filters?.manufacturers?.length ?? 0) > 0 && (
          <select
            value={manufacturer}
            onChange={(e) => { setManufacturer(e.target.value); setPage(1); }}
            className="bg-panel border border-border text-slate-400 text-xs rounded-sm px-2 py-1"
          >
            <option value="">All manufacturers</option>
            {(filters?.manufacturers ?? []).map((item) => (
              <option key={item.value} value={item.value}>
                {item.label ?? item.value}
              </option>
            ))}
          </select>
        )}
        {filterConfig.bespoke && (
          <select
            value={bespoke}
            onChange={(e) => { setBespoke(e.target.value); setPage(1); }}
            className="bg-panel border border-border text-slate-400 text-xs rounded-sm px-2 py-1"
          >
            <option value="">All fitment</option>
            <option value="false">Universal</option>
            <option value="true">Bespoke</option>
          </select>
        )}
      </div>

      {/* Component list */}
      {isLoading ? (
        <LoadingGrid message="LOADING COMPONENTS…" />
      ) : error ? (
        <ErrorState error={error as Error} onRetry={() => void refetch()} />
      ) : data?.data.length === 0 ? (
        <EmptyState icon="⚙" title="No components" message="Try adjusting your filters." />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {data?.data.map((comp, i) => {
              const isPaint = comp.type === "Paint" || comp.type === "Livery";
              const href = isPaint
                ? `/paints?search=${encodeURIComponent(comp.name)}`
                : `/components/${comp.uuid}`;

              return (
                <motion.div
                  key={comp.uuid}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <Link
                    href={href}
                    className="block sci-panel hover:border-cyan-800/60 transition-colors px-4 py-3 group"
                  >
                    <div className="flex items-start gap-4">
                      {/* Type color bar */}
                      <div
                        className={`w-0.5 self-stretch rounded-full shrink-0 ${
                          COMPONENT_TYPE_COLORS[comp.type]
                            ?.replace("text-", "bg-") ?? "bg-slate-700"
                        } opacity-60`}
                      />

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-orbitron text-sm text-slate-200 group-hover:text-cyan-400 transition-colors truncate">
                                {comp.name}
                              </span>
                              {comp.grade && (
                                <GlowBadge color="amber" size="xs">{comp.grade}</GlowBadge>
                              )}
                              {comp.component_class && (
                                <GlowBadge color="cyan" size="xs">{comp.component_class}</GlowBadge>
                              )}
                              {comp.is_bespoke && (
                                <GlowBadge color="purple" size="xs">Bespoke</GlowBadge>
                              )}
                              {comp.size != null && (
                                <GlowBadge color="slate" size="xs">S{comp.size}</GlowBadge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              <span className={`text-xs font-mono-sc ${COMPONENT_TYPE_COLORS[comp.type] ?? "text-slate-500"}`}>
                                {COMPONENT_TYPE_LABELS[comp.type] ?? comp.type}
                              </span>
                              {comp.sub_type && (
                                <span className="text-xs text-slate-600">{comp.sub_type}</span>
                              )}
                              {comp.manufacturer_name && (
                                <span className="text-xs text-slate-600">{comp.manufacturer_name}</span>
                              )}
                            </div>
                          </div>

                          {/* Key stats */}
                          <div className="hidden lg:block shrink-0 text-right">
                            <ComponentStats comp={comp} />
                          </div>
                        </div>

                        <ComponentMetricStrip comp={comp} />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
          {data && (
            <Pagination
              className="mt-6"
              page={data.page}
              totalPages={data.pages}
              onPageChange={updatePageWithScroll}
            />
          )}
        </>
      )}
    </PageShell>
  );
}
