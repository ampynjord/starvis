import type { SupportedLanguage } from '@/lib/i18n';

export interface RawLoadoutSlot {
  id?: number | string | null;
  parent_id?: number | string | null;
  port_name?: string;
  port_type?: string;
  port_min_size?: number | null;
  port_max_size?: number | null;
  component_class_name?: string | null;
  component_uuid?: string | null;
  component_name?: string | null;
  component_type?: string | null;
  component_sub_type?: string | null;
  component_size?: number | string | null;
  component_grade?: string | null;
  component_manufacturer?: string | null;
  [key: string]: any;
}

export type LoadoutGroupKey = 'weapons' | 'missiles' | 'systems' | 'propulsion' | 'jump' | 'utility';

export interface LoadoutNode {
  id: number;
  parentId: number | null;
  port_name: string;
  port_type: string;
  humanPortName: string;
  component_uuid?: string | null;
  component_name?: string | null;
  component_type?: string | null;
  component_sub_type?: string | null;
  component_size?: number | string | null;
  component_grade?: string | null;
  component_manufacturer?: string | null;
  count?: number;
  children: LoadoutNode[];
}

export interface GroupedLoadoutSection {
  key: LoadoutGroupKey;
  title: string;
  iconName: 'crosshair' | 'shield' | 'zap' | 'wrench' | 'navigation' | 'rocket';
  nodes: LoadoutNode[];
  // For backward compatibility with flat rendering if needed
  slots?: Array<RawLoadoutSlot & { humanPortName: string }>;
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

