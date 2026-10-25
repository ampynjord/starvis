'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Crosshair,
  Shield,
  Layers,
  Compass,
  Radio,
  Flame,
  Search,
  ExternalLink,
} from 'lucide-react';
import type { LoadoutNode as ApiLoadoutNode, ShipModule } from '@/types/api';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  buildLoadoutTree,
  type GroupedLoadoutSection,
  type LoadoutNode,
  type LoadoutGroupKey,
} from '@/lib/loadout-formatter';

interface ShipLoadoutProps {
  nodes: ApiLoadoutNode[];
  activeModules?: ShipModule[];
  moduleSlots?: ShipModule[][];
  onModuleChange?: (slotName: string, className: string) => void;
}

// ─────────────────────────────────────────────
// Atoms & Badges
// ─────────────────────────────────────────────

const GRADE_INFO: Record<string, { label: string; color: string }> = {
  A: { label: 'MIL A', color: 'text-emerald-300 bg-emerald-950/70 border-emerald-500/40' },
  B: { label: 'MIL B', color: 'text-cyan-300 bg-cyan-950/70 border-cyan-500/40' },
  C: { label: 'CIV C', color: 'text-slate-300 bg-slate-900/80 border-slate-700/60' },
  D: { label: 'IND D', color: 'text-amber-300 bg-amber-950/70 border-amber-500/40' },
  E: { label: 'IND E', color: 'text-red-300 bg-red-950/70 border-red-500/40' },
};

const DAMAGE_TYPE_STYLE: Record<string, { label: string; color: string }> = {
  energy: { label: 'Laser', color: 'text-red-400 border-red-800/60 bg-red-950/40' },
  physical: { label: 'Ballistic', color: 'text-amber-400 border-amber-800/60 bg-amber-950/40' },
  distortion: { label: 'Distortion', color: 'text-violet-400 border-violet-800/60 bg-violet-950/40' },
  thermal: { label: 'Thermal', color: 'text-orange-400 border-orange-800/60 bg-orange-950/40' },
};

const TRACKING_TYPE_STYLE: Record<string, { label: string; color: string }> = {
  em: { label: 'EM', color: 'text-cyan-400 border-cyan-800/60 bg-cyan-950/40' },
  ir: { label: 'IR', color: 'text-amber-400 border-amber-800/60 bg-amber-950/40' },
  cs: { label: 'CS', color: 'text-emerald-400 border-emerald-800/60 bg-emerald-950/40' },
};

function SizeBadge({ size }: { size?: number | string | null }) {
  if (size == null) return null;
  return (
    <span className="text-[10px] font-mono-sc font-bold px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-500/30 leading-none shrink-0 shadow-sm">
      S{size}
    </span>
  );
}

function GradeBadge({ grade }: { grade?: string | null }) {
  if (!grade) return null;
  const info = GRADE_INFO[grade.toUpperCase()] ?? {
    label: grade,
    color: 'text-slate-400 bg-slate-900 border-slate-800',
  };
  return (
    <span className={`text-[9px] font-mono-sc font-bold px-1.5 py-0.5 rounded border leading-none shrink-0 ${info.color}`}>
      {info.label}
    </span>
  );
}

