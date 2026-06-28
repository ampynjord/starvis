import type { SmartTagId } from '@/components/ui/SmartTag';
import type { ComponentListItem, ItemListItem, ShipListItem } from '@/types/api';

export function generateShipTags(ship: ShipListItem): SmartTagId[] {
  const tags: SmartTagId[] = [];

  if (ship.scm_speed && ship.scm_speed >= 300) {
    tags.push('fastest');
  } else if (ship.max_speed && ship.max_speed >= 1250) {
    tags.push('fastest');
  }

  if (ship.total_hp && ship.total_hp > 100000) {
    tags.push('tank');
  }

  if (ship.total_hp && ship.total_hp < 25000 && ship.weapon_damage_total && ship.weapon_damage_total >= 2500) {
    tags.push('glass-cannon');
  }

  if (
    ship.min_purchase_price &&
    ship.min_purchase_price > 0 &&
    ship.min_purchase_price <= 1500000 &&
    ship.total_hp &&
    ship.total_hp >= 10000
  ) {
    tags.push('best-value');
  }

  return tags;
}

export function generateComponentTags(comp: ComponentListItem): SmartTagId[] {
  const tags: SmartTagId[] = [];

  if (comp.type === 'WeaponGun' && comp.weapon_dps && comp.weapon_dps > 500 * (comp.size || 1)) {
    tags.push('dps-monster');
  }

  if (comp.type === 'Shield' && comp.shield_hp && comp.shield_hp > 5000 * (comp.size || 1)) {
    tags.push('tank');
  }

  if (comp.power_output && comp.power_output < 0) {
    // If it draws a lot of power (some components express draw as negative or positive, assuming negative means draw here, or let's use a heuristic)
    tags.push('power-hungry');
  }

  if (comp.component_class === 'Stealth') {
    tags.push('stealth');
  }

  if (comp.grade === 'A' || comp.grade === '1') {
    tags.push('meta');
  }

  return tags;
}

export function generateItemTags(item: ItemListItem): SmartTagId[] {
  const tags: SmartTagId[] = [];

  if (item.type === 'WeaponPersonal' && item.weapon_dps && item.weapon_dps > 200) {
    tags.push('dps-monster');
  }

  if (item.armor_damage_reduction && item.armor_damage_reduction > 35) {
    tags.push('tank');
  }

  return tags;
}
