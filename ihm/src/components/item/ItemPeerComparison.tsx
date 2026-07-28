'use client';

import { useQuery } from '@tanstack/react-query';
import { PeerRankPanel, peerValues } from '@/components/ui/PeerRankPanel';
import { api } from '@/services/api';
import type { Item } from '@/types/api';

/**
 * La statistique qui décide, pour chaque famille d'objet.
 *
 * Une arme se choisit sur ses dégâts par seconde, une pièce d'armure sur sa
 * réduction de dégâts. Vérifié sur la base : 207 des 372 armes FPS portent un
 * DPS, et les torses, jambes, bras, casques et sous-combinaisons ont leur
 * réduction à 99 %.
 *
 * Les sacs à dos en sont dépourvus — ils ne réduisent rien, c'est leur nature et
 * non un manque. Vêtements, outils et consommables n'ont pas de statistique qui
 * les départage : la comparaison ne s'affiche pas pour eux.
 */
const DECIDING_STAT: Record<string, { field: keyof Item; label: string; unit?: string }> = {
  FPS_Weapon: { field: 'weapon_dps', label: 'DPS' },
  Armor_Torso: { field: 'armor_damage_reduction', label: 'Damage reduction' },
  Armor_Legs: { field: 'armor_damage_reduction', label: 'Damage reduction' },
  Armor_Arms: { field: 'armor_damage_reduction', label: 'Damage reduction' },
  Armor_Helmet: { field: 'armor_damage_reduction', label: 'Damage reduction' },
  Undersuit: { field: 'armor_damage_reduction', label: 'Damage reduction' },
};

/**
 * Compare un objet à ceux de même famille.
 *
 * La cohorte se resserre sur le sous-type quand il existe — un fusil de précision
 * n'a pas à être jugé face à un pistolet, leurs dégâts par seconde ne visent pas
 * le même usage.
 */
export function ItemPeerComparison({ item, env }: { item: Item; env?: string }) {
  const stat = DECIDING_STAT[item.type ?? ''];
  const cohort = item.sub_type ?? item.type;

  const { data: peers } = useQuery({
    queryKey: ['items.peers', item.type, item.sub_type, env],
    queryFn: () =>
      api.items.list({
        types: item.type!,
        ...(item.sub_type ? { sub_types: item.sub_type } : {}),
        limit: 200,
        env,
      }),
    enabled: Boolean(stat),
  });

  if (!stat || !cohort) return null;

  return (
    <PeerRankPanel
      ownUuid={item.uuid}
      peers={peerValues(peers?.data ?? [], stat.field as string)}
      statLabel={stat.label}
      cohortLabel={cohort.replace(/_/g, ' ')}
      unit={stat.unit}
    />
  );
}
