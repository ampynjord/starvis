import type { SupportedLanguage } from '@/lib/i18n';

export interface RawLoadoutSlot {
  port_name?: string;
  port_type?: string;
  port_min_size?: number | null;
  port_max_size?: number | null;
  component_class_name?: string | null;
  component_uuid?: string | null;
  component_name?: string | null;
  component_type?: string | null;
  component_sub_type?: string | null;
  component_size?: number | null;
  component_grade?: string | null;
  component_manufacturer?: string | null;
  [key: string]: any;
}

export type LoadoutGroupKey = 'weapons' | 'systems' | 'propulsion' | 'utility';

export interface GroupedLoadoutSection {
  key: LoadoutGroupKey;
  title: string;
  iconName: 'crosshair' | 'shield' | 'zap' | 'wrench';
  slots: Array<RawLoadoutSlot & { humanPortName: string }>;
}

const POSITION_WORDS_FR: Record<string, string> = {
  left: 'gauche',
  right: 'droite',
  top: 'dorsal',
  bottom: 'ventral',
  front: 'avant',
  rear: 'arrière',
  back: 'arrière',
  nose: 'de nez',
  chin: 'de menton',
  wing: 'd’aile',
  inner: 'intérieur',
  outer: 'extérieur',
  turret: 'tourelle',
  manned: 'habitée',
  remote: 'téléopérée',
  pilot: 'pilote',
  copilot: 'copilote',
};

const POSITION_WORDS_EN: Record<string, string> = {
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
  front: 'Front',
  rear: 'Rear',
  back: 'Back',
  nose: 'Nose',
  chin: 'Chin',
  wing: 'Wing',
  inner: 'Inner',
  outer: 'Outer',
  turret: 'Turret',
  manned: 'Manned',
  remote: 'Remote',
  pilot: 'Pilot',
  copilot: 'Copilot',
};

/**
 * Transforms technical hardpoint identifiers like `hardpoint_weapon_pilot_s4_left`
 * or `item_port_cooler_01` into clean human-readable labels.
 */
