/**
 * ShipStatsBanner — Bloc de stats style DPS Calculator (erkul.games inspired)
 * Affiche : énergie (heat/power/shield), grille de hardpoints, mode SCM/NAV,
 * et tableau de vitesses selon le mode sélectionné.
 */

import { useState } from 'react';
import type { LoadoutNode, Ship } from '@/types/api';

// ── Helpers numériques ───────────────────────────────────
function n(v: unknown): number {
  return Number(v ?? 0) || 0;
}
function fK(val: number): string {
  if (val === 0) return '0';
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return val.toFixed(0);
}
function fSpeed(v: number | null | undefined, decimals = 0): string {
  if (v == null) return '—';
  return `${Number(v).toFixed(decimals)} m/s`;
}
function fDeg(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${Number(v).toFixed(0)} °/s`;
}
function fSCU(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)} SCU`;
}

// ── Couleurs par type de hardpoint ───────────────────────
interface HpStyle { bg: string; border: string; text: string }
const HP_STYLES: Record<string, HpStyle> = {
  WeaponGun:    { bg: 'bg-amber-950/60',  border: 'border-amber-700/60',  text: 'text-amber-400' },
  Weapon:       { bg: 'bg-amber-950/60',  border: 'border-amber-700/60',  text: 'text-amber-400' },
  Gimbal:       { bg: 'bg-amber-900/40',  border: 'border-amber-700/40',  text: 'text-amber-300' },
  Turret:       { bg: 'bg-amber-900/40',  border: 'border-amber-700/40',  text: 'text-amber-300' },
  MissileRack:  { bg: 'bg-orange-950/60', border: 'border-orange-700/60', text: 'text-orange-400' },
  Shield:       { bg: 'bg-cyan-950/60',   border: 'border-cyan-700/60',   text: 'text-cyan-400'  },
  PowerPlant:   { bg: 'bg-yellow-950/60', border: 'border-yellow-700/60', text: 'text-yellow-400' },
  Cooler:       { bg: 'bg-blue-950/60',   border: 'border-blue-800/60',   text: 'text-blue-400'  },
  QuantumDrive: { bg: 'bg-violet-950/60', border: 'border-violet-700/60', text: 'text-violet-400' },
  Radar:        { bg: 'bg-indigo-950/60', border: 'border-indigo-700/60', text: 'text-indigo-400' },
};
const HP_ORDER = ['WeaponGun','Weapon','Gimbal','Turret','MissileRack','Shield','PowerPlant','Cooler','QuantumDrive','Radar'];
const DEFAULT_HP_STYLE: HpStyle = { bg: 'bg-slate-800', border: 'border-slate-700', text: 'text-slate-500' };

const VISUAL_TYPES = new Set(HP_ORDER);
const NOISY_PATTERNS = ['controller','_door','radar_helper','fuel_tank','fuel_intake'];

// ── Types internes ───────────────────────────────────────
interface EnergyStats {
  powerOutput: number;
  powerDraw:   number;
  heat:        number;
  cooling:     number;
  shieldHp:    number;
}

interface HpSlot {
  type: string;
  size: number;
}

// ── Récursion sur l'arbre de loadout ─────────────────────
function flattenNodes(nodes: LoadoutNode[]): LoadoutNode[] {
  const result: LoadoutNode[] = [];
  for (const n of nodes) {
    result.push(n);
    if (n.children.length) result.push(...flattenNodes(n.children));
  }
  return result;
}

function computeEnergy(nodes: LoadoutNode[]): EnergyStats {
  const all = flattenNodes(nodes);
  let powerOutput = 0, powerDraw = 0, heat = 0, cooling = 0, shieldHp = 0;
  for (const node of all) {
    if (!node.component_uuid) continue;
    powerOutput += n(node.power_output);
    powerDraw   += n(node.power_draw);
    heat        += n(node.heat_generation);
    cooling     += n(node.cooling_rate);
    shieldHp    += n(node.shield_hp);
  }
  return { powerOutput, powerDraw, heat, cooling, shieldHp };
}

function extractHpSlots(nodes: LoadoutNode[]): HpSlot[] {
  const slots: HpSlot[] = [];
  for (const node of nodes) {
    if (!node.component_uuid) continue;
    const pn = node.port_name.toLowerCase();
    if (NOISY_PATTERNS.some(p => pn.includes(p))) continue;
    const type = node.port_type || node.component_type || '';
    if (!VISUAL_TYPES.has(type)) continue;
    slots.push({ type, size: n(node.component_size ?? node.port_max_size) || 1 });
  }
  slots.sort((a, b) => {
    const ai = HP_ORDER.indexOf(a.type), bi = HP_ORDER.indexOf(b.type);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return b.size - a.size;
  });
  return slots;
}

// ── Sub-composants UI ────────────────────────────────────
function StatPip({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center sci-panel py-2 px-1">
      <span className={`font-orbitron font-bold text-base leading-tight ${color}`}>{value}</span>
      <span className="text-[10px] font-mono-sc text-slate-600 mt-0.5 uppercase tracking-wide leading-tight text-center">{label}</span>
    </div>
  );
}

