'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { api } from '@/services/api';
import type { Component } from '@/types/api';

/**
 * La statistique qui décide, pour chaque famille de composant.
 *
 * Un refroidisseur se choisit sur son taux de refroidissement, un bouclier sur
 * ses points, un propulseur sur sa poussée. Ce sont les mêmes valeurs que la
 * fiche met déjà en avant — ce tableau ne fait que dire laquelle compare.
 *
 * Les familles absentes n'ont pas de statistique unique qui les départage :
 * plutôt qu'en inventer une, la comparaison ne s'affiche pas.
 */
const DECIDING_STAT: Record<string, { field: keyof Component; label: string; unit?: string }> = {
  Cooler: { field: 'cooling_rate', label: 'Cooling rate' },
  Shield: { field: 'shield_hp', label: 'Shield HP' },
  PowerPlant: { field: 'power_output', label: 'Power output', unit: 'W' },
  QuantumDrive: { field: 'qd_speed', label: 'Quantum speed' },
  WeaponGun: { field: 'weapon_dps', label: 'DPS' },
  Thruster: { field: 'thruster_max_thrust', label: 'Max thrust' },
  FuelTank: { field: 'fuel_capacity', label: 'Capacity', unit: 'L' },
  FuelIntake: { field: 'fuel_intake_rate', label: 'Intake rate' },
  Missile: { field: 'missile_damage', label: 'Damage' },
  Torpedo: { field: 'missile_damage', label: 'Damage' },
  Bomb: { field: 'missile_damage', label: 'Damage' },
};

const numeric = (value: unknown): number | null => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Situe un composant parmi ses pairs de même famille et même taille.
 *
 * C'est la question qu'on se pose devant une fiche — « est-il bon ? » — et à
 * laquelle une liste de chiffres absolus ne répond pas. Un refroidissement de
 * 68 ne dit rien ; « 2ᵉ sur 11 » dit tout.
 *
 * La comparaison ne porte que sur les composants de **même taille** : un
 * bouclier de taille 3 n'a pas à être jugé face à un taille 1, et les mêler
 * ferait passer la taille pour de la qualité.
 */
export function PeerComparison({ component, env }: { component: Component; env?: string }) {
  const stat = DECIDING_STAT[component.type ?? ''];
  const size = component.size;
  const own = stat ? numeric(component[stat.field]) : null;

  const { data: peers } = useQuery({
    queryKey: ['components.peers', component.type, size, env],
    queryFn: () => api.components.list({ type: component.type!, size: Number(size), limit: 200, env }),
    // Sans statistique décisive, sans taille ou sans valeur propre, il n'y a rien
    // à comparer : ne pas interroger l'API pour rien.
    enabled: Boolean(stat && size != null && own != null),
  });

  if (!stat || own == null || size == null) return null;

  const values = (peers?.data ?? [])
    .map((peer) => ({ uuid: peer.uuid, name: peer.name, value: numeric((peer as unknown as Record<string, unknown>)[stat.field as string]) }))
    .filter((peer): peer is { uuid: string; name: string; value: number } => peer.value != null && peer.value > 0);

  // Un seul composant dans sa catégorie ne se compare à personne. Afficher
  // « 1er sur 1 » serait une flatterie vide.
  if (values.length < 2) return null;

  const sorted = [...values].sort((a, b) => b.value - a.value);
  const rank = sorted.findIndex((peer) => peer.uuid === component.uuid) + 1;
  if (rank === 0) return null;

  const best = sorted[0];
  const median = sorted[Math.floor(sorted.length / 2)].value;
  const share = median > 0 ? (own / median) * 100 - 100 : null;
  const topThird = rank <= Math.ceil(sorted.length / 3);

  return (
    <ScifiPanel
      title="Against its peers"
      subtitle={`${stat.label} · size ${size}`}
      actions={<BarChart3 size={14} className="text-cyan-700" />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sci-panel px-4 py-3">
          <p className="text-[9px] font-mono-sc uppercase tracking-widest text-slate-600 mb-1">Rank</p>
          <p className={`text-xl font-orbitron font-black tabular-nums ${topThird ? 'text-cyan-300' : 'text-slate-300'}`}>
            {rank}
            <span className="text-sm font-normal text-slate-500"> / {sorted.length}</span>
          </p>
          <p className="text-xs font-mono-sc text-slate-600">among size {size}</p>
        </div>

        <div className="sci-panel px-4 py-3">
          <p className="text-[9px] font-mono-sc uppercase tracking-widest text-slate-600 mb-1">Vs. median</p>
          {share == null ? (
            <p className="text-sm font-mono-sc text-slate-600">—</p>
          ) : (
            <p className={`text-xl font-orbitron font-black tabular-nums ${share >= 0 ? 'text-green-400' : 'text-amber-400'}`}>
              {share >= 0 ? '+' : ''}
              {share.toFixed(0)}%
            </p>
          )}
          <p className="text-xs font-mono-sc text-slate-600">{stat.label.toLowerCase()}</p>
        </div>

        <div className="sci-panel px-4 py-3">
          <p className="text-[9px] font-mono-sc uppercase tracking-widest text-slate-600 mb-1">Best of this size</p>
          <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate">{best.name}</p>
          <p className="text-xs font-mono-sc text-slate-500 tabular-nums">
            {best.value.toLocaleString('en-US')}
            {stat.unit ? ` ${stat.unit}` : ''}
          </p>
        </div>
      </div>
    </ScifiPanel>
  );
}