export function humanizePortName(portName: string, portType: string, lang: SupportedLanguage): string {
  if (!portName) return portType || '';

  // Clean raw prefixes
  let cleaned = portName
    .replace(/^hardpoint_/i, '')
    .replace(/^item_port_/i, '')
    .replace(/^turret_/i, '')
    .replace(/_/g, ' ')
    .trim();

  // Extract trailing numbers (e.g. "01", "1")
  const numMatch = cleaned.match(/\b0?([1-9]\d*)\b$/);
  const slotNumber = numMatch ? numMatch[1] : null;
  if (slotNumber) {
    cleaned = cleaned.replace(/\b0?[1-9]\d*$/, '').trim();
  }

  // Remove size tags from port name if redundant (e.g. "s4", "s03")
  cleaned = cleaned
    .replace(/\bs0?[1-9]\d*\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const isFr = lang === 'fr';

  // Base label mapping based on portType or portName keywords
  let baseLabel = '';
  const lowerType = (portType || '').toLowerCase();
  const lowerName = portName.toLowerCase();

  if (lowerType === 'weapongun' || lowerName.includes('weapon')) {
    baseLabel = isFr ? 'Point d’arme' : 'Weapon Hardpoint';
  } else if (lowerType === 'turret' || lowerName.includes('turret')) {
    baseLabel = isFr ? 'Tourelle' : 'Turret';
  } else if (lowerType === 'gimbal' || lowerName.includes('gimbal')) {
    baseLabel = isFr ? 'Support articulé' : 'Gimbal Mount';
  } else if (lowerType === 'missilerack' || lowerName.includes('missile')) {
    baseLabel = isFr ? 'Râtelier de missiles' : 'Missile Rack';
  } else if (lowerType === 'shield' || lowerName.includes('shield')) {
    baseLabel = isFr ? 'Bouclier' : 'Shield Generator';
  } else if (lowerType === 'cooler' || lowerName.includes('cooler')) {
    baseLabel = isFr ? 'Refroidisseur' : 'Cooler';
  } else if (lowerType === 'powerplant' || lowerName.includes('power_plant') || lowerName.includes('powerplant')) {
    baseLabel = isFr ? 'Générateur d’énergie' : 'Power Plant';
  } else if (lowerType === 'quantumdrive' || lowerName.includes('quantum')) {
    baseLabel = isFr ? 'Moteur quantique' : 'Quantum Drive';
  } else if (lowerType === 'jumpdrive' || lowerName.includes('jump')) {
    baseLabel = isFr ? 'Module de saut' : 'Jump Drive';
  } else if (lowerType === 'radar' || lowerName.includes('radar')) {
    baseLabel = isFr ? 'Radar' : 'Radar';
  } else if (lowerType === 'countermeasure' || lowerName.includes('countermeasure')) {
    baseLabel = isFr ? 'Contre-mesures' : 'Countermeasures';
  } else if (lowerType === 'fueltank' || lowerName.includes('fuel_tank')) {
    baseLabel = isFr ? 'Réservoir' : 'Fuel Tank';
  } else {
    baseLabel = portType || cleaned;
  }

  // Detect position descriptors
  const descriptors: string[] = [];
  const words = cleaned.toLowerCase().split(/\s+/);
  const dict = isFr ? POSITION_WORDS_FR : POSITION_WORDS_EN;

  for (const w of words) {
    if (dict[w] && !baseLabel.toLowerCase().includes(dict[w].toLowerCase())) {
      descriptors.push(dict[w]);
    }
  }

  // Deduplicate descriptors
  const uniqueDesc = Array.from(new Set(descriptors));

  let finalName = baseLabel;
  if (uniqueDesc.length > 0) {
    finalName += ` (${uniqueDesc.join(', ')})`;
  }
  if (slotNumber) {
    finalName += ` #${slotNumber}`;
  }

  return finalName;
}

export function determineGroup(slot: RawLoadoutSlot): LoadoutGroupKey {
  const type = (slot.component_type || slot.port_type || '').toLowerCase();
  const name = (slot.port_name || '').toLowerCase();

  if (
    type === 'weapongun' ||
    type === 'turret' ||
    type === 'missilerack' ||
    type === 'gimbal' ||
    type === 'mininglaser' ||
    type === 'tractorbeam' ||
    name.includes('weapon') ||
    name.includes('turret') ||
    name.includes('missile')
  ) {
    return 'weapons';
  }

  if (
    type === 'shield' ||
    type === 'cooler' ||
    type === 'powerplant' ||
    type === 'radar' ||
    type === 'scanner' ||
    name.includes('shield') ||
    name.includes('cooler') ||
    name.includes('power_plant') ||
    name.includes('radar')
  ) {
    return 'systems';
  }

  if (
    type === 'quantumdrive' ||
    type === 'jumpdrive' ||
    type === 'thruster' ||
    type === 'mainthruster' ||
    type === 'maneuverthruster' ||
    type === 'fueltank' ||
    type === 'fuelintake' ||
    name.includes('quantum') ||
    name.includes('thruster') ||
    name.includes('fuel')
  ) {
    return 'propulsion';
  }

  return 'utility';
}

export function groupLoadoutSlots(slots: RawLoadoutSlot[], lang: SupportedLanguage): GroupedLoadoutSection[] {
  const isFr = lang === 'fr';

  const groupDefs: Array<{
    key: LoadoutGroupKey;
    title: string;
    iconName: 'crosshair' | 'shield' | 'zap' | 'wrench';
  }> = [
    {
      key: 'weapons',
      title: isFr ? 'Armement & Tourelles' : 'Weapons & Turrets',
      iconName: 'crosshair',
    },
    {
      key: 'systems',
      title: isFr ? 'Avionique & Boucliers' : 'Avionics & Shields',
      iconName: 'shield',
    },
    {
      key: 'propulsion',
      title: isFr ? 'Propulsion & Saut' : 'Propulsion & Jump',
      iconName: 'zap',
    },
    {
      key: 'utility',
      title: isFr ? 'Systèmes Utilitaires' : 'Utility Systems',
      iconName: 'wrench',
    },
  ];

  const grouped = new Map<LoadoutGroupKey, Array<RawLoadoutSlot & { humanPortName: string }>>();
  for (const def of groupDefs) {
    grouped.set(def.key, []);
  }

  for (const slot of slots) {
    const groupKey = determineGroup(slot);
    const humanName = humanizePortName(slot.port_name || '', slot.port_type || '', lang);
    const list = grouped.get(groupKey) || grouped.get('utility')!;
    list.push({ ...slot, humanPortName: humanName });
  }

  // Sort each section by size descending, then port name
  const result: GroupedLoadoutSection[] = [];
  for (const def of groupDefs) {
    const items = grouped.get(def.key) || [];
    if (items.length > 0) {
      items.sort((a, b) => {
        const sizeA = a.component_size ?? a.port_max_size ?? 0;
        const sizeB = b.component_size ?? b.port_max_size ?? 0;
        if (sizeB !== sizeA) return sizeB - sizeA;
        return a.humanPortName.localeCompare(b.humanPortName);
      });
      result.push({
        key: def.key,
        title: `${def.title} (${items.length})`,
        iconName: def.iconName,
        slots: items,
      });
    }
  }

  return result;
}
