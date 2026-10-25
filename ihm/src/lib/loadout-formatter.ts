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
  weapon_dps?: number | null;
  weapon_damage?: number | null;
  weapon_fire_rate?: number | null;
  weapon_range?: number | null;
  weapon_damage_type?: string | null;
  weapon_ammo_count?: number | null;
  shield_hp?: number | null;
  shield_regen?: number | null;
  quantum_speed?: number | null;
  quantum_range?: number | null;
  quantum_spool_time?: number | null;
  cooler_cooling_rate?: number | null;
  power_output?: number | null;
  children?: RawLoadoutSlot[];
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
  component_class_name?: string | null;
  component_name?: string | null;
  component_type?: string | null;
  component_sub_type?: string | null;
  component_size?: number | string | null;
  component_grade?: string | null;
  component_manufacturer?: string | null;
  weapon_dps?: number | null;
  weapon_damage?: number | null;
  weapon_fire_rate?: number | null;
  weapon_range?: number | null;
  weapon_damage_type?: string | null;
  weapon_ammo_count?: number | null;
  shield_hp?: number | null;
  shield_regen?: number | null;
  quantum_speed?: number | null;
  quantum_range?: number | null;
  quantum_spool_time?: number | null;
  cooler_cooling_rate?: number | null;
  power_output?: number | null;
  count?: number;
  children: LoadoutNode[];
}