function StatChip({ label, value, unit, color = 'text-white' }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-800/80 rounded px-1.5 py-0.5 text-[10px] font-mono-sc">
      <span className="text-slate-500 uppercase">{label}</span>
      <span className={`font-semibold tabular-nums ${color}`}>
        {value}
        {unit ? ` ${unit}` : ''}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tree Node Component (Erkul.games style)
// ─────────────────────────────────────────────

function ErkulNodeRow({
  node,
  depth = 0,
}: {
  node: LoadoutNode;
  depth?: number;
}) {
  const { language } = useLanguage();
  const isFr = language === 'fr';

  const hasChildren = node.children && node.children.length > 0;
  const isJumpModule =
    (node.port_type || '').toLowerCase().includes('jump') ||
    (node.component_type || '').toLowerCase().includes('jump') ||
    (node.humanPortName || '').toLowerCase().includes('saut') ||
    (node.humanPortName || '').toLowerCase().includes('jump');

  const dmgStyle = node.weapon_damage_type ? DAMAGE_TYPE_STYLE[node.weapon_damage_type.toLowerCase()] : null;
  const trackStyle = node.component_sub_type ? TRACKING_TYPE_STYLE[node.component_sub_type.toLowerCase()] : null;

  return (
    <div className="relative group">
      {/* Branch connector line if child */}
      {depth > 0 && (
        <div
          aria-hidden="true"
          className="absolute -left-4 top-4 w-4 h-4 border-l-2 border-b-2 border-cyan-500/30 rounded-bl-md pointer-events-none"
        />
      )}

      <div
        className={`p-3 rounded-lg border transition-all duration-150 ${
          depth === 0
            ? 'bg-slate-900/60 border-slate-800/90 hover:border-cyan-500/40 hover:bg-slate-900/90 shadow-sm'
            : 'bg-slate-950/70 border-slate-800/70 hover:border-cyan-500/30 hover:bg-slate-900/50'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Port location & component name */}
          <div className="flex items-center gap-2 min-w-0">
            <SizeBadge size={node.component_size} />

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-mono-sc text-slate-400">
                <span className="text-cyan-400 font-bold">{node.humanPortName}</span>
                {node.component_manufacturer && (
                  <span className="text-slate-500 truncate">• {node.component_manufacturer}</span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs sm:text-sm font-rajdhani font-bold text-white truncate group-hover:text-cyan-300 transition-colors">
                  {node.count && node.count > 1 ? `${node.count}x ` : ''}
                  {node.component_name || (isFr ? 'Emplacement vide' : 'Empty Hardpoint')}
                </span>

                {node.component_uuid && (
                  <Link
                    href={`/database/components/${node.component_uuid}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-cyan-400 hover:text-cyan-200"
                    title={isFr ? 'Voir fiche composant' : 'View component details'}
                  >
                    <ExternalLink size={11} />
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Right: Badges (Grade, Damage Type, Jump Module indicator) */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {isJumpModule && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-purple-950/80 text-purple-300 border border-purple-800/60 font-bold uppercase">
                {isFr ? 'Module de saut' : 'Jump Module'}
              </span>
            )}
            {dmgStyle && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono-sc font-bold border ${dmgStyle.color}`}>
                {dmgStyle.label}
              </span>
            )}
            {trackStyle && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono-sc font-bold border ${trackStyle.color}`}>
                {trackStyle.label}
              </span>
            )}
            <GradeBadge grade={node.component_grade} />
          </div>
        </div>

        {/* Inline Component Stats (Erkul-like telemetry chips) */}
        {(node.weapon_dps ||
          node.weapon_damage ||
          node.weapon_fire_rate ||
          node.weapon_range ||
          node.shield_hp ||
          node.shield_regen ||
          node.quantum_speed ||
          node.quantum_range ||
          node.cooler_cooling_rate ||
          node.power_output) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-800/50">
            {node.weapon_dps != null && (
              <StatChip label="DPS" value={Math.round(node.weapon_dps).toLocaleString()} color="text-amber-400" />
            )}
            {node.weapon_damage != null && (
              <StatChip label="Alpha" value={Math.round(node.weapon_damage).toLocaleString()} />
            )}
            {node.weapon_fire_rate != null && (
              <StatChip label="RPM" value={Math.round(node.weapon_fire_rate).toLocaleString()} />
            )}
            {node.weapon_range != null && (
              <StatChip label="Range" value={Math.round(node.weapon_range).toLocaleString()} unit="m" />
            )}
            {node.shield_hp != null && (
              <StatChip label="HP" value={Math.round(node.shield_hp).toLocaleString()} color="text-cyan-400" />
            )}
            {node.shield_regen != null && (
              <StatChip label="Regen" value={Math.round(node.shield_regen).toLocaleString()} unit="/s" color="text-cyan-400" />
            )}
            {node.quantum_speed != null && (
              <StatChip label="Speed" value={Math.round(node.quantum_speed / 1000).toLocaleString()} unit="km/s" color="text-purple-400" />
            )}
            {node.quantum_range != null && (
              <StatChip label="Range" value={(node.quantum_range / 1_000_000).toFixed(1)} unit="Mkm" color="text-purple-400" />
            )}
            {node.cooler_cooling_rate != null && (
              <StatChip label="Cooling" value={Math.round(node.cooler_cooling_rate).toLocaleString()} unit="kW" color="text-teal-400" />
            )}
            {node.power_output != null && (
              <StatChip label="Power" value={Math.round(node.power_output).toLocaleString()} unit="kW" color="text-yellow-400" />
            )}
          </div>
        )}
      </div>

      {/* Render children sub-nodes recursively with tree branch lines */}
      {hasChildren && (
        <div className="ml-5 sm:ml-6 pl-2 sm:pl-3 border-l-2 border-cyan-500/20 space-y-2 mt-2">
          {node.children.map((child) => (
            <ErkulNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main ShipLoadout Component
// ─────────────────────────────────────────────

export function ShipLoadout({
  nodes,
  activeModules = [],
  moduleSlots = [],
  onModuleChange,
}: ShipLoadoutProps) {
  const { language } = useLanguage();
  const isFr = language === 'fr';

  const [activeTab, setActiveTab] = useState<LoadoutGroupKey | 'modules'>('weapons');
  const [filterSearch, setFilterSearch] = useState('');

  // Process Erkul hierarchical tree
  const groupedSections: GroupedLoadoutSection[] = useMemo(() => {
    return buildLoadoutTree(nodes as any, language);
  }, [nodes, language]);

  // Aggregate stats summary
  const totals = useMemo(() => {
    let weaponsCount = 0;
    let missilesCount = 0;
    let systemsCount = 0;
    let totalDps = 0;

    for (const sec of groupedSections) {
      if (sec.key === 'weapons') {
        for (const n of sec.nodes) {
          weaponsCount++;
          if (n.weapon_dps) totalDps += Number(n.weapon_dps);
          for (const c of n.children) {
            weaponsCount++;
            if (c.weapon_dps) totalDps += Number(c.weapon_dps);
          }
        }
      }
      if (sec.key === 'missiles') {
        for (const n of sec.nodes) {
          missilesCount += n.count || 1;
          for (const c of n.children) {
            missilesCount += c.count || 1;
          }
        }
      }
      if (sec.key === 'systems' || sec.key === 'propulsion' || sec.key === 'jump') {
        systemsCount += sec.nodes.length;
      }
    }

    return { weaponsCount, missilesCount, systemsCount, totalDps: Math.round(totalDps) };
  }, [groupedSections]);

  const activeSection = groupedSections.find((s) => s.key === activeTab);

  // Filter nodes if search query is present
  const displayedNodes = useMemo(() => {
    if (!activeSection) return [];
    if (!filterSearch.trim()) return activeSection.nodes;
    const q = filterSearch.toLowerCase().trim();

    return activeSection.nodes.filter((node) => {
      const matchRoot =
        node.humanPortName.toLowerCase().includes(q) ||
        (node.component_name || '').toLowerCase().includes(q) ||
        (node.component_manufacturer || '').toLowerCase().includes(q);
      const matchChild = node.children.some(
        (c) =>
          c.humanPortName.toLowerCase().includes(q) ||
          (c.component_name || '').toLowerCase().includes(q) ||
          (c.component_manufacturer || '').toLowerCase().includes(q),
      );
      return matchRoot || matchChild;
    });
  }, [activeSection, filterSearch]);

  const tabs: Array<{
    id: LoadoutGroupKey | 'modules';
    label: string;
    count: number;
    icon: React.ElementType;
    badge?: string;
  }> = [
    {
      id: 'weapons',
      label: isFr ? 'Armement' : 'Armament',
      count: totals.weaponsCount,
      icon: Crosshair,
      badge: totals.totalDps > 0 ? `${totals.totalDps} DPS` : undefined,
    },
    {
      id: 'missiles',
      label: isFr ? 'Missiles & Racks' : 'Missiles & Racks',
      count: totals.missilesCount,
      icon: Flame,
    },
    {
      id: 'systems',
      label: isFr ? 'Systèmes' : 'Systems',
      count: totals.systemsCount,
      icon: Shield,
    },
    {
      id: 'jump',
      label: isFr ? 'Module de saut' : 'Jump Module',
      count: groupedSections.find((s) => s.key === 'jump')?.nodes.length ?? 0,
      icon: Compass,
    },
    {
      id: 'utility',
      label: isFr ? 'Utilitaires' : 'Utility',
      count: groupedSections.find((s) => s.key === 'utility')?.nodes.length ?? 0,
      icon: Radio,
    },
  ];

  if (activeModules.length > 0) {
    tabs.push({
      id: 'modules',
      label: isFr ? 'Baies modulaires' : 'Ship Modules',
      count: activeModules.length,
      icon: Layers,
    });
  }

  // Auto-switch to first non-empty tab if activeTab is empty
  const currentTabDef = tabs.find((t) => t.id === activeTab);
  const effectiveTab = currentTabDef && currentTabDef.count > 0 ? activeTab : tabs.find((t) => t.count > 0)?.id ?? 'weapons';

  return (
    <div className="space-y-4">
      {/* ── Cockpit Header: Section Tabs with live counters & DPS badges ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = effectiveTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setFilterSearch('');
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono-sc transition-all border ${
                  isActive
                    ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50 shadow-md shadow-cyan-950/50 font-bold'
                    : 'bg-slate-950/60 text-slate-400 hover:text-white border-slate-800 hover:border-slate-700'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-cyan-400' : 'text-slate-500'} />
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] tabular-nums font-bold ${
                    isActive ? 'bg-cyan-500/30 text-cyan-200' : 'bg-slate-900 text-slate-500'
                  }`}
                >
                  {tab.count}
                </span>
                {tab.badge && (
                  <span className="hidden sm:inline px-1.5 py-0.2 rounded text-[9px] bg-amber-950/80 text-amber-400 border border-amber-500/40 font-bold">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Search within loadout */}
        <div className="relative w-full sm:w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder={isFr ? 'Filtrer loadout...' : 'Filter loadout...'}
            className="w-full pl-7 pr-3 py-1 rounded-md bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 font-rajdhani"
          />
        </div>
      </div>

      {/* ── Active Section Tree Cards ── */}
      {effectiveTab !== 'modules' ? (
        displayedNodes.length > 0 ? (
          <div className="space-y-3">
            {displayedNodes.map((node) => (
              <ErkulNodeRow key={node.id} node={node} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center rounded-xl border border-dashed border-slate-800 bg-slate-950/30">
            <p className="text-xs font-mono-sc text-slate-500">
              {filterSearch
                ? isFr
                  ? 'Aucun composant ne correspond au filtre.'
                  : 'No components match your search.'
                : isFr
                  ? 'Aucun équipement dans cette catégorie.'
                  : 'No equipment listed in this category.'}
            </p>
          </div>
        )
      ) : (
        /* Modular Ship bays (Retaliator, Apollo, Galaxy...) */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {activeModules.map((mod, i) => {
            const options = moduleSlots.find((slot) => slot[0]?.slot_name === mod.slot_name) ?? [];
            return (
              <div
                key={i}
                className="p-3.5 rounded-xl border border-purple-900/40 bg-purple-950/10 hover:border-purple-700/50 transition-all space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono-sc uppercase text-purple-400 font-bold">
                    {mod.slot_name}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-purple-900/60 text-purple-200 border border-purple-700/60 font-semibold">
                    {isFr ? 'Modulaire' : 'Modular'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-rajdhani font-bold text-white truncate">
                    {mod.module_name || mod.module_class_name}
                  </h4>

                  {options.length > 1 && onModuleChange && (
                    <select
                      value={mod.module_class_name}
                      onChange={(e) => onModuleChange(mod.slot_name, e.target.value)}
                      className="bg-slate-900 border border-purple-800/60 text-xs font-mono-sc text-purple-300 rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
                    >
                      {options.map((opt) => (
                        <option key={opt.module_class_name} value={opt.module_class_name}>
                          {opt.module_name || opt.module_class_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
