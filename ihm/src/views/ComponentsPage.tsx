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
import { COMPONENT_TYPE_COLORS, COMPONENT_TYPE_LABELS } from "@/utils/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import type { ComponentListItem } from "@/types/api";

const LIMIT = 30;

// ── P4K-faithful category taxonomy ────────────────────────────────────────────

interface CategoryDef {
  label: string;
  /** Maps to API ?category= param */
  apiSlug: string;
  types: string[];
}

const CATEGORIES: CategoryDef[] = [
  {
    label: "Weapons",
    apiSlug: "weapons",
    types: ["WeaponGun", "Turret", "TurretUnmanned", "MissileRack", "Missile", "Ammunition"],
  },
  {
    label: "Systems",
    apiSlug: "systems",
    types: ["Shield", "PowerPlant", "Cooler", "QuantumDrive", "JumpModule", "Thruster", "FuelIntake", "FuelTank",
            "Radar", "Countermeasure", "LifeSupport", "EMP", "QuantumInterdictionGenerator"],
  },
  {
    label: "Mounts",
    apiSlug: "mounts",
    types: ["Gimbal"],
  },
  {
    label: "Utility",
    apiSlug: "utility",
    types: ["MiningLaser", "SalvageHead", "TractorBeam"],
  },
  {
    label: "Ship Modules",
    apiSlug: "modules",
    types: ["ShipModule"],
  },
];

/** Sub-type chips available per primary type chip */
const TYPE_SUBTYPES: Partial<Record<string, string[]>> = {
  WeaponGun:      ["Ballistic", "Energy", "Distortion"],
  Missile:        ["Missile", "Torpedo", "Bomb"],
  Thruster:       ["Main", "Maneuvering", "Retro", "VTOL"],
  Countermeasure: ["Noise Launcher", "Decoy Launcher"],
};

// ── Key stats per type ─────────────────────────────────────────────────────────

interface KeyStat {
  label: string;
  value: (c: ComponentListItem) => number | null | undefined;
  format: (v: number) => string;
}

const fNum = (v: number, dec = 0) =>
  v.toLocaleString("en-US", {
    maximumFractionDigits: dec,
    minimumFractionDigits: dec,
  });

const KEY_STATS: Partial<Record<string, KeyStat[]>> = {
  Shield: [
    { label: "HP", value: (c) => c.shield_hp, format: (v) => fNum(v) },
    { label: "Regen", value: (c) => c.shield_regen, format: (v) => `${fNum(v, 1)}/s` },
  ],
  WeaponGun: [
    { label: "DPS", value: (c) => c.weapon_dps, format: (v) => fNum(v, 1) },
    { label: "Range", value: (c) => c.weapon_range, format: (v) => `${fNum(v)}m` },
  ],
  Missile: [{ label: "Dmg", value: (c) => c.missile_damage, format: (v) => fNum(v) }],
  Bomb: [{ label: "Dmg", value: (c) => c.missile_damage, format: (v) => fNum(v) }],
  Torpedo: [{ label: "Dmg", value: (c) => c.missile_damage, format: (v) => fNum(v) }],
  MissileRack: [
    { label: "Racks", value: (c) => c.rack_count, format: (v) => String(v) },
    { label: "Size", value: (c) => c.rack_missile_size, format: (v) => `S${v}` },
  ],
  QuantumDrive: [
    { label: "Speed", value: (c) => c.qd_speed, format: (v) => `${(v / 1e6).toFixed(0)} Mm/s` },
    { label: "Spool", value: (c) => c.qd_spool_time, format: (v) => `${v}s` },
    { label: "Range", value: (c) => c.qd_range, format: (v) =>
      v >= 1e9 ? `${(v / 1e9).toFixed(0)} Gm` : v >= 1e6 ? `${(v / 1e6).toFixed(0)} Mm` : `${fNum(v)}m` },
  ],
  PowerPlant: [{ label: "Power", value: (c) => c.power_output, format: (v) => fNum(v) }],
  Cooler: [{ label: "Cooling", value: (c) => c.cooling_rate, format: (v) => fNum(v) }],
  FuelTank: [{ label: "Cap", value: (c) => c.fuel_capacity, format: (v) => fNum(v) }],
  FuelIntake: [{ label: "Rate", value: (c) => c.fuel_intake_rate, format: (v) => `${fNum(v, 1)}/s` }],
  Radar: [{ label: "Range", value: (c) => c.radar_range, format: (v) => `${fNum(v)}m` }],
  Countermeasure: [{ label: "Ammo", value: (c) => c.cm_ammo_count, format: (v) => String(v) }],
  Thruster: [{ label: "Thrust", value: (c) => c.thruster_max_thrust, format: (v) => `${(v / 1000).toFixed(0)}kN` }],
  EMP: [
    { label: "Dmg", value: (c) => c.emp_damage, format: (v) => fNum(v) },
    { label: "Radius", value: (c) => c.emp_radius, format: (v) => `${fNum(v)}m` },
  ],
  QuantumInterdictionGenerator: [
    { label: "Jammer", value: (c) => c.qig_jammer_range, format: (v) => `${fNum(v)}m` },
  ],
  MiningLaser: [{ label: "Speed", value: (c) => c.mining_speed, format: (v) => fNum(v, 1) }],
  TractorBeam: [{ label: "Force", value: (c) => c.tractor_max_force, format: (v) => `${(v / 1000).toFixed(0)}kN` }],
  SalvageHead: [{ label: "Speed", value: (c) => c.salvage_speed, format: (v) => fNum(v, 1) }],
  Gimbal: [{ label: "Max Angle", value: (c) => c.gimbal_max_angle, format: (v) => `${fNum(v, 1)}°` }],
  Turret: [
    { label: "Pitch", value: (c) => c.turret_max_pitch, format: (v) => `${fNum(v, 0)}°` },
    { label: "Yaw", value: (c) => c.turret_max_yaw, format: (v) => `${fNum(v, 0)}°` },
  ],
  TurretUnmanned: [
    { label: "Pitch", value: (c) => c.turret_max_pitch, format: (v) => `${fNum(v, 0)}°` },
    { label: "Yaw", value: (c) => c.turret_max_yaw, format: (v) => `${fNum(v, 0)}°` },
  ],
};