export interface GroupedLoadoutSection {
  key: LoadoutGroupKey;
  title: string;
  iconName: 'crosshair' | 'shield' | 'zap' | 'wrench' | 'navigation' | 'rocket';
  nodes: LoadoutNode[];
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

export function isNoisyPort(portName?: string | null, componentClassName?: string | null, componentName?: string | null): boolean {
  const p = (portName || '').toLowerCase();
  const c = (componentClassName || '').toLowerCase();
  const n = (componentName || '').toLowerCase();

  if (n.includes('placeholder') || c.includes('placeholder')) return true;
  if (p.includes('controller_') || p.includes('_controller')) return true;
  if (p.includes('radar_helper') || p.includes('display_hud') || p.includes('screen_mfd')) return true;
  if (p.includes('screen_annunciator') || p.includes('dashboard_pilot')) return true;
  if (p.includes('self_destruct') || p.includes('seat_') || p.includes('cockpit_flair')) return true;
  if (p.includes('airlock') || p.includes('door') || p.includes('ladder') || p.includes('toilet') || p.includes('bed')) return true;
  if (p.includes('light') || p.includes('hatch') || p.includes('fuse') || p.includes('relay')) return true;
  if (p.includes('landingpad') || p.includes('fuel_port') || p.includes('air_traffic')) return true;
  if (p.startsWith('$slot') || p.startsWith('bar') || p.startsWith('mec') || p.startsWith('pow') || p.startsWith('ven')) return true;
  return false;
}

/**
 * Transforms technical hardpoint identifiers into clean human-readable labels.
 */
export function humanizePortName(portName: string, portType: string, lang: SupportedLanguage): string {
  if (!portName) return portType || '';

  const isFr = lang === 'fr';
  const lowerName = portName.toLowerCase();

  // Child slots should not expose cryptic class names
  if (/^hardpoint_class_\d+/i.test(portName)) {
    return isFr ? 'Arme montée' : 'Mounted Weapon';
  }
  if (/^missile_\d+_attach/i.test(portName)) {
    const num = portName.match(/\d+/)?.[0] ?? '1';
    return isFr ? `Emplacement missile #${parseInt(num, 10)}` : `Missile Slot #${parseInt(num, 10)}`;
  }

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

  // Base label mapping based on portType or portName keywords
  let baseLabel = '';
  const lowerType = (portType || '').toLowerCase();

  // Distinguish Jump Module and Quantum Drive explicitly (Erkul standard)
  if (lowerType.includes('jump') || lowerName.includes('jump')) {
    baseLabel = isFr ? 'Module de saut' : 'Jump Module';
  } else if (lowerType === 'quantumdrive' || lowerName.includes('quantum')) {
    baseLabel = isFr ? 'Moteur quantique' : 'Quantum Drive';
  } else if (lowerType === 'weapongun' || lowerName.includes('weapon') || lowerName.includes('gun')) {
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
  component_class_name?: string | null;
}): LoadoutGroupKey {
  const compType = (slot.component_type || '').toLowerCase();
  const portType = (slot.port_type || '').toLowerCase();
  const name = (slot.port_name || '').toLowerCase();
  const className = (slot.component_class_name || '').toUpperCase();

  // 1. Jump Module (strictly separate from Quantum Drive as in Erkul)
  if (
    compType === 'jumpmodule' ||
    compType === 'jumpdrive' ||
    portType === 'jumpmodule' ||
    portType === 'jumpdrive' ||
    name.includes('jump_drive') ||
    name.includes('jump') ||
    className.startsWith('JDRV')
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

function flattenSlots(slots: RawLoadoutSlot[], parentId: number | null = null, idCounter = { current: 1 }): RawLoadoutSlot[] {
  const result: RawLoadoutSlot[] = [];
  for (const s of slots) {
    const id = s.id != null ? Number(s.id) : idCounter.current++;
    const actualParentId = s.parent_id != null ? Number(s.parent_id) : parentId;
    const flatSlot: RawLoadoutSlot = { ...s, id, parent_id: actualParentId };
    result.push(flatSlot);
    if (Array.isArray(s.children) && s.children.length > 0) {
      result.push(...flattenSlots(s.children, id, idCounter));
    }
  }
  return result;
}

/**
 * Builds a hierarchical tree of loadout nodes (e.g. Turret -> Gimbal -> Gun, or Rack -> Missiles),
 * strictly separating Quantum Drive and Jump Module, matching Erkul.games architecture.
 */
export function buildLoadoutTree(slots: RawLoadoutSlot[], lang: SupportedLanguage): GroupedLoadoutSection[] {
  const isFr = lang === 'fr';

  // Support both flat array and nested pre-structured arrays
  const flat = flattenSlots(slots);

  const nodeMap = new Map<number, LoadoutNode>();
  const allNodes: LoadoutNode[] = [];

  for (let idx = 0; idx < flat.length; idx++) {
    const s = flat[idx];
    if (isNoisyPort(s.port_name, s.component_class_name, s.component_name)) {
      continue;
    }

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
      component_class_name: s.component_class_name,
      component_name: s.component_name,
      component_type: s.component_type,
      component_sub_type: s.component_sub_type,
      component_size: s.component_size ?? s.port_max_size ?? s.port_min_size,
      component_grade: s.component_grade,
      component_manufacturer: s.component_manufacturer,
      weapon_dps: s.weapon_dps,
      weapon_damage: s.weapon_damage,
      weapon_fire_rate: s.weapon_fire_rate,
      weapon_range: s.weapon_range,
      weapon_damage_type: s.weapon_damage_type,
      weapon_ammo_count: s.weapon_ammo_count,
      shield_hp: s.shield_hp,
      shield_regen: s.shield_regen,
      quantum_speed: s.quantum_speed,
      quantum_range: s.quantum_range,
      quantum_spool_time: s.quantum_spool_time,
      cooler_cooling_rate: s.cooler_cooling_rate,
      power_output: s.power_output,
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

  // Lift Jump Module if it was nested inside Quantum Drive (standard Erkul architecture)
  for (const root of [...rootNodes]) {
    if (
      root.port_type === 'QuantumDrive' ||
      (root.component_type || '').toLowerCase() === 'quantumdrive' ||
      root.port_name.toLowerCase().includes('quantum')
    ) {
      const jumpChildIdx = root.children.findIndex(
        (c) =>
          c.port_name.toLowerCase().includes('jump') ||
          (c.component_type || '').toLowerCase().includes('jump') ||
          (c.component_class_name || '').toUpperCase().startsWith('JDRV'),
      );
      if (jumpChildIdx >= 0) {
        const jumpChild = root.children[jumpChildIdx];
        const standaloneJump: LoadoutNode = {
          ...jumpChild,
          parentId: null,
          port_type: 'JumpDrive',
          humanPortName: isFr ? 'Module de saut' : 'Jump Module',
          children: [...jumpChild.children],
        };
        rootNodes.push(standaloneJump);
      }
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
