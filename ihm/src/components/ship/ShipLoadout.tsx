'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Crosshair,
  Target,
  ShieldAlert,
  Rocket,
  Sparkles,
  Compass,
  Shield,
  Zap,
  Snowflake,
  Radio,
  HeartPulse,
  Gauge,
  Anchor,
  Wrench,
  Cpu,
  Fuel,
  Layers,
  Palette,
  Search,
  ExternalLink,
  Layers as LayersIcon,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import type { LoadoutNode as ApiLoadoutNode, ShipModule } from '@/types/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { fSize } from '@/utils/formatters';
import {
  buildLoadoutTree,
  humanizeModuleName,
  humanizeModuleSlot,
  type GroupedLoadoutSection,
  type LoadoutNode,
} from '@/lib/loadout-formatter';

interface ShipLoadoutProps {
  nodes: ApiLoadoutNode[];
  activeModules?: ShipModule[];
  moduleSlots?: ShipModule[][];
  onModuleChange?: (slotName: string, className: string) => void;
  /** Revient à l'équipement d'usine sur tous les ports de module. */
  onResetModules?: () => void;
  /** Vrai pendant le recalcul de l'arbre après un changement de module. */
  isRecomputing?: boolean;
}

// ─────────────────────────────────────────────
// Atoms & Badges
// ─────────────────────────────────────────────