function ComponentStats({ comp }: { comp: ComponentListItem }) {
  const stats = KEY_STATS[comp.type];
  if (!stats) return null;
  const rendered = stats
    .map((s) => ({ ...s, v: s.value(comp) }))
    .filter((s) => s.v != null && s.v > 0);
  if (!rendered.length) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {rendered.map((s) => (
        <span key={s.label} className="flex items-center gap-1">
          <span className="text-[10px] font-mono-sc text-slate-600 uppercase">{s.label}</span>
          <span className="text-xs font-mono-sc text-slate-300 font-semibold">{s.format(s.v!)}</span>
        </span>
      ))}
    </div>
  );
}

// ── Sub-type chips ─────────────────────────────────────────────────────────────

function SubTypeChips({
  subTypes,
  selected,
  onSelect,
}: { subTypes: string[]; selected: string; onSelect: (v: string) => void }) {
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
        All
      </button>
      {subTypes.map((st) => (
        <button
          type="button"
          key={st}
          onClick={() => onSelect(selected === st ? "" : st)}
          className={`px-3 py-1 rounded-sm text-xs font-mono-sc uppercase tracking-wide border transition-colors ${
            selected === st
              ? "bg-cyan-950/40 border-cyan-700 text-cyan-300"
              : "border-border text-slate-500 hover:text-slate-300 hover:border-slate-600"
          }`}
        >
          {st}
        </button>
      ))}
    </div>
  );
}

// ── Type chips ─────────────────────────────────────────────────────────────────

