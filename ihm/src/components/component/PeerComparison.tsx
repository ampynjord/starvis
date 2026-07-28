'use client';

import { useQuery } from '@tanstack/react-query';
import { PeerRankPanel, peerValues } from '@/components/ui/PeerRankPanel';
import { api } from '@/services/api';
import type { Component } from '@/types/api';

/**
 * La statistique qui décide, pour chaque famille de composant.
 *
 * Un bouclier se choisit sur ses points, un propulseur sur sa poussée. Ce sont
 * les mêmes valeurs que la fiche met déjà en avant — ce tableau ne fait que dire
 * laquelle compare.
 *
 * Les familles absentes n'ont pas de statistique unique qui les départage :
 * plutôt qu'en inventer une, la comparaison ne s'affiche pas.
 *
 * **Refroidisseurs et centrales sont volontairement absents.** Leurs statistiques
 * déterminantes — `cooling_rate`, `power_output` — ne sont renseignées pour aucun
 * des 76 et 98 composants concernés. Les inscrire ici ne produirait rien, sinon
 * l'illusion que la comparaison existe. L'audit de vérité suit ce trou pour
 * qu'il se referme un jour.
 */
const DECIDING_STAT: Record<string, { field: keyof Component; label: string; unit?: string }> = {
  Shield: { field: 'shield_hp', label: 'Shield HP' },
  QuantumDrive: { field: 'qd_speed', label: 'Quantum speed' },
  WeaponGun: { field: 'weapon_dps', label: 'DPS' },
  Thruster: { field: 'thruster_max_thrust', label: 'Max thrust' },
  FuelTank: { field: 'fuel_capacity', label: 'Capacity', unit: 'L' },
  FuelIntake: { field: 'fuel_intake_rate', label: 'Intake rate' },
  Radar: { field: 'radar_range', label: 'Radar range' },
  Missile: { field: 'missile_damage', label: 'Damage' },
  Torpedo: { field: 'missile_damage', label: 'Damage' },
  Bomb: { field: 'missile_damage', label: 'Damage' },
};

/**
 * Compare un composant à ceux de même famille **et de même taille**.
 *
 * La taille fait partie de la cohorte : juger un bouclier de taille 3 face à un
 * taille 1 ferait passer la taille pour de la qualité.
 */
export function PeerComparison({ component, env }: { component: Component; env?: string }) {
  const stat = DECIDING_STAT[component.type ?? ''];
  const size = component.size;

  const { data: peers } = useQuery({
    queryKey: ['components.peers', component.type, size, env],
    queryFn: () => api.components.list({ type: component.type!, size: Number(size), limit: 200, env }),
    // Sans statistique décisive ni taille, il n'y a pas de cohorte : ne pas
    // interroger l'API pour rien.
    enabled: Boolean(stat && size != null),
  });

  if (!stat || size == null) return null;

  return (
    <PeerRankPanel
      ownUuid={component.uuid}
      peers={peerValues(peers?.data ?? [], stat.field as string)}
      statLabel={stat.label}
      cohortLabel={`size ${size}`}
      unit={stat.unit}
    />
  );
}