  // Distinguish Jump Module and Quantum Drive explicitly (Erkul standard)
  if (lowerType.includes('jump') || lowerName.includes('jump')) {
    baseLabel = isFr ? 'Module de saut' : 'Jump Module';
  } else if (lowerType === 'quantumdrive' || lowerName.includes('quantum')) {
    baseLabel = isFr ? 'Moteur quantique' : 'Quantum Drive';
  } else if (lowerType === 'weapongun' || lowerName.includes('weapon')) {
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

export function determineGroup(slot: {
  port_name?: string | null;
  port_type?: string | null;
  component_type?: string | null;
}): LoadoutGroupKey {
  const compType = (slot.component_type || '').toLowerCase();
  const portType = (slot.port_type || '').toLowerCase();
  const name = (slot.port_name || '').toLowerCase();

  // 1. Jump Module (strictly separate from Quantum Drive as in Erkul)
  if (
    compType === 'jumpmodule' ||
    compType === 'jumpdrive' ||
    portType === 'jumpmodule' ||
    portType === 'jumpdrive' ||
    name.includes('jump_drive') ||
    name.includes('jump')
  ) {
    return 'jump';
  }

  // 2. Missiles & Torpedoes
  if (
    compType === 'missilerack' ||
    compType === 'missile' ||
    compType === 'torpedo' ||
    portType === 'missilerack' ||
    name.includes('missile') ||
    name.includes('torpedo') ||
    name.includes('pylon')
  ) {
    return 'missiles';
  }

  // 3. Weapons & Turrets
  if (
    compType === 'weapongun' ||
    compType === 'turret' ||
    compType === 'gimbal' ||
    compType === 'mininglaser' ||
    compType === 'tractorbeam' ||
    portType === 'weapongun' ||
    portType === 'turret' ||
    portType === 'gimbal' ||
    name.includes('weapon') ||
    name.includes('turret') ||
    name.includes('gun')
  ) {
    return 'weapons';
  }

  // 4. Core Systems
  if (
    compType === 'shield' ||
    compType === 'cooler' ||
    compType === 'powerplant' ||
    compType === 'lifesupport' ||
    portType === 'shield' ||
    portType === 'cooler' ||
    portType === 'powerplant' ||
    name.includes('shield') ||
    name.includes('cooler') ||
    name.includes('power_plant') ||
    name.includes('powerplant') ||
    name.includes('life_support')
  ) {
    return 'systems';
  }

  // 5. Propulsion & Quantum Drive
  if (
    compType === 'quantumdrive' ||
    compType === 'fueltank' ||
    compType === 'thruster' ||
    portType === 'quantumdrive' ||
    name.includes('quantum') ||
    name.includes('thruster') ||
    name.includes('fuel')
  ) {
    return 'propulsion';
  }

  return 'utility';
}

/**
 * Builds a hierarchical tree of loadout nodes (e.g. Turret -> Gimbal -> Gun, or Rack -> Missiles),
 * strictly separating Quantum Drive and Jump Module, matching Erkul.games architecture.
 */
export function buildLoadoutTree(slots: RawLoadoutSlot[], lang: SupportedLanguage): GroupedLoadoutSection[] {
  const isFr = lang === 'fr';

  const nodeMap = new Map<number, LoadoutNode>();
  const allNodes: LoadoutNode[] = [];

  for (let idx = 0; idx < slots.length; idx++) {
    const s = slots[idx];
    const id = s.id != null ? Number(s.id) : idx + 1000;
    const parentId = s.parent_id != null ? Number(s.parent_id) : null;
    const humanPort = humanizePortName(s.port_name || '', s.component_type || s.port_type || '', lang);

    const node: LoadoutNode = {
      id,
      parentId,
      port_name: s.port_name || '',
      port_type: s.port_type || '',
      humanPortName: humanPort,
      component_uuid: s.component_uuid,
      component_name: s.component_name,
      component_type: s.component_type,
      component_sub_type: s.component_sub_type,
      component_size: s.component_size ?? s.port_max_size ?? s.port_min_size,
      component_grade: s.component_grade,
      component_manufacturer: s.component_manufacturer,
      children: [],
    };
    nodeMap.set(id, node);
    allNodes.push(node);
  }

  // Build tree
  const rootNodes: LoadoutNode[] = [];
  for (const node of allNodes) {
    if (node.parentId != null && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId)!;
      parent.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // Compact identical leaf children under the same mount (e.g. 4x Tempest II Missile)
  for (const node of nodeMap.values()) {
    if (node.children.length > 1) {
      const compacted: LoadoutNode[] = [];
      const seen = new Map<string, LoadoutNode>();
      for (const child of node.children) {
        if (child.children.length === 0 && child.component_name) {
          const key = `${child.component_name}_${child.component_size}`;
          if (seen.has(key)) {
            const existing = seen.get(key)!;
            existing.count = (existing.count || 1) + 1;
          } else {
            child.count = 1;
            seen.set(key, child);
            compacted.push(child);
          }
        } else {
          compacted.push(child);
        }
      }
      node.children = compacted;
    }
  }

  const groupDefs: Array<{
    key: LoadoutGroupKey;
    title: string;
    iconName: 'crosshair' | 'shield' | 'zap' | 'wrench' | 'navigation' | 'rocket';
  }> = [
    {
      key: 'weapons',
      title: isFr ? 'Armement & Tourelles' : 'Weapons & Turrets',
      iconName: 'crosshair',
    },
    {
      key: 'missiles',
      title: isFr ? 'Missiles & Râteliers' : 'Missiles & Racks',
      iconName: 'rocket',
    },
    {
      key: 'systems',
      title: isFr ? 'Systèmes & Boucliers' : 'Systems & Shields',
      iconName: 'shield',
    },
    {
      key: 'propulsion',
      title: isFr ? 'Propulsion & Quantum' : 'Propulsion & Quantum',
      iconName: 'zap',
    },
    {
      key: 'jump',
      title: isFr ? 'Module de saut & Navigation' : 'Jump Module & Navigation',
      iconName: 'navigation',
    },
    {
      key: 'utility',
      title: isFr ? 'Avionique & Utilitaires' : 'Avionics & Utilities',
      iconName: 'wrench',
    },
  ];

  const grouped = new Map<LoadoutGroupKey, LoadoutNode[]>();
  for (const def of groupDefs) {
    grouped.set(def.key, []);
  }

  for (const root of rootNodes) {
    const groupKey = determineGroup(root);
    const list = grouped.get(groupKey) || grouped.get('utility')!;
    list.push(root);
  }

  const result: GroupedLoadoutSection[] = [];
  for (const def of groupDefs) {
    const items = grouped.get(def.key) || [];
    if (items.length > 0) {
      items.sort((a, b) => {
        const sizeA = Number(a.component_size ?? 0);
        const sizeB = Number(b.component_size ?? 0);
        if (sizeB !== sizeA) return sizeB - sizeA;
        return a.humanPortName.localeCompare(b.humanPortName);
      });
      result.push({
        key: def.key,
        title: `${def.title} (${items.length})`,
        iconName: def.iconName,
        nodes: items,
      });
    }
  }

  return result;
}

/**
 * Backward compatibility helper for flat list consumers.
 */
export function groupLoadoutSlots(slots: RawLoadoutSlot[], lang: SupportedLanguage): GroupedLoadoutSection[] {
  return buildLoadoutTree(slots, lang);
}