function TypeChips({
  types,
  selected,
  onSelect,
}: { types: string[]; selected: string; onSelect: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      <button
        type="button"
        onClick={() => onSelect("")}
        className={`px-2.5 py-0.5 rounded-sm text-[11px] font-mono-sc uppercase tracking-wide border transition-colors ${
          !selected
            ? "bg-slate-800 border-slate-600 text-slate-200"
            : "border-border text-slate-600 hover:text-slate-400 hover:border-slate-700"
        }`}
      >
        All
      </button>
      {types.map((t) => (
        <button
          type="button"
          key={t}
          onClick={() => onSelect(selected === t ? "" : t)}
          className={`px-2.5 py-0.5 rounded-sm text-[11px] font-mono-sc border transition-colors ${
            selected === t
              ? `${COMPONENT_TYPE_COLORS[t]?.replace("text-", "bg-").replace(/\/([\d]+)$/, "/20") ?? "bg-slate-800"} border-current ${COMPONENT_TYPE_COLORS[t] ?? "text-slate-300"}`
              : `border-border ${COMPONENT_TYPE_COLORS[t] ?? "text-slate-600"} opacity-60 hover:opacity-100`
          }`}
        >
          {COMPONENT_TYPE_LABELS[t] ?? t}
        </button>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ComponentsPage() {
  const { env } = useEnv();
  const { page, search, debouncedSearch, setPage, updateSearch, updatePageWithScroll } = useListQueryState();

  // Category (tab) and type/subType within that category
  const [categoryIdx, setCategoryIdx] = useState(0);
  const [selectedType, setSelectedType] = useState("");
  const [selectedSubType, setSelectedSubType] = useState("");
  const [size, setSize] = useState("");
  const [grade, setGrade] = useState("");

  const category = CATEGORIES[categoryIdx];

  function handleCategoryChange(idx: number) {
    setCategoryIdx(idx);
    setSelectedType("");
    setSelectedSubType("");
    setPage(1);
  }

  function handleTypeSelect(t: string) {
    setSelectedType(t);
    setSelectedSubType("");
    setPage(1);
  }

  function handleSubTypeSelect(st: string) {
    setSelectedSubType(st);
    setPage(1);
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "components.list",
      env,
      { page, search: debouncedSearch, category: category.apiSlug, type: selectedType, sub_type: selectedSubType, size, grade },
    ],
    queryFn: () =>
      api.components.list({
        env,
        page,
        limit: LIMIT,
        search: debouncedSearch || undefined,
        // If user picked a specific type chip, use it; otherwise use category param
        type: selectedType || undefined,
        category: selectedType ? undefined : category.apiSlug,
        sub_type: selectedSubType || undefined,
        size: size ? Number(size) : undefined,
        grade: grade || undefined,
      }),
  });

  // Filters (size / grade) from the API
  const { data: filters } = useQuery({
    queryKey: ["components.filters", env],
    queryFn: () => api.components.filters(env),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto">
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
        {CATEGORIES.map((cat, idx) => (
          <button
            type="button"
            key={cat.apiSlug}
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

      {/* Type chips */}
      <TypeChips
        types={category.types}
        selected={selectedType}
        onSelect={handleTypeSelect}
      />

      {/* SubType chips — only when a specific type is selected and has sub-types */}
      {selectedType && (TYPE_SUBTYPES[selectedType]?.length ?? 0) > 0 && (
        <SubTypeChips
          subTypes={TYPE_SUBTYPES[selectedType]!}
          selected={selectedSubType}
          onSelect={handleSubTypeSelect}
        />
      )}

      {/* Size / Grade inline filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(filters?.sizes ?? []).length > 0 && (
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
        {(filters?.grades ?? []).length > 0 && (
          <select
            value={grade}
            onChange={(e) => { setGrade(e.target.value); setPage(1); }}
            className="bg-panel border border-border text-slate-400 text-xs rounded-sm px-2 py-1"
          >
            <option value="">All grades</option>
            {(filters?.grades ?? []).map((g: string) => (
              <option key={g} value={g}>{g}</option>
            ))}
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
          <div className="space-y-1">
            {data?.data.map((comp, i) => (
              <motion.div
                key={comp.uuid}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
              >
                <Link
                  href={`/components/${comp.uuid}`}
                  className="flex items-center gap-4 sci-panel hover:border-cyan-800/60 transition-colors px-4 py-2.5 group"
                >
                  {/* Type color bar */}
                  <div
                    className={`w-0.5 self-stretch rounded-full shrink-0 ${
                      COMPONENT_TYPE_COLORS[comp.type]
                        ?.replace("text-", "bg-") ?? "bg-slate-700"
                    } opacity-60`}
                  />

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-orbitron text-sm text-slate-200 group-hover:text-cyan-400 transition-colors truncate">
                        {comp.name}
                      </span>
                      {comp.grade && (
                        <GlowBadge color="amber" size="xs">{comp.grade}</GlowBadge>
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
                  <div className="shrink-0 text-right">
                    <ComponentStats comp={comp} />
                  </div>
                </Link>
              </motion.div>
            ))}
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
    </div>
  );
}