function EnergyBar({
  label, pct, right,
}: { label: string; pct: number; right: string }) {
  const over = pct > 100;
  const barColor = over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-cyan-600';
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px] font-mono-sc">
        <span className="text-slate-600 uppercase tracking-widest">{label}</span>
        <span className={over ? 'text-red-400' : 'text-slate-400'}>{right}</span>
      </div>
      <div className="h-1 bg-slate-800/80 rounded overflow-hidden">
        <div
          className={`h-full rounded transition-all ${barColor}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/[0.03] sci-panel">
      <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-wide">{label}</span>
      <span className="text-xs font-mono-sc text-slate-300">{value}</span>
    </div>
  );
}

// ── Composant principal ──────────────────────────────────
interface Props {
  ship: Ship;
  loadout: LoadoutNode[];
}

export function ShipStatsBanner({ ship, loadout }: Props) {
  const [mode, setMode] = useState<'scm' | 'nav'>('scm');

  const energy   = computeEnergy(loadout);
  const hpSlots  = extractHpSlots(loadout);
  const hasEnergy = energy.powerOutput > 0 || energy.powerDraw > 0;

  const consumptionPct = energy.powerOutput > 0
    ? Math.round((energy.powerDraw / energy.powerOutput) * 100)
    : 0;
  const heatPct = energy.cooling > 0
    ? Math.round((energy.heat / energy.cooling) * 100)
    : 0;

  // Shield HP : préfère le total calculé depuis le loadout, sinon ship.shield_hp
  const shieldHp = energy.shieldHp > 0 ? energy.shieldHp : n(ship.shield_hp);

  return (
    <div className="space-y-4">

      {/* ── 3 stats énergie ──────────────────────── */}
      {hasEnergy && (
        <div className="grid grid-cols-3 gap-2">
          <StatPip value={fK(energy.heat)}      label="Heat gen." color="text-orange-400" />
          <StatPip value={fK(energy.powerDraw)} label="Power draw" color="text-yellow-400" />
          <StatPip value={fK(shieldHp)}         label="Shield HP" color="text-cyan-400" />
        </div>
      )}

      {/* ── Barres énergie ───────────────────────── */}
      {hasEnergy && (
        <div className="space-y-2 px-0.5">
          <EnergyBar
            label="Power consumption"
            pct={consumptionPct}
            right={`${energy.powerDraw.toFixed(0)} / ${energy.powerOutput.toFixed(0)} W  (${consumptionPct}%)`}
          />
          {energy.cooling > 0 && (
            <EnergyBar
              label="Heat / Cooling"
              pct={heatPct}
              right={`${energy.heat.toFixed(0)} / ${energy.cooling.toFixed(0)}  (${heatPct}%)`}
            />
          )}
        </div>
      )}

      {/* ── Grille hardpoints ────────────────────── */}
      {hpSlots.length > 0 && (
        <div>
          <p className="text-[10px] font-mono-sc text-slate-700 uppercase tracking-widest mb-1.5">
            Hardpoints ({hpSlots.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {hpSlots.map((slot, i) => {
              const s = HP_STYLES[slot.type] ?? DEFAULT_HP_STYLE;
              return (
                <span
                  key={i}
                  title={slot.type}
                  className={`
                    inline-flex items-center justify-center
                    w-7 h-7 rounded text-xs font-mono-sc font-bold
                    border ${s.bg} ${s.border} ${s.text}
                  `}
                >
                  {slot.size}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mode SCM / NAV ───────────────────────── */}
      <div>
        <div className="flex gap-1 mb-3">
          {(['scm', 'nav'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`
                text-[10px] font-mono-sc uppercase tracking-widest px-3 py-1.5 rounded border transition-colors
                ${mode === m
                  ? 'bg-amber-900/30 border-amber-700/60 text-amber-400'
                  : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-400 hover:border-slate-600'
                }
              `}
            >
              {m} mode
            </button>
          ))}
        </div>

        {mode === 'scm' ? (
          <div className="space-y-1">
            <StatRow label="SCM Speed"  value={fSpeed(ship.scm_speed)} />
            <StatRow label="Boost Fwd"  value={fSpeed(ship.boost_speed_forward)} />
            <StatRow label="Boost Back" value={fSpeed(ship.boost_speed_backward)} />
            <StatRow label="Pitch"      value={fDeg(ship.pitch_max)} />
            <StatRow label="Yaw"        value={fDeg(ship.yaw_max)} />
            <StatRow label="Roll"       value={fDeg(ship.roll_max)} />
          </div>
        ) : (
          <div className="space-y-1">
            <StatRow label="Nav Max Speed"   value={fSpeed(ship.max_speed)} />
            <StatRow label="H₂ Fuel Cap."    value={fSCU(ship.hydrogen_fuel_capacity)} />
            <StatRow label="QT Fuel Cap."    value={fSCU(ship.quantum_fuel_capacity)} />
            <StatRow label="Crew"            value={ship.crew_size != null ? String(ship.crew_size) : '—'} />
            <StatRow label="Cargo"           value={ship.cargo_capacity != null ? `${Number(ship.cargo_capacity)} SCU` : '—'} />
            <StatRow label="Mass"            value={ship.mass != null ? `${Number(ship.mass).toLocaleString('en-US')} kg` : '—'} />
          </div>
        )}
      </div>
    </div>
  );
}