const COMPONENT_CLASS_STYLES: Record<string, { labelFr: string; labelEn: string; color: string }> = {
  military: {
    labelFr: 'Militaire',
    labelEn: 'Military',
    color: 'text-emerald-300 bg-emerald-950/70 border-emerald-500/40',
  },
  civilian: {
    labelFr: 'Civil',
    labelEn: 'Civilian',
    color: 'text-slate-300 bg-slate-900/80 border-slate-700/60',
  },
  industrial: {
    labelFr: 'Industriel',
    labelEn: 'Industrial',
    color: 'text-amber-300 bg-amber-950/70 border-amber-500/40',
  },
  stealth: {
    labelFr: 'Furtif',
    labelEn: 'Stealth',
    color: 'text-purple-300 bg-purple-950/70 border-purple-500/40',
  },
  competition: {
    labelFr: 'Course',
    labelEn: 'Racing',
    color: 'text-rose-300 bg-rose-950/70 border-rose-500/40',
  },
  racing: {
    labelFr: 'Course',
    labelEn: 'Racing',
    color: 'text-rose-300 bg-rose-950/70 border-rose-500/40',
  },
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

const SECTION_ICONS: Record<GroupedLoadoutSection['iconName'], React.ElementType> = {
  crosshair: Crosshair,
  target: Target,
  'shield-alert': ShieldAlert,
  rocket: Rocket,
  sparkles: Sparkles,
  compass: Compass,
  shield: Shield,
  zap: Zap,
  snowflake: Snowflake,
  radio: Radio,
  'heart-pulse': HeartPulse,
  gauge: Gauge,
  anchor: Anchor,
  wrench: Wrench,
  cpu: Cpu,
  fuel: Fuel,
  layers: Layers,
  palette: Palette,
};

const TAB_LABELS: Record<string, { fr: string; en: string }> = {
  fixed_weapons: { fr: 'Armes Fixes', en: 'Fixed Weapons' },
  turrets: { fr: 'Tourelles', en: 'Turrets' },
  pds: { fr: 'Défense PDS', en: 'Point Defense' },
  ordnance: { fr: 'Munitions & Racks', en: 'Ordnance' },
  countermeasures: { fr: 'Contre-mesures', en: 'Countermeasures' },
  quantum: { fr: 'Quantique & Saut', en: 'Quantum & Jump' },
  shields: { fr: 'Boucliers', en: 'Shields' },
  power_plants: { fr: 'Énergie', en: 'Power Plants' },
  coolers: { fr: 'Refroidisseurs', en: 'Coolers' },
  radar: { fr: 'Radars', en: 'Radar' },
  life_support: { fr: 'Survie', en: 'Life Support' },
  thrusters: { fr: 'Propulseurs', en: 'Thrusters' },
  docked_vehicles: { fr: 'Véhicules Arrimés', en: 'Docked Craft' },
  specialized: { fr: 'Spécialisé', en: 'Specialized' },
  avionics_blades: { fr: 'Avionique & Blades', en: 'Avionics & Blades' },
  fuel: { fr: 'Carburant & Intakes', en: 'Fuel & Intakes' },
  modules: { fr: 'Modules', en: 'Modules' },
  paints: { fr: 'Peintures', en: 'Liveries' },
};

function SizeBadge({ size, lang = 'en' }: { size?: number | string | null; lang?: string }) {
  if (size == null) return null;
  return (
    <span className="text-[10px] font-mono-sc font-bold px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-500/30 leading-none shrink-0 shadow-sm">
      {fSize(size, lang as any)}
    </span>
  );
}

function ComponentClassBadge({
  componentClass,
  lang = 'en',
}: {
  componentClass?: string | null;
  lang?: string;
}) {
  if (!componentClass) return null;
  const key = componentClass.trim().toLowerCase();
  const info = COMPONENT_CLASS_STYLES[key] ?? {
    labelFr: componentClass,
    labelEn: componentClass,
    color: 'text-slate-400 bg-slate-900 border-slate-800',
  };
  return (
    <span
      className={`text-[9px] font-mono-sc font-bold px-1.5 py-0.5 rounded border leading-none shrink-0 ${info.color}`}
    >
      {lang === 'fr' ? info.labelFr : info.labelEn}
    </span>
  );
}

function GradeBadge({ grade }: { grade?: string | null }) {
  if (!grade) return null;
  const g = grade.trim().toUpperCase();
  return (
    <span className="text-[9px] font-mono-sc font-bold px-1.5 py-0.5 rounded border leading-none shrink-0 text-cyan-300 bg-cyan-950/60 border-cyan-500/40 shadow-sm">
      Grade {g}
    </span>
  );
}

function StatChip({
  label,
  value,
  unit,
  color = 'text-white',
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
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
    (node.component_class_name || '').toUpperCase().startsWith('JDRV') ||
    (node.humanPortName || '').toLowerCase().includes('saut') ||
    (node.humanPortName || '').toLowerCase().includes('jump');

  const isPds =
    (node.port_name || '').toLowerCase().includes('pdc') ||
    (node.port_name || '').toLowerCase().includes('pds') ||
    (node.component_class_name || '').toLowerCase().includes('pdc');

  const isDockedVehicle =
    (node.port_name || '').toLowerCase().includes('dock') ||
    (node.port_name || '').toLowerCase().includes('collar') ||
    (node.component_class_name || '').toLowerCase().includes('merlin') ||
    (node.component_class_name || '').toLowerCase().includes('archimedes') ||
    (node.component_class_name || '').toLowerCase().includes('skylark');

  const isMining =
    (node.port_name || '').toLowerCase().includes('mining') ||
    (node.component_class_name || '').toLowerCase().includes('mining');

  const isSalvage =
    (node.port_name || '').toLowerCase().includes('salvage') ||
    (node.component_class_name || '').toLowerCase().includes('salvage');

  const isTractor =
    (node.port_name || '').toLowerCase().includes('tractor') ||
    (node.component_class_name || '').toLowerCase().includes('tractor');

  const isEmp =
    (node.component_type || '').toLowerCase() === 'emp' ||
    /(?:^|_)emp(?:_|$)/.test((node.component_class_name || '').toLowerCase());

  const isQed =
    (node.component_type || '').toLowerCase().includes('interdiction') ||
    (node.component_class_name || '').toLowerCase().includes('qed');

  const isPod =
    /mining_pod|stored_pod/.test((node.port_name || '').toLowerCase()) ||
    (node.component_class_name || '').toLowerCase().includes('shipmining_pod');

  // Port provided by an interchangeable module (shown outside the Modules tab)
  const moduleOrigin = node.moduleSlot && node.sourceModule && node.port_name !== node.moduleSlot ? node.sourceModule : null;

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
            <SizeBadge size={node.component_size} lang={language} />

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

                {node.component_uuid ? (
                  <Link
                    href={`/database/components/${node.component_uuid}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-cyan-400 hover:text-cyan-200"
                    title={isFr ? 'Voir fiche composant' : 'View component details'}
                  >
                    <ExternalLink size={11} />
                  </Link>
                ) : isDockedVehicle ? (
                  <Link
                    href={
                      node.docked_ship_uuid
                        ? `/ships/${node.docked_ship_uuid}`
                        : `/database/ships?search=${encodeURIComponent(node.component_name || '')}`
                    }
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-cyan-400 hover:text-cyan-200"
                    title={isFr ? 'Voir fiche vaisseau parasite' : 'View parasite ship details'}
                  >
                    <ExternalLink size={11} />
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right: Badges (Grade, Damage Type, Jump Module indicator, Specialized tags) */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {isJumpModule && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-purple-950/80 text-purple-300 border border-purple-800/60 font-bold uppercase">
                {isFr ? 'Module de saut' : 'Jump Module'}
              </span>
            )}
            {isPds && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-red-950/80 text-red-300 border border-red-800/60 font-bold uppercase">
                {isFr ? 'Défense PDC' : 'Point Defense'}
              </span>
            )}
            {isDockedVehicle && (
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 font-bold uppercase">
                  {isFr ? 'Parasite Arrimé' : 'Docked Craft'}
                </span>
                {node.docked_ship_uuid && (
                  <Link
                    href={`/ships/${node.docked_ship_uuid}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/50 text-[10px] font-mono-sc text-indigo-200 transition-colors shadow-sm"
                  >
                    <span>{isFr ? 'Fiche vaisseau ↗' : 'Ship Sheet ↗'}</span>
                  </Link>
                )}
              </div>
            )}
            {isMining && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-amber-950/80 text-amber-300 border border-amber-800/60 font-bold">
                {isFr ? 'Minage' : 'Mining'}
              </span>
            )}
            {isSalvage && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-bold">
                {isFr ? 'Récupération' : 'Salvage'}
              </span>
            )}
            {isTractor && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-bold">
                {isFr ? 'Tracteur' : 'Tractor Beam'}
              </span>
            )}
            {isEmp && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-blue-950/80 text-blue-300 border border-blue-800/60 font-bold">
                EMP
              </span>
            )}
            {isQed && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-purple-950/80 text-purple-300 border border-purple-800/60 font-bold">
                QED
              </span>
            )}
            {isPod && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-yellow-950/80 text-yellow-300 border border-yellow-800/60 font-bold">
                {isFr ? 'Sac à minerai' : 'Ore Bag'}
              </span>
            )}
            {moduleOrigin && depth === 0 && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-purple-950/80 text-purple-300 border border-purple-700/60 font-bold"
                title={isFr ? 'Fourni par un module interchangeable' : 'Provided by an interchangeable module'}
              >
                {isFr ? 'Module' : 'Module'} · {moduleOrigin}
              </span>
            )}
            {node.thruster_type && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-sc bg-sky-950/80 text-sky-300 border border-sky-800/60 font-bold capitalize">
                {node.thruster_type === 'main'
                  ? isFr
                    ? 'Principal'
                    : 'Main'
                  : node.thruster_type === 'retro'
                    ? isFr
                      ? 'Freinage'
                      : 'Retro'
                    : isFr
                      ? 'Manœuvre'
                      : 'Maneuver'}
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
            <ComponentClassBadge componentClass={node.component_class} lang={language} />
            <GradeBadge grade={node.component_grade} />
          </div>
        </div>

        {/* Inline Component Stats (Erkul-like telemetry chips) */}
        {(node.weapon_dps ||
          node.weapon_burst_dps ||
          node.weapon_damage ||
          node.weapon_alpha_damage ||
          node.weapon_speed ||
          node.weapon_fire_rate ||
          node.weapon_range ||
          node.weapon_ammo_count ||
          node.shield_hp ||
          node.shield_regen ||
          node.shield_hardening ||
          node.shield_faces ||
          node.quantum_speed ||
          node.quantum_range ||
          node.quantum_spool_time ||
          node.qd_cooldown ||
          node.cooler_cooling_rate ||
          node.power_output ||
          node.em_signature ||
          node.ir_signature ||
          node.cm_ammo_count ||
          node.thruster_max_thrust) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-800/50">
            {node.weapon_dps != null && (
              <StatChip label="DPS" value={Math.round(node.weapon_dps).toLocaleString()} color="text-amber-400" />
            )}
            {node.weapon_burst_dps != null && (
              <StatChip
                label={isFr ? 'Rafale' : 'Burst'}
                value={Math.round(node.weapon_burst_dps).toLocaleString()}
                color="text-amber-300"
              />
            )}
            {(node.weapon_alpha_damage != null || node.weapon_damage != null) && (
              <StatChip
                label="Alpha"
                value={Math.round(node.weapon_alpha_damage ?? node.weapon_damage!).toLocaleString()}
              />
            )}
            {node.weapon_speed != null && (
              <StatChip
                label={isFr ? 'Vitesse' : 'Speed'}
                value={Math.round(node.weapon_speed).toLocaleString()}
                unit="m/s"
                color="text-emerald-400"
              />
            )}
            {node.weapon_fire_rate != null && (
              <StatChip label="RPM" value={Math.round(node.weapon_fire_rate).toLocaleString()} />
            )}
            {node.weapon_range != null && (
              <StatChip label="Range" value={Math.round(node.weapon_range).toLocaleString()} unit="m" />
            )}
            {node.weapon_ammo_count != null && (
              <StatChip label="Ammo" value={node.weapon_ammo_count.toLocaleString()} color="text-yellow-400" />
            )}
            {node.cm_ammo_count != null && (
              <StatChip
                label={isFr ? 'Munitions CM' : 'CM Ammo'}
                value={node.cm_ammo_count.toLocaleString()}
                color="text-purple-400"
              />
            )}
            {node.shield_hp != null && (
              <StatChip label="HP" value={Math.round(node.shield_hp).toLocaleString()} color="text-cyan-400" />
            )}
            {node.shield_regen != null && (
              <StatChip
                label="Regen"
                value={Math.round(node.shield_regen).toLocaleString()}
                unit="/s"
                color="text-cyan-400"
              />
            )}
            {node.shield_hardening != null && (
              <StatChip
                label={isFr ? 'Dureté' : 'Hardening'}
                value={`${Math.round(node.shield_hardening * 100)}%`}
                color="text-cyan-300"
              />
            )}
            {node.shield_faces != null && (
              <StatChip label="Faces" value={node.shield_faces} color="text-cyan-300" />
            )}
            {node.quantum_speed != null && (
              <StatChip
                label="Speed"
                value={Math.round(node.quantum_speed / 1000).toLocaleString()}
                unit="km/s"
                color="text-purple-400"
              />
            )}
            {node.quantum_range != null && (
              <StatChip
                label="Range"
                value={(node.quantum_range / 1_000_000).toFixed(1)}
                unit="Mkm"
                color="text-purple-400"
              />
            )}
            {node.quantum_spool_time != null && (
              <StatChip label="Spool" value={node.quantum_spool_time.toFixed(1)} unit="s" color="text-purple-300" />
            )}
            {node.qd_cooldown != null && (
              <StatChip label="Cooldown" value={node.qd_cooldown.toFixed(1)} unit="s" color="text-purple-300" />
            )}
            {node.cooler_cooling_rate != null && (
              <StatChip
                label="Cooling"
                value={Math.round(node.cooler_cooling_rate).toLocaleString()}
                unit="kW"
                color="text-teal-400"
              />
            )}
            {node.power_output != null && (
              <StatChip
                label="Power"
                value={Math.round(node.power_output).toLocaleString()}
                unit="kW"
                color="text-yellow-400"
              />
            )}
            {node.em_signature != null && (
              <StatChip label="EM" value={Math.round(node.em_signature).toLocaleString()} color="text-blue-400" />
            )}
            {node.ir_signature != null && (
              <StatChip label="IR" value={Math.round(node.ir_signature).toLocaleString()} color="text-orange-400" />
            )}
            {node.thruster_max_thrust != null && (
              <StatChip
                label="Thrust"
                value={
                  node.thruster_max_thrust >= 1000
                    ? (node.thruster_max_thrust / 1000).toFixed(1)
                    : Math.round(node.thruster_max_thrust).toLocaleString()
                }
                unit={node.thruster_max_thrust >= 1000 ? 'kN' : 'N'}
                color="text-sky-400"
              />
            )}
          </div>
        )}
      </div>

      {/* Render children sub-nodes recursively with tree branch lines */}
      {hasChildren && (
        <div className="ml-5 sm:ml-6 pl-2 sm:pl-3 border-l-2 border-cyan-500/20 space-y-2 mt-2">
          {node.children.map((child) => (
            <ErkulNodeRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Dynamic Tab Badge Helper
// ─────────────────────────────────────────────

/** A missile / torpedo / bomb actually loaded — not an empty rack waiting for one. */
function isOrdnanceLeaf(n: LoadoutNode): boolean {
  const type = (n.component_type || '').toLowerCase();
  if (type === 'missilerack' || (n.component_class_name || '').toUpperCase().startsWith('MRCK')) return false;
  return (
    (n.port_type || '').toLowerCase().includes('missile') ||
    type.includes('missile') ||
    type.includes('torpedo') ||
    type.includes('bomb')
  );
}

function getSectionBadge(sec: GroupedLoadoutSection, isFr: boolean): string | undefined {
  if (sec.key === 'fixed_weapons' || sec.key === 'turrets' || sec.key === 'pds') {
    let dps = 0;
    const addDps = (n: LoadoutNode) => {
      if (n.weapon_dps) dps += Number(n.weapon_dps);
      n.children.forEach(addDps);
    };
    sec.nodes.forEach(addDps);
    if (dps > 0) return `${Math.round(dps).toLocaleString()} DPS`;
  }

  if (sec.key === 'ordnance') {
    let count = 0;
    const addCount = (n: LoadoutNode) => {
      if (n.children.length === 0 && isOrdnanceLeaf(n)) {
        count += n.count || 1;
      }
      n.children.forEach(addCount);
    };
    sec.nodes.forEach(addCount);
    if (count > 0) return `${count} ${isFr ? 'mun.' : 'ord.'}`;
  }

  if (sec.key === 'countermeasures') {
    let count = 0;
    sec.nodes.forEach((n) => {
      if (n.cm_ammo_count) count += Number(n.cm_ammo_count);
    });
    if (count > 0) return `${count} ${isFr ? 'charges' : 'ammo'}`;
  }

  if (sec.key === 'shields') {
    let hp = 0;
    sec.nodes.forEach((n) => {
      if (n.shield_hp) hp += Number(n.shield_hp);
    });
    if (hp > 0) return `${Math.round(hp).toLocaleString()} HP`;
  }

  if (sec.key === 'thrusters') {
    let thrust = 0;
    sec.nodes.forEach((n) => {
      if (n.thruster_max_thrust) thrust += Number(n.thruster_max_thrust);
    });
    if (thrust >= 1000) return `${Math.round(thrust / 1000).toLocaleString()} kN`;
    if (thrust > 0) return `${Math.round(thrust).toLocaleString()} N`;
  }

  if (sec.key === 'power_plants') {
    let pwr = 0;
    sec.nodes.forEach((n) => {
      if (n.power_output) pwr += Number(n.power_output);
    });
    if (pwr > 0) return `${Math.round(pwr).toLocaleString()} kW`;
  }

  if (sec.key === 'coolers') {
    let cool = 0;
    sec.nodes.forEach((n) => {
      if (n.cooler_cooling_rate) cool += Number(n.cooler_cooling_rate);
    });
    if (cool > 0) return `${Math.round(cool).toLocaleString()} kW`;
  }

  if (sec.key === 'quantum') {
    const qd = sec.nodes.find((n) => n.quantum_speed);
    if (qd?.quantum_speed) return `${Math.round(qd.quantum_speed / 1000).toLocaleString()} km/s`;
  }

  if (sec.key === 'docked_vehicles') {
    return `${sec.nodes.length} ${isFr ? 'arrimé' : 'docked'}`;
  }

  return undefined;
}

// ─────────────────────────────────────────────
// Main ShipLoadout Component
// ─────────────────────────────────────────────

export function ShipLoadout({
  nodes,
  activeModules = [],
  moduleSlots = [],
  onModuleChange,
  onResetModules,
  isRecomputing = false,
}: ShipLoadoutProps) {
  const { language } = useLanguage();
  const isFr = language === 'fr';

  const [activeTab, setActiveTab] = useState<string>('fixed_weapons');
  const [filterSearch, setFilterSearch] = useState('');

  // Process Erkul hierarchical tree — module ports are spread into their natural categories
  const groupedSections: GroupedLoadoutSection[] = useMemo(() => {
    return buildLoadoutTree(nodes as any, language, {
      moduleSlots: activeModules.map((m) => ({
        slotName: m.slot_name,
        label: humanizeModuleName(m.module_class_name, language, m.module_tier),
      })),
    });
  }, [nodes, language, activeModules]);

  const modulesSection = groupedSections.find((s) => s.key === 'modules');

  // What each module brings to the ship, per slot (torpedo launcher, shield, missile racks…)
  const moduleContributions = useMemo(() => {
    const bySlot = new Map<string, Array<{ node: LoadoutNode; sectionKey: string; count: number }>>();
    for (const sec of groupedSections) {
      if (sec.key === 'modules') continue;
      for (const node of sec.nodes) {
        if (!node.moduleSlot) continue;
        const list = bySlot.get(node.moduleSlot) ?? [];
        // 8 identical racks read better as one "8x" chip
        const same = list.find(
          (c) =>
            c.sectionKey === sec.key &&
            c.node.component_name === node.component_name &&
            c.node.component_size === node.component_size,
        );
        if (same) same.count += node.count || 1;
        else list.push({ node, sectionKey: sec.key, count: node.count || 1 });
        bySlot.set(node.moduleSlot, list);
      }
    }
    return bySlot;
  }, [groupedSections]);

  const hasCustomModules = activeModules.some((m) => !m.is_default);

  // Aggregate stats overview banner (Erkul telemetry top bar)
  const shipTotals = useMemo(() => {
    let totalGunDps = 0;
    let totalMissiles = 0;
    let totalShieldHp = 0;
    let totalShieldRegen = 0;
    let totalPower = 0;
    let totalCooling = 0;
    let maxQuantumSpeed = 0;
    let totalThrust = 0;

    const traverse = (node: LoadoutNode) => {
      if (node.weapon_dps) totalGunDps += Number(node.weapon_dps);
      if (node.shield_hp) totalShieldHp += Number(node.shield_hp);
      if (node.shield_regen) totalShieldRegen += Number(node.shield_regen);
      if (node.power_output) totalPower += Number(node.power_output);
      if (node.cooler_cooling_rate) totalCooling += Number(node.cooler_cooling_rate);
      if (node.quantum_speed && Number(node.quantum_speed) > maxQuantumSpeed) {
        maxQuantumSpeed = Number(node.quantum_speed);
      }
      if (node.thruster_max_thrust) totalThrust += Number(node.thruster_max_thrust);

      if (node.children && node.children.length > 0) {
        node.children.forEach(traverse);
      } else if (isOrdnanceLeaf(node)) {
        totalMissiles += node.count || 1;
      }
    };

    for (const sec of groupedSections) {
      for (const root of sec.nodes) {
        traverse(root);
      }
    }

    return {
      totalGunDps: Math.round(totalGunDps),
      totalMissiles,
      totalShieldHp: Math.round(totalShieldHp),
      totalShieldRegen: Math.round(totalShieldRegen),
      totalPower: Math.round(totalPower),
      totalCooling: Math.round(totalCooling),
      maxQuantumSpeed: Math.round(maxQuantumSpeed / 1000),
      totalThrust: Math.round(totalThrust / 1000),
    };
  }, [groupedSections]);

  // Build dynamic navigation tabs based strictly on present equipment
  const tabs = useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      count: number;
      icon: React.ElementType;
      badge?: string;
    }> = groupedSections
      .filter((sec) => sec.key !== 'modules')
      .map((sec) => {
        const Icon = SECTION_ICONS[sec.iconName] || LayersIcon;
        const labelDef = TAB_LABELS[sec.key];
        const label = labelDef ? (isFr ? labelDef.fr : labelDef.en) : sec.title;
        const badge = getSectionBadge(sec, isFr);

        return {
          id: sec.key,
          label,
          count: sec.nodes.length,
          icon: Icon,
          badge,
        };
      });

    // Modules: the API rows (with alternatives to pick from) win over the bare tree hosts
    const moduleCount = activeModules.length || modulesSection?.nodes.length || 0;
    if (moduleCount > 0) {
      list.push({
        id: 'modules',
        label: isFr ? TAB_LABELS.modules.fr : TAB_LABELS.modules.en,
        count: moduleCount,
        icon: LayersIcon,
        badge: hasCustomModules ? (isFr ? 'perso.' : 'custom') : undefined,
      });
    }

    return list;
  }, [groupedSections, activeModules, modulesSection, hasCustomModules, isFr]);

  // Auto-switch to first non-empty tab if activeTab is not found
  const effectiveTab = useMemo(() => {
    if (tabs.some((t) => t.id === activeTab)) return activeTab;
    return tabs[0]?.id ?? 'fixed_weapons';
  }, [tabs, activeTab]);

  const activeSection = groupedSections.find((s) => s.key === effectiveTab);

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

  return (
    <div className="space-y-4">
      {/* ── Cockpit Telemetry Banner (Erkul Ship Metrics Overview) ── */}
      {(shipTotals.totalGunDps > 0 ||
        shipTotals.totalMissiles > 0 ||
        shipTotals.totalShieldHp > 0 ||
        shipTotals.totalPower > 0 ||
        shipTotals.totalCooling > 0 ||
        shipTotals.maxQuantumSpeed > 0 ||
        shipTotals.totalThrust > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
          {shipTotals.totalGunDps > 0 && (
            <div className="flex flex-col px-2 py-1 bg-slate-900/60 rounded border border-slate-800/60">
              <span className="text-[10px] font-mono-sc text-slate-500 uppercase flex items-center gap-1">
                <Crosshair size={11} className="text-amber-400" />
                {isFr ? 'Feu Pilote' : 'Burst DPS'}
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono-sc text-amber-400 tabular-nums">
                {shipTotals.totalGunDps.toLocaleString()} DPS
              </span>
            </div>
          )}

          {shipTotals.totalMissiles > 0 && (
            <div className="flex flex-col px-2 py-1 bg-slate-900/60 rounded border border-slate-800/60">
              <span className="text-[10px] font-mono-sc text-slate-500 uppercase flex items-center gap-1">
                <Rocket size={11} className="text-orange-400" />
                {isFr ? 'Munitions' : 'Ordnance'}
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono-sc text-orange-400 tabular-nums">
                {shipTotals.totalMissiles} {isFr ? 'missiles' : 'missiles'}
              </span>
            </div>
          )}

          {shipTotals.totalShieldHp > 0 && (
            <div className="flex flex-col px-2 py-1 bg-slate-900/60 rounded border border-slate-800/60">
              <span className="text-[10px] font-mono-sc text-slate-500 uppercase flex items-center gap-1">
                <Shield size={11} className="text-cyan-400" />
                {isFr ? 'Bouclier' : 'Shields'}
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono-sc text-cyan-400 tabular-nums">
                {shipTotals.totalShieldHp.toLocaleString()} HP
              </span>
            </div>
          )}

          {shipTotals.maxQuantumSpeed > 0 && (
            <div className="flex flex-col px-2 py-1 bg-slate-900/60 rounded border border-slate-800/60">
              <span className="text-[10px] font-mono-sc text-slate-500 uppercase flex items-center gap-1">
                <Compass size={11} className="text-purple-400" />
                {isFr ? 'Vitesse QT' : 'QT Speed'}
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono-sc text-purple-400 tabular-nums">
                {shipTotals.maxQuantumSpeed.toLocaleString()} km/s
              </span>
            </div>
          )}

          {shipTotals.totalPower > 0 && (
            <div className="flex flex-col px-2 py-1 bg-slate-900/60 rounded border border-slate-800/60">
              <span className="text-[10px] font-mono-sc text-slate-500 uppercase flex items-center gap-1">
                <Zap size={11} className="text-yellow-400" />
                {isFr ? 'Énergie' : 'Power'}
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono-sc text-yellow-400 tabular-nums">
                {shipTotals.totalPower.toLocaleString()} kW
              </span>
            </div>
          )}

          {shipTotals.totalCooling > 0 && (
            <div className="flex flex-col px-2 py-1 bg-slate-900/60 rounded border border-slate-800/60">
              <span className="text-[10px] font-mono-sc text-slate-500 uppercase flex items-center gap-1">
                <Snowflake size={11} className="text-teal-400" />
                {isFr ? 'Refroid.' : 'Cooling'}
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono-sc text-teal-400 tabular-nums">
                {shipTotals.totalCooling.toLocaleString()} kW
              </span>
            </div>
          )}

          {shipTotals.totalThrust > 0 && (
            <div className="flex flex-col px-2 py-1 bg-slate-900/60 rounded border border-slate-800/60">
              <span className="text-[10px] font-mono-sc text-slate-500 uppercase flex items-center gap-1">
                <Gauge size={11} className="text-sky-400" />
                {isFr ? 'Poussée' : 'Thrust'}
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono-sc text-sky-400 tabular-nums">
                {shipTotals.totalThrust.toLocaleString()} kN
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Cockpit Header: Section Tabs with live counters & telemetry badges ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1">
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
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono-sc transition-all border shrink-0 ${
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
          activeSection?.subgroups && activeSection.subgroups.length > 0 ? (
            /* Specialized: one block per specialty (mining, salvage, tractor, tactical…) */
            <div className="space-y-5">
              {activeSection.subgroups.map((group) => {
                const visible = group.nodes.filter((n) => displayedNodes.includes(n));
                if (visible.length === 0) return null;
                return (
                  <div key={group.tag} className="space-y-2.5">
                    <h4 className="flex items-center gap-2 text-[10px] font-mono-sc uppercase tracking-wider text-amber-300/90">
                      <Wrench size={11} className="text-amber-400" />
                      {group.title}
                      <span className="text-slate-500">({visible.length})</span>
                    </h4>
                    <div className="space-y-3">
                      {visible.map((node) => (
                        <ErkulNodeRow key={node.id} node={node} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {displayedNodes.map((node) => (
                <ErkulNodeRow key={node.id} node={node} />
              ))}
            </div>
          )
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
      ) : activeModules.length > 0 ? (
        /* Interchangeable modules (Retaliator, Apollo, Aurora Mk2, Cyclone…) */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-sc text-slate-400">
            <span className="flex items-center gap-1.5">
              {isRecomputing && <Loader2 size={12} className="animate-spin text-purple-400" />}
              {isFr
                ? 'Changer un module recalcule tout l’arbre : ses armes, racks et boucliers rejoignent leurs onglets.'
                : 'Swapping a module recomputes the whole tree: its weapons, racks and shields join their own tabs.'}
            </span>
            {hasCustomModules && onResetModules && (
              <button
                type="button"
                onClick={onResetModules}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-700 hover:border-purple-500/60 text-slate-300 hover:text-white transition-colors"
              >
                <RotateCcw size={11} />
                {isFr ? 'Configuration d’usine' : 'Factory configuration'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeModules.map((mod) => {
              const options = moduleSlots.find((slot) => slot[0]?.slot_name === mod.slot_name) ?? [];
              const contributions = moduleContributions.get(mod.slot_name) ?? [];
              const moduleLabel = humanizeModuleName(mod.module_class_name, language, mod.module_tier);
              return (
                <div
                  key={mod.slot_name}
                  className="p-3.5 rounded-xl border border-purple-900/40 bg-purple-950/10 hover:border-purple-700/50 transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono-sc uppercase text-purple-400 font-bold" title={mod.slot_name}>
                      {humanizeModuleSlot(mod.slot_name, language, mod.slot_type)}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono-sc border font-semibold ${
                        mod.is_default
                          ? 'bg-slate-900/80 text-slate-300 border-slate-700/60'
                          : 'bg-purple-900/60 text-purple-200 border-purple-700/60'
                      }`}
                    >
                      {mod.is_default ? (isFr ? 'D’usine' : 'Factory') : isFr ? 'Personnalisé' : 'Custom'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="text-sm font-rajdhani font-bold text-white" title={mod.module_class_name}>
                      {moduleLabel}
                    </h4>

                    {options.length > 1 && onModuleChange && (
                      <select
                        aria-label={isFr ? 'Choisir le module' : 'Choose module'}
                        value={mod.module_class_name}
                        onChange={(e) => onModuleChange(mod.slot_name, e.target.value)}
                        className="w-full bg-slate-900 border border-purple-800/60 text-xs font-mono-sc text-purple-300 rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
                      >
                        {options.map((opt) => (
                          <option key={opt.module_class_name} value={opt.module_class_name}>
                            {humanizeModuleName(opt.module_class_name, language, opt.module_tier)}
                            {opt.is_default ? (isFr ? ' (usine)' : ' (factory)') : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* What the module brings, with a jump to the tab where it now lives */}
                  {contributions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-purple-900/30">
                      {contributions.map(({ node, sectionKey, count }) => (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(sectionKey);
                            setFilterSearch('');
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950/70 border border-slate-800 hover:border-purple-500/50 text-[10px] font-mono-sc text-slate-300 hover:text-white transition-colors"
                        >
                          <SizeBadge size={node.component_size} lang={language} />
                          {count > 1 ? `${count}x ` : ''}
                          {node.component_name || node.humanPortName}
                          <span className="text-slate-500">
                            → {isFr ? TAB_LABELS[sectionKey]?.fr : TAB_LABELS[sectionKey]?.en}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] font-mono-sc text-slate-500 pt-1 border-t border-purple-900/30">
                      {isFr
                        ? 'Aucun équipement monté — module de fret ou d’aménagement intérieur.'
                        : 'No mounted equipment — cargo or interior fit-out module.'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Module hosts found in the tree, without alternatives in the database */
        <div className="space-y-3">
          {(modulesSection?.nodes ?? []).map((node) => (
            <ErkulNodeRow key={node.id} node={node} />
          ))}
        </div>
      )}
    </div>
  );
}
