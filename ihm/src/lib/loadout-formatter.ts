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
  thruster_max_thrust?: number | null;
  thruster_type?: string | null;
  component_class?: string | null;
  weapon_speed?: number | null;
  weapon_burst_dps?: number | null;
  weapon_sustained_dps?: number | null;
  weapon_alpha_damage?: number | null;
  shield_hardening?: number | null;
  shield_faces?: number | null;
  qd_fuel_rate?: number | null;
  qd_cooldown?: number | null;
  em_signature?: number | null;
  ir_signature?: number | null;
  cm_ammo_count?: number | null;
  children?: RawLoadoutSlot[];
  [key: string]: any;
}

export type LoadoutGroupKey =
  | 'fixed_weapons'
  | 'turrets'
  | 'pds'
  | 'ordnance'
  | 'countermeasures'
  | 'quantum'
  | 'shields'
  | 'power_plants'
  | 'coolers'
  | 'radar'
  | 'life_support'
  | 'thrusters'
  | 'docked_vehicles'
  | 'specialized'
  | 'avionics_blades'
  | 'fuel'
  | 'modules'
  | 'paints'
  // Legacy backward-compatible keys
  | 'weapons'
  | 'missiles'
  | 'systems'
  | 'propulsion'
  | 'jump'
  | 'utility';

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
  component_class?: string | null;
  component_manufacturer?: string | null;
  docked_ship_uuid?: string | null;
  weapon_dps?: number | null;
  weapon_damage?: number | null;
  weapon_fire_rate?: number | null;
  weapon_range?: number | null;
  weapon_speed?: number | null;
  weapon_burst_dps?: number | null;
  weapon_sustained_dps?: number | null;
  weapon_alpha_damage?: number | null;
  weapon_damage_type?: string | null;
  weapon_ammo_count?: number | null;
  shield_hp?: number | null;
  shield_regen?: number | null;
  shield_regen_delay?: number | null;
  shield_hardening?: number | null;
  shield_faces?: number | null;
  quantum_speed?: number | null;
  quantum_range?: number | null;
  quantum_spool_time?: number | null;
  qd_fuel_rate?: number | null;
  qd_cooldown?: number | null;
  cooler_cooling_rate?: number | null;
  power_output?: number | null;
  power_draw?: number | null;
  power_base?: number | null;
  em_signature?: number | null;
  ir_signature?: number | null;
  thruster_max_thrust?: number | null;
  thruster_type?: string | null;
  cm_ammo_count?: number | null;
  categoryTag?: string;
  /** Spécialité fine des équipements du groupe `specialized`. */
  specialtyTag?: SpecialtyTag;
  /** Port du module modulaire dont provient ce nœud (ex. `hardpoint_front_module`). */
  moduleSlot?: string | null;
  /** Libellé du module installé dans ce port (ex. « Torpilles (Bomber) »). */
  sourceModule?: string | null;
  count?: number;
  children: LoadoutNode[];
}

export type SpecialtyTag = 'mining' | 'salvage' | 'tractor' | 'tactical' | 'docking' | 'utility';

export interface SpecialtySubgroup {
  tag: SpecialtyTag;
  title: string;
  nodes: LoadoutNode[];
}

export interface LoadoutTreeOptions {
  /**
   * Ports de modules connus (table `ship_modules`) et libellé du module installé.
   * Leurs ports internes sont reclassés dans leurs catégories naturelles
   * (le lance-torpilles d'un Retaliator Bomber rejoint les munitions).
   */
  moduleSlots?: Array<{ slotName: string; label?: string | null }>;
}

export interface GroupedLoadoutSection {
  key: LoadoutGroupKey;
  title: string;
  iconName:
    | 'crosshair'
    | 'target'
    | 'shield-alert'
    | 'rocket'
    | 'sparkles'
    | 'compass'
    | 'shield'
    | 'zap'
    | 'snowflake'
    | 'radio'
    | 'heart-pulse'
    | 'gauge'
    | 'anchor'
    | 'wrench'
    | 'cpu'
    | 'fuel'
    | 'layers'
    | 'palette';
  nodes: LoadoutNode[];
  badge?: string;
  /** Sous-groupes par spécialité (onglet Spécialisé uniquement). */
  subgroups?: SpecialtySubgroup[];
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
  center: 'central',
  main: 'principal',
  retro: 'de freinage',
  mav: 'de manœuvre',
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
  center: 'Center',
  main: 'Main',
  retro: 'Retro',
  mav: 'Maneuver',
};

/**
 * Aménagements intérieurs sans intérêt pour un loadout : tableaux de bord, consoles,
 * écrans, batteries, blindage, extincteurs, entretoises de soute, ascenseurs, HUD…
 *
 * Contrairement au reste du bruit, tout leur sous-arbre est écarté : l'armoire à
 * extincteur du Hull C contient une « arme » (l'extincteur) qui, remontée à la
 * racine, polluerait les armes pilote.
 */
const INTERIOR_FIXTURE_PORT_RX =
  /(?:^|_)(?:dashboard|engineeringscreen|engineering_screen|eng_console|console|cockpit_flair|ping|gravity_generator|gravgen|battery|armou?r|extinguisher|strut|centralwalkway|walkway|elevator|lift|ramp|target_selector|hud|projector|landingsystem|dummy|mission_cargo|cargo_addon|docking_floor|module_oc|flair|personal_storage|controls_screen|control_compacter|weapons_locker)(?:_|\d|$)/;
const INTERIOR_FIXTURE_CLASS_RX =
  /^armr_|^softlock_|^gadget_cabinet|^personalstorage_|_screen(?:_|$)|_lighting$|^projector_hud|_dashboard|_scitem_engineer_/;

export function isInteriorFixturePort(portName?: string | null, componentClassName?: string | null): boolean {
  const p = (portName || '').toLowerCase();
  const c = (componentClassName || '').toLowerCase();
  return INTERIOR_FIXTURE_PORT_RX.test(p) || INTERIOR_FIXTURE_CLASS_RX.test(c);
}

/**
 * Filter true noise ports (doors, seats, screens, fuses, lights) while strictly preserving
 * functional components, thrusters, fuel tanks, docking collars, and specialized tools.
 */
export function isNoisyPort(portName?: string | null, componentClassName?: string | null, componentName?: string | null): boolean {
  const p = (portName || '').toLowerCase();
  const c = (componentClassName || '').toLowerCase();
  const n = (componentName || '').toLowerCase();

  if (isInteriorFixturePort(portName, componentClassName)) return true;

  // Internal engine controllers (except flight computer which is a valid component)
  if ((p.includes('controller_') || c.includes('controller_')) && !p.includes('controller_flight') && !c.includes('controller_flight')) {
    return true;
  }

  // Doors, airlocks, ladders, seats, interior fixtures, cargo grids, panels, glass, buff modifiers, self-destruct
  if (
    p.includes('door') ||
    c.includes('door') ||
    p.includes('airlock') ||
    p.includes('ladder') ||
    p.includes('toilet') ||
    p.includes('bed') ||
    p.includes('seat') ||
    c.includes('seat') ||
    p.includes('cargogrid') ||
    c.includes('cargogrid') ||
    p.includes('cargobay') ||
    p.includes('cargo_bay') ||
    c.includes('cargobay') ||
    p.includes('glass') ||
    c.includes('glass') ||
    p.includes('buff') ||
    c.includes('buff') ||
    p.includes('control_panel') ||
    p.includes('panel_interior') ||
    c.includes('controlpanel') ||
    p.includes('selfdestruct') ||
    p.includes('self_destruct') ||
    c.includes('selfdestruct') ||
    p.includes('paint') ||
    p.includes('landingpad') ||
    p.includes('air_traffic') ||
    p.includes('fuse') ||
    p.includes('relay') ||
    p.includes('light') ||
    p.includes('hatch') ||
    p.includes('radar_helper') ||
    p.includes('display_hud') ||
    p.includes('screen_mfd') ||
    p.includes('screen_annunciator') ||
    p.includes('screen_radar') ||
    p.includes('screen_') ||
    c.includes('vehicle_screen') ||
    p.startsWith('$slot') ||
    p.startsWith('bar') ||
    p.startsWith('mec') ||
    p.startsWith('pow') ||
    p.startsWith('ven')
  ) {
    return true;
  }

  // Explicit exceptions: NEVER discard functional equipment even if CIG labels them placeholder or controller
  if (
    p.includes('thruster') ||
    c.includes('thruster') ||
    p.includes('fuel') ||
    c.includes('htnk') ||
    c.includes('qtnk') ||
    c.includes('intk') ||
    p.includes('countermeasure') ||
    c.includes('countermeasure') ||
    p.includes('cml') ||
    c.includes('cml') ||
    p.includes('decoy') ||
    p.includes('noise') ||
    p.includes('flare') ||
    p.includes('chaff') ||
    p.includes('dock') ||
    p.includes('snub') ||
    p.includes('parasite') ||
    p.includes('mining') ||
    p.includes('salvage') ||
    p.includes('tractor') ||
    p.includes('pod') ||
    p.includes('saddlebag') ||
    p.includes('emp') ||
    p.includes('interdiction') ||
    p.includes('pdc') ||
    p.includes('pds') ||
    p.includes('controller_flight')
  ) {
    return false;
  }

  // True interior & display noise
  if (n.includes('placeholder') && !p.includes('thruster') && !p.includes('intake') && !p.includes('tank')) return true;
  return false;
}

/**
 * Humanizes component labels when CIG uses placeholders or internal code names.
 */
export function humanizeComponentName(
  node: {
    component_name?: string | null;
    component_class_name?: string | null;
    component_type?: string | null;
    port_name?: string | null;
    port_type?: string | null;
  },
  lang: SupportedLanguage,
): string {
  const isFr = lang === 'fr';
  const cName = node.component_name;
  const cClass = (node.component_class_name || '').toUpperCase();
  const pName = (node.port_name || '').toLowerCase();
  const pType = (node.port_type || '').toLowerCase();

  // If already clean and meaningful
  if (cName && !cName.includes('PLACEHOLDER') && cName.trim() !== '') {
    return cName.replace(/\s+GS$/i, '').replace(/_GS\b/g, '');
  }

  // 1. Countermeasure Launchers (Decoy & Noise)
  if (
    cClass.includes('CML') ||
    cClass.includes('DECOY') ||
    cClass.includes('NOISE') ||
    cClass.includes('FLARE') ||
    cClass.includes('CHAFF') ||
    pName.includes('countermeasure') ||
    pName.includes('cml') ||
    pName.includes('decoy') ||
    pName.includes('noise') ||
    pType.includes('countermeasure')
  ) {
    if (
      cClass.includes('DECOY') ||
      cClass.includes('FLARE') ||
      pName.includes('decoy') ||
      pName.includes('flare') ||
      pName.includes('1') ||
      pName.includes('left')
    ) {
      return isFr ? 'Lanceur de leurres (Decoy Launcher)' : 'Decoy Countermeasure Launcher';
    }
    if (
      cClass.includes('NOISE') ||
      cClass.includes('CHAFF') ||
      pName.includes('noise') ||
      pName.includes('chaff') ||
      pName.includes('2') ||
      pName.includes('right')
    ) {
      return isFr ? 'Lanceur de brouillage (Noise Launcher)' : 'Noise Countermeasure Launcher';
    }
    return isFr ? 'Lanceur de contre-mesures (CM Launcher)' : 'Countermeasure Launcher';
  }

  // 2. Docked Snub Fighters & Parasite Vehicles
  if (cClass.includes('P72') || cClass.includes('ARCHIMEDES'))
    return isFr ? 'Kruger P-72 Archimedes (Parasite arrimé)' : 'Kruger P-72 Archimedes (Docked Snub)';
  if (cClass.includes('P52') || cClass.includes('MERLIN'))
    return isFr ? 'Kruger P-52 Merlin (Parasite arrimé)' : 'Kruger P-52 Merlin (Docked Snub)';
  if (cClass.includes('C8X') || cClass.includes('PISCES'))
    return isFr ? 'Anvil C8X Pisces (Navette arrimée)' : 'Anvil C8X Pisces (Docked Shuttle)';
  if (cClass.includes('SKYLARK')) return isFr ? 'Skylark (Module parasite)' : 'Skylark (Parasite Craft)';
  if (cClass.includes('URSA')) return isFr ? 'Ursa Rover (Véhicule d’exploration)' : 'Ursa Rover (Exploration Vehicle)';
  if (cClass.includes('LYNX')) return isFr ? 'Lynx Rover (Véhicule de luxe)' : 'Lynx Rover (Luxury Ground Vehicle)';

  // 3. Thrusters
  if (pType === 'thruster' || pName.includes('thruster') || cClass.includes('THRUSTER')) {
    if (cClass.includes('MAIN') || pName.includes('main')) return isFr ? 'Propulseur principal' : 'Main Thruster';
    if (cClass.includes('RETRO') || pName.includes('retro')) return isFr ? 'Rétrofusée de freinage' : 'Retro Thruster';
    return isFr ? 'Propulseur de manœuvre (MAV)' : 'Maneuvering Thruster (MAV)';
  }

  // 4. Fuel Tanks & Intakes
  if (cClass.startsWith('QTNK') || pName.includes('quantum_fuel'))
    return isFr ? 'Réservoir quantique interne (QT)' : 'Internal Quantum Fuel Tank (QT)';
  if (cClass.startsWith('HTNK') || pName.includes('fuel_tank'))
    return isFr ? 'Réservoir d’hydrogène interne (H2)' : 'Internal Hydrogen Fuel Tank (H2)';
  if (cClass.startsWith('INTK') || pName.includes('fuel_intake'))
    return isFr ? 'Collecteur d’admission d’hydrogène' : 'Hydrogen Fuel Intake';

  // 5. Mining & Extraction Pods — la capacité dépend du vaisseau (et n'est pas
  // extraite) : on ne l'affiche pas plutôt que d'afficher un chiffre faux.
  if (cClass.includes('COLLAPSED') || pName.includes('stored_pod'))
    return isFr ? 'Sac à minerai replié (rechange)' : 'Collapsed Spare Ore Bag';
  if (cClass.includes('MINING_POD') || pName.includes('mining_pod')) return isFr ? 'Sac à minerai amovible' : 'Removable Ore Bag';
  if (cClass.includes('MINING_ARM') || pName.includes('mining_arm')) return isFr ? 'Bras articulé de minage' : 'Mining Boom Arm';
  if (cClass.includes('SALVAGE_ARM') || pName.includes('salvage_arm'))
    return isFr ? 'Bras articulé de recyclage' : 'Salvage Articulated Arm';

  // 5b. Salvage internals: buffer storage, disintegration beam, head modifiers
  if (cClass.startsWith('SALVAGEINTERNALSTORAGE') || pName.includes('internal_storage'))
    return isFr ? 'Stockage tampon de recyclage' : 'Salvage Buffer Storage';
  if (cClass.startsWith('SALVAGEFILLERSTATION')) return isFr ? 'Station de remplissage RMC' : 'RMC Filler Station';
  if (cClass.startsWith('FUELPOD')) return isFr ? 'Réservoir de ravitaillement (Fuel Pod)' : 'Refuelling Fuel Pod';
  if (cClass.includes('DISINTEGRATION') || pName.includes('disintegration'))
    return isFr ? 'Faisceau de désintégration' : 'Disintegration Beam';
  const salvageModifier = cClass.match(/^SALVAGE_MODIFIER_([A-Z]+)(?:_[A-Z]+)*?_(SMALL|MEDIUM|LARGE)/);
  if (salvageModifier) {
    const kind = salvageModifier[1];
    const sizeLabel = { SMALL: 'S', MEDIUM: 'M', LARGE: 'L' }[salvageModifier[2]] ?? '';
    const kindFr: Record<string, string> = { SCRAPER: 'raclage', TRACTOR: 'tracteur' };
    const kindEn: Record<string, string> = { SCRAPER: 'Scraper', TRACTOR: 'Tractor' };
    return isFr
      ? `Module de recyclage — ${kindFr[kind] ?? kind.toLowerCase()} (${sizeLabel})`
      : `Salvage Module — ${kindEn[kind] ?? kind} (${sizeLabel})`;
  }

  // 6. Flight Computers & Blades
  if (cClass.includes('CONTROLLER_FLIGHT') || pName.includes('controller_flight'))
    return isFr ? 'Ordinateur de vol principal' : 'Main Flight Computer';
  if (cClass.includes('BLADE') || pName.includes('blade')) return isFr ? 'Lame d’avionique de vol (Blade)' : 'Avionics Flight Blade';

  // 7. Refuelling ports & docking collars (the fuel ports are DockingTube items too)
  if (cClass.includes('FUEL_PORT') || cClass.includes('REFUELING_PORT') || pName.includes('fuel_port') || pName.includes('fuelport'))
    return isFr ? 'Port de ravitaillement' : 'Refuelling Port';
  if (pName.includes('docking_collar') || cClass.includes('DOCKINGTUBE') || cClass.includes('DOCKING_COLLAR'))
    return isFr ? 'Collier d’amarrage' : 'Docking Collar';

  const sanitizedClass = cClass
    .replace(/_GS\b/g, '')
    .replace(/\s+GS$/i, '')
    .replace(/_/g, ' ');
  return sanitizedClass ? sanitizedClass : isFr ? 'Composant installé' : 'Installed Component';
}

/**
 * Transforms technical hardpoint identifiers into clean human-readable labels.
 */
export function humanizePortName(portName: string, portType: string, lang: SupportedLanguage, componentClassName?: string | null): string {
  if (!portName) return portType || '';

  const isFr = lang === 'fr';
  const lowerName = portName.toLowerCase();
  const lowerType = (portType || '').toLowerCase();
  const lowerClass = (componentClassName || '').toLowerCase();

  // Child slots should not expose cryptic class names
  if (/^hardpoint_class_\d+/i.test(portName)) {
    return isFr ? 'Arme montée' : 'Mounted Weapon';
  }
  if (/^missile_\d+_attach/i.test(portName)) {
    const num = portName.match(/\d+/)?.[0] ?? '1';
    return isFr ? `Emplacement missile #${parseInt(num, 10)}` : `Missile Slot #${parseInt(num, 10)}`;
  }

  // Tactical, industrial & salvage tools — tested before the generic weapon / quantum
  // labels, which would otherwise swallow them ("hardpoint_weapon_emp", "…quantum_interdiction…").
  if (lowerType.includes('interdiction') || lowerName.includes('interdiction')) {
    return isFr ? 'Générateur d’interdiction quantique (QED)' : 'Quantum Interdiction Generator (QED)';
  }
  if (lowerType === 'emp' || /(?:^|_)emp(?:_|$)/.test(lowerName)) {
    return isFr ? 'Générateur EMP' : 'EMP Generator';
  }
  if (lowerType.includes('tractorbeam')) {
    return isFr ? 'Rayon tracteur' : 'Tractor Beam';
  }
  if (lowerType.includes('salvagehead') || lowerName.includes('weapon_salvage')) {
    return isFr ? 'Tête de recyclage' : 'Salvage Head';
  }
  if (lowerName.includes('salvage_subitem')) {
    const num = lowerName.match(/(\d+)$/)?.[1];
    const suffix = num ? ` #${parseInt(num, 10)}` : '';
    return isFr ? `Emplacement de module de recyclage${suffix}` : `Salvage Module Slot${suffix}`;
  }
  if (lowerType.includes('miningmodifier')) {
    return isFr ? 'Sous-module de minage' : 'Mining Sub-Module';
  }
  if (lowerType.includes('mininglaser') || lowerName.includes('weapon_mining')) {
    return isFr ? 'Tête laser de minage' : 'Mining Laser Head';
  }
  if (lowerName.includes('internal_storage')) {
    return isFr ? 'Stockage tampon' : 'Buffer Storage';
  }
  if (lowerName.includes('disintegration')) {
    return isFr ? 'Zone de désintégration' : 'Disintegration Intake';
  }
  if (lowerName.includes('refill_station') || lowerName.includes('filler_station')) {
    return isFr ? 'Station de remplissage' : 'Filler Station';
  }
  if (lowerName.includes('tractorbeamarm')) {
    return isFr ? 'Bras de remorquage' : 'Towing Arm';
  }
  if (lowerClass.includes('towingbeam')) {
    return isFr ? 'Faisceau de remorquage' : 'Towing Beam';
  }
  if (lowerName.includes('fuel_pod')) {
    return isFr ? 'Fuel Pod de ravitaillement' : 'Refuelling Pod';
  }
  if (lowerName.includes('avionics') || lowerClass.startsWith('comp_')) {
    return isFr ? 'Module d’avionique' : 'Avionics Module';
  }
  if (lowerName.includes('claw')) {
    return isFr ? 'Bras de recyclage' : 'Salvage Claw';
  }
  if (lowerClass.includes('shipmining_pod') && !lowerName.includes('pod')) {
    const side = lowerName.includes('front') ? (isFr ? 'avant' : 'Front') : lowerName.includes('rear') ? (isFr ? 'arrière' : 'Rear') : '';
    return isFr ? `Sac à minerai amovible${side ? ` (${side})` : ''}` : `Removable Ore Bag${side ? ` (${side})` : ''}`;
  }

  // Specialized systems detection
  if (lowerName.includes('pdc') || lowerName.includes('pds')) {
    return isFr ? 'Point de défense automatisé (PDS)' : 'Point Defense System (PDS)';
  }
  if (lowerName.includes('docking_collar_merlin') || lowerName.includes('dock_merlin')) {
    return isFr ? 'Baie d’amarrage parasite (Merlin)' : 'Snub Docking Bay (Merlin)';
  }
  if (lowerName.includes('itemport_vehicle_attach')) {
    return isFr ? 'Vaisseau / Parasite arrimé' : 'Docked Parasite Vehicle';
  }
  if (lowerName.includes('mining_arm')) {
    return isFr ? 'Bras articulé de minage' : 'Mining Boom Arm';
  }
  if (lowerName.includes('salvage_arm')) {
    const side = lowerName.includes('left') ? (isFr ? 'gauche' : 'Left') : isFr ? 'droit' : 'Right';
    return isFr ? `Bras de recyclage (${side})` : `Salvage Arm (${side})`;
  }
  if (lowerName.includes('stored_pod')) {
    const num = lowerName.match(/\d+/)?.[0] ?? '1';
    return isFr ? `Sac à minerai replié #${num}` : `Stowed Ore Bag #${num}`;
  }
  if (lowerName.includes('mining_pod')) {
    const num = lowerName.match(/\d+/)?.[0] ?? '1';
    return isFr ? `Sac à minerai #${num}` : `Ore Bag #${num}`;
  }
  if (lowerName.includes('quantum_fuel') || lowerClass.startsWith('qtnk')) {
    return isFr ? 'Réservoir quantique (QT)' : 'Quantum Fuel Tank (QT)';
  }
  if (lowerName.includes('fuel_port') || lowerName.includes('fuelport')) {
    return isFr ? 'Port de ravitaillement' : 'Refuelling Port';
  }
  if (lowerName.includes('docking_collar') || lowerName.includes('dockingcollar')) {
    return isFr ? 'Collier d’amarrage' : 'Docking Collar';
  }
  if (lowerName.includes('fuel_tank') || lowerName.includes('fueltank')) {
    const side = lowerName.includes('left') ? (isFr ? 'gauche' : 'Left') : lowerName.includes('right') ? (isFr ? 'droit' : 'Right') : '';
    return isFr ? `Réservoir d’hydrogène (H2)${side ? ` (${side})` : ''}` : `Hydrogen Fuel Tank (H2)${side ? ` (${side})` : ''}`;
  }
  if (lowerName.includes('fuel_intake')) {
    const side = lowerName.includes('left') ? (isFr ? 'gauche' : 'Left') : lowerName.includes('right') ? (isFr ? 'droit' : 'Right') : '';
    return isFr ? `Collecteur d’admission d’hydrogène${side ? ` (${side})` : ''}` : `Hydrogen Fuel Intake${side ? ` (${side})` : ''}`;
  }
  if (lowerName.includes('controller_flight')) {
    return isFr ? 'Ordinateur de vol' : 'Flight Computer';
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

  // Base label mapping
  let baseLabel = '';
  if (lowerType.includes('jump') || lowerName.includes('jump')) {
    baseLabel = isFr ? 'Module de saut' : 'Jump Module';
  } else if (lowerType === 'quantumdrive' || lowerName.includes('quantum')) {
    baseLabel = isFr ? 'Moteur quantique' : 'Quantum Drive';
  } else if (lowerType === 'weapongun' || lowerName.includes('weapon') || lowerName.includes('gun')) {
    baseLabel = isFr ? 'Point d’arme' : 'Weapon Hardpoint';
  } else if (lowerType.includes('turret') || lowerName.includes('turret')) {
    // TurretUnmanned / TurretBase : tourelle téléopérée (le mot « remote » n'est pas toujours dans le port)
    baseLabel = isFr ? 'Tourelle' : 'Turret';
    if (lowerType === 'turretunmanned' && !lowerName.includes('remote')) {
      baseLabel = isFr ? 'Tourelle téléopérée' : 'Remote Turret';
    }
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
  } else if (lowerType === 'lifesupport' || lowerName.includes('life_support')) {
    baseLabel = isFr ? 'Système de survie' : 'Life Support';
  } else if (lowerType === 'thruster' || lowerName.includes('thruster')) {
    if (lowerName.includes('main')) baseLabel = isFr ? 'Propulseur principal' : 'Main Thruster';
    else if (lowerName.includes('retro')) baseLabel = isFr ? 'Propulseur de freinage' : 'Retro Thruster';
    else baseLabel = isFr ? 'Propulseur de manœuvre' : 'Maneuver Thruster';
  } else if (
    lowerType === 'countermeasure' ||
    lowerName.includes('countermeasure') ||
    lowerName.includes('cml') ||
    lowerName.includes('decoy') ||
    lowerName.includes('noise') ||
    lowerName.includes('flare') ||
    lowerName.includes('chaff')
  ) {
    // The installed launcher tells the truth; the port side is only a fallback (Apollo: noise on the left)
    const classSaysNoise = /noise|chaff/.test(lowerClass);
    const classSaysDecoy = /decoy|flare/.test(lowerClass);
    if (
      classSaysDecoy ||
      (!classSaysNoise &&
        (lowerName.includes('decoy') || lowerName.includes('flare') || lowerName.includes('1') || lowerName.includes('left')))
    ) {
      baseLabel = isFr ? 'Lanceur de leurres (Decoy)' : 'Decoy Launcher';
    } else if (
      classSaysNoise ||
      lowerName.includes('noise') ||
      lowerName.includes('chaff') ||
      lowerName.includes('2') ||
      lowerName.includes('right')
    ) {
      baseLabel = isFr ? 'Lanceur de brouillage (Noise)' : 'Noise Launcher';
    } else {
      baseLabel = isFr ? 'Point de contre-mesures' : 'Countermeasure Hardpoint';
    }
  } else if (!lowerType || lowerType === 'other') {
    baseLabel = isFr ? 'Emplacement' : 'Mount';
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

type GroupableSlot = {
  port_name?: string | null;
  port_type?: string | null;
  component_type?: string | null;
  component_sub_type?: string | null;
  component_class_name?: string | null;
  component_name?: string | null;
};

/** EMP au sens strict : « temp », « hemp »… ne doivent pas déclencher la catégorie tactique. */
const EMP_TOKEN_RX = /(?:^|[^a-z])emp(?:[^a-z]|$)/;

/**
 * Fine-grained slot categorization into the exact categories specified by the user.
 */
export function determineDetailedGroup(slot: GroupableSlot): LoadoutGroupKey {
  return matchDetailedGroup(slot) ?? 'specialized';
}

/**
 * Same as {@link determineDetailedGroup}, but returns `null` when nothing identifies the slot
 * (instead of the `specialized` fallback) — used to spot transparent containers.
 */
function matchDetailedGroup(slot: GroupableSlot): LoadoutGroupKey | null {
  const pName = (slot.port_name || '').toLowerCase();
  const pType = (slot.port_type || '').toLowerCase();
  const cType = (slot.component_type || '').toLowerCase();
  const cClass = (slot.component_class_name || '').toLowerCase();
  const cName = (slot.component_name || '').toLowerCase();

  // 1. Point Defense Systems (PDS / PDC)
  if (
    pName.includes('pdc') ||
    pName.includes('pds') ||
    pName.includes('point_defense') ||
    pName.includes('pointdefense') ||
    cClass.includes('pdc') ||
    cClass.includes('pds') ||
    cName.includes('point defense') ||
    cName.includes('swarm')
  ) {
    return 'pds';
  }

  // 2. Docked Vehicles (Merlin, Archimedes, Pisces, Skylark, parasite craft)
  if (
    pName.includes('merlin') ||
    pName.includes('archimedes') ||
    pName.includes('docking_collar') ||
    pName.includes('dockingcollar') ||
    pName.includes('dock_merlin') ||
    pName.includes('itemport_vehicle') ||
    pName.includes('vehicle_attach') ||
    pName.includes('snub') ||
    pName.includes('parasite') ||
    cClass.includes('merlin') ||
    cClass.includes('archimedes') ||
    cClass.includes('pisces') ||
    cClass.includes('skylark') ||
    cClass.includes('ursa') ||
    cClass.includes('lynx')
  ) {
    return 'docked_vehicles';
  }

  // 2b. Fuel before quantum / specialized: QT tanks sit on QuantumDrive ports, and the
  // Starfarer refuelling pods would otherwise land with the generic « pod » tools below
  if (
    pName.includes('fuel_pod') ||
    cClass.startsWith('fuelpod') ||
    cClass.startsWith('qtnk') ||
    cClass.startsWith('htnk') ||
    pName.includes('fuel_port') ||
    pName.includes('fuelport')
  ) {
    return 'fuel';
  }

  // 3. Specialized / Industrial / Tactical (Tractor Beam, Mining, Salvage, EMP, Interdiction, Pods)
  if (
    pType.includes('tractor') ||
    cType.includes('tractor') ||
    pName.includes('tractor') ||
    cClass.includes('tractor') ||
    pType.includes('mining') ||
    cType.includes('mining') ||
    pName.includes('mining') ||
    cClass.includes('mining') ||
    pType.includes('salvage') ||
    cType.includes('salvage') ||
    pName.includes('salvage') ||
    cClass.includes('salvage') ||
    pType === 'emp' ||
    cType === 'emp' ||
    EMP_TOKEN_RX.test(pName) ||
    EMP_TOKEN_RX.test(cClass) ||
    pType.includes('interdiction') ||
    cType.includes('quantuminterdiction') ||
    cType.includes('interdiction') ||
    pName.includes('interdiction') ||
    pName.includes('snare') ||
    pName.includes('jammer') ||
    cClass.includes('qed') ||
    pName.includes('pod') ||
    pName.includes('saddlebag') ||
    cClass.includes('pod') ||
    cClass.includes('bag')
  ) {
    return 'specialized';
  }

  // 4. Turrets (Manned & Remote, excluding PDS/Specialized)
  if (pType === 'turret' || cType === 'turret' || pName.includes('turret') || cClass.includes('turret')) {
    return 'turrets';
  }

  // 5. Ordnance (Missiles, Torpedoes, Bombs, Rocket Pods)
  if (
    pType === 'missilerack' ||
    cType === 'missilerack' ||
    cType === 'missile' ||
    cType === 'torpedo' ||
    cType === 'bomb' ||
    cType === 'rocket' ||
    pName.includes('missile') ||
    pName.includes('torpedo') ||
    pName.includes('bomb') ||
    pName.includes('rocket') ||
    pName.includes('pylon')
  ) {
    return 'ordnance';
  }

  // 6. Countermeasures (Decoy & Noise Launchers)
  if (
    pType === 'countermeasure' ||
    cType === 'countermeasure' ||
    pName.includes('countermeasure') ||
    pName.includes('cml') ||
    cClass.includes('cml') ||
    pName.includes('decoy') ||
    pName.includes('noise') ||
    pName.includes('flare') ||
    pName.includes('chaff') ||
    cClass.includes('decoy') ||
    cClass.includes('noise') ||
    cClass.includes('flare') ||
    cClass.includes('chaff') ||
    cName.includes('decoy') ||
    cName.includes('noise') ||
    cName.includes('countermeasure')
  ) {
    return 'countermeasures';
  }

  // 6. Fixed Weapons (pilot guns, weapon hardpoints, gimbals housing guns)
  if (
    pType === 'weapongun' ||
    cType === 'weapongun' ||
    pType === 'gimbal' ||
    cType === 'gimbal' ||
    pName.includes('weapon') ||
    pName.includes('gun')
  ) {
    return 'fixed_weapons';
  }

  // 7. Quantum & Jump (Quantum Drive & Jump Module)
  if (
    pType === 'quantumdrive' ||
    cType === 'quantumdrive' ||
    pType === 'jumpmodule' ||
    cType === 'jumpmodule' ||
    pType === 'jumpdrive' ||
    cType === 'jumpdrive' ||
    pName.includes('quantum_drive') ||
    pName.includes('quantum') ||
    pName.includes('jump') ||
    cClass.startsWith('jdrv')
  ) {
    return 'quantum';
  }

  // 8. Shields
  if (pType === 'shield' || cType === 'shield' || pName.includes('shield')) {
    return 'shields';
  }

  // 9. Power Plants
  if (pType === 'powerplant' || cType === 'powerplant' || pName.includes('power_plant') || pName.includes('powerplant')) {
    return 'power_plants';
  }

  // 10. Coolers
  if (pType === 'cooler' || cType === 'cooler' || pName.includes('cooler')) {
    return 'coolers';
  }

  // 11. Radar & Scanners
  if (
    pType === 'radar' ||
    cType === 'radar' ||
    pType === 'scanner' ||
    cType === 'scanner' ||
    pName.includes('radar') ||
    pName.includes('scanner')
  ) {
    return 'radar';
  }

  // 12. Life Support
  if (pType === 'lifesupport' || cType === 'lifesupport' || pName.includes('life_support') || pName.includes('lifesupport')) {
    return 'life_support';
  }

  // 13. Thrusters (Main, Retro, Maneuver)
  if (pType === 'thruster' || cType === 'thruster' || pName.includes('thruster') || cClass.includes('thruster')) {
    return 'thrusters';
  }

  // 14. Fuel Tanks & Intakes
  if (
    pType === 'fueltank' ||
    cType === 'fueltank' ||
    pType === 'fuelintake' ||
    cType === 'fuelintake' ||
    pName.includes('fuel') ||
    cClass.includes('htnk') ||
    cClass.includes('qtnk') ||
    cClass.includes('intk')
  ) {
    return 'fuel';
  }

  // 15. Avionics, Computers & Flight Blades
  if (
    pType === 'flightcontroller' ||
    cType === 'flightcontroller' ||
    pType === 'computer' ||
    cType === 'computer' ||
    pName.includes('controller_flight') ||
    pName.includes('computer') ||
    pName.includes('blade') ||
    pName.includes('avionics') ||
    cClass.includes('blade') ||
    cClass.startsWith('comp_') ||
    cClass.includes('controller_flight')
  ) {
    return 'avionics_blades';
  }

  return null;
}

/**
 * Spécialité d'un équipement du groupe `specialized` : minage, recyclage, tracteur,
 * tactique (EMP / interdiction quantique), amarrage, ou autre.
 */
export function determineSpecialtyTag(slot: GroupableSlot): SpecialtyTag {
  const haystack = [slot.port_name, slot.port_type, slot.component_type, slot.component_sub_type, slot.component_class_name]
    .map((v) => (v || '').toLowerCase())
    .join(' ');

  if (/salvage|disintegration|scraper/.test(haystack)) return 'salvage';
  if (/mining|shipmining|saddlebag|ore_?bag/.test(haystack)) return 'mining';
  if (/tractor/.test(haystack)) return 'tractor';
  if (EMP_TOKEN_RX.test(haystack) || /interdiction|qed|snare|jammer|qdmp/.test(haystack)) return 'tactical';
  if (/dock|collar|vehicle_attach/.test(haystack)) return 'docking';
  return 'utility';
}

const SPECIALTY_ORDER: SpecialtyTag[] = ['mining', 'salvage', 'tractor', 'tactical', 'docking', 'utility'];

function specialtyTitle(tag: SpecialtyTag, isFr: boolean): string {
  switch (tag) {
    case 'mining':
      return isFr ? 'Minage — têtes laser, bras & sacs à minerai' : 'Mining — Laser Heads, Arms & Ore Bags';
    case 'salvage':
      return isFr ? 'Recyclage — têtes, désintégration & stockage tampon' : 'Salvage — Heads, Disintegration & Buffer';
    case 'tractor':
      return isFr ? 'Rayons tracteurs & manutention de fret' : 'Tractor Beams & Cargo Handling';
    case 'tactical':
      return isFr ? 'Tactique — EMP & interdiction quantique' : 'Tactical — EMP & Quantum Interdiction';
    case 'docking':
      return isFr ? 'Amarrage' : 'Docking';
    default:
      return isFr ? 'Autres systèmes' : 'Other Systems';
  }
}

/** Ports racine de modules interchangeables (Retaliator, Apollo, Aurora Mk2, Cyclone…). */
const MODULE_HOST_PORT_RX =
  /^hardpoint_(?:(?:front|rear)_)?module$|^hardpoint_modular_room_|^hardpoint_module_bay$|^hardpoint_module_attach$/i;

/** Libellé lisible d'un port de module : « Module avant », « Baie gauche »… */
export function humanizeModuleSlot(slotName: string, lang: SupportedLanguage, slotType?: string | null): string {
  const isFr = lang === 'fr';
  const s = `${slotType || ''} ${slotName}`.toLowerCase();
  if (/front/.test(s)) return isFr ? 'Module avant' : 'Front Module';
  if (/rear/.test(s)) return isFr ? 'Module arrière' : 'Rear Module';
  if (/left/.test(s)) return isFr ? 'Baie modulaire gauche' : 'Left Modular Bay';
  if (/right/.test(s)) return isFr ? 'Baie modulaire droite' : 'Right Modular Bay';
  if (/cargo/.test(s)) return isFr ? 'Module de fret' : 'Cargo Module';
  if (/bay/.test(s)) return isFr ? 'Baie modulaire' : 'Modular Bay';
  return isFr ? 'Module' : 'Module';
}

/**
 * Libellé d'un module à partir de sa classe DataForge :
 * `AEGS_Retaliator_Module_Front_Bomber` → « Torpilles (Bomber) »,
 * `RSI_Apollo_Module_Left_Tier_2` → « Baie médicale T2 ».
 */
export function humanizeModuleName(moduleClassName: string, lang: SupportedLanguage, moduleTier?: number | null): string {
  const isFr = lang === 'fr';
  const variant = (moduleClassName.split(/_Module_?/i)[1] || moduleClassName)
    .replace(/^(?:Front|Rear|Left|Right)_/i, '')
    .replace(/_/g, ' ')
    .trim();
  const v = variant.toLowerCase();
  const tier = moduleTier ?? Number(v.match(/tier\s*(\d+)/)?.[1] ?? Number.NaN);

  if (/apollo/i.test(moduleClassName) && Number.isFinite(tier)) return isFr ? `Baie médicale T${tier}` : `Medical Bay T${tier}`;
  if (Number.isFinite(tier)) return `Tier ${tier}`;
  if (v === 'base') return isFr ? 'Standard (vide)' : 'Standard (empty)';
  if (v === 'bomber' || v.includes('torpedo')) return isFr ? 'Torpilles (Bomber)' : 'Torpedo (Bomber)';
  if (v.includes('missile')) return isFr ? 'Lance-missiles' : 'Missile Launcher';
  if (v.includes('cargo')) return isFr ? 'Fret' : 'Cargo';
  if (v.includes('habitation') || v.includes('living') || v.includes('crew')) return isFr ? 'Quartiers d’équipage' : 'Crew Quarters';
  if (v.includes('medical') || v.includes('med')) return isFr ? 'Baie médicale' : 'Medical Bay';
  if (v.includes('antiair')) return isFr ? 'Défense antiaérienne' : 'Anti-Air';
  if (v.includes('turret')) return isFr ? 'Tourelle' : 'Turret';
  if (v.includes('racing')) return isFr ? 'Course' : 'Racing';
  if (v.includes('recon')) return isFr ? 'Reconnaissance' : 'Recon';
  return variant || moduleClassName;
}

/**
 * Backward compatibility helper for legacy 5-key groups while supporting fine-grained groups.
 */
export function determineGroup(slot: {
  port_name?: string | null;
  port_type?: string | null;
  component_type?: string | null;
  component_class_name?: string | null;
}): LoadoutGroupKey {
  const detailed = determineDetailedGroup(slot);
  if (detailed === 'fixed_weapons' || detailed === 'turrets' || detailed === 'pds') return 'weapons';
  if (detailed === 'ordnance') return 'missiles';
  if (detailed === 'quantum') {
    const p = (slot.port_name || '').toLowerCase();
    const c = (slot.component_type || '').toLowerCase();
    if (p.includes('jump') || c.includes('jump')) return 'jump';
    return 'propulsion';
  }
  if (detailed === 'shields' || detailed === 'power_plants' || detailed === 'coolers' || detailed === 'life_support') return 'systems';
  if (detailed === 'thrusters' || detailed === 'fuel') return 'propulsion';
  return detailed;
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
 * Builds the complete hierarchical tree of loadout nodes, strictly following the physical
 * mounting hierarchy requested:
 * - Fixed Weapon: Hardpoint -> Gimbal -> Arme
 * - Turrets: Hardpoint -> Tourelle -> Gimbals -> Armes
 * - PDS: Hardpoint -> Tourelle PDS -> Armes
 * - Ordnance: Hardpoint -> Racks -> Ordnance
 * - Quantum & Jump: Hardpoint -> Quantum drive -> Jump Module
 * - Shields, Power Plants, Coolers, Radar, Life Support, Thrusters, Docked Vehicles, Specialized
 */
export const DOCKED_CRAFT_UUID_MAP: Record<string, string> = {
  // Kruger P-52 Merlin
  krig_p52_merlin: '939c4f7b-e4e5-a5a8-a4d5-56b57d5f48ab',
  p52_merlin: '939c4f7b-e4e5-a5a8-a4d5-56b57d5f48ab',
  merlin: '939c4f7b-e4e5-a5a8-a4d5-56b57d5f48ab',

  // Kruger P-72 Archimedes
  krig_p72_archimedes: '23474e96-0bce-7058-3d48-4f39e6de6092',
  p72_archimedes: '23474e96-0bce-7058-3d48-4f39e6de6092',
  archimedes: '23474e96-0bce-7058-3d48-4f39e6de6092',
  krig_p72_archimedes_emerald: '8e4a4bed-8a7f-ebee-f0c9-242782765d9e',

  // Anvil C8 Pisces
  anvl_c8_pisces: '147a4530-f617-20d5-d15f-87d1afa753a7',
  c8_pisces: '147a4530-f617-20d5-d15f-87d1afa753a7',
  pisces: '147a4530-f617-20d5-d15f-87d1afa753a7',
  anvl_c8x_pisces_expedition: '337a4350-dcfc-831f-eefe-9ed193e67d96',
  c8x_pisces_expedition: '337a4350-dcfc-831f-eefe-9ed193e67d96',
  anvl_c8r_pisces: 'e2844c0f-9058-1bed-9df9-b47aa56b61b5',
  c8r_pisces: 'e2844c0f-9058-1bed-9df9-b47aa56b61b5',

  // RSI Skylark
  rsi_skylark: '87ef4d01-c8c6-6a77-74cc-3f1b4e020194',
  skylark: '87ef4d01-c8c6-6a77-74cc-3f1b4e020194',

  // RSI Ursa & Lynx
  rsi_ursa_rover: '0e4442e8-5d7e-8c37-6c25-e1b2d6c84bb8',
  ursa_rover: '0e4442e8-5d7e-8c37-6c25-e1b2d6c84bb8',
  rsi_ursa_medivac: '7bf944e9-15be-ebf0-30c5-005fc6b59cad',
  rsi_ursa_rover_emerald: '43a54f88-8277-953f-82c4-e57e99ee39b1',
  rsi_lynx: '329c4336-4eef-4c03-156a-f0b1bf490e85',
  lynx: '329c4336-4eef-4c03-156a-f0b1bf490e85',
};

export function isDockedVehicleSlot(slot: {
  port_name?: string | null;
  component_class_name?: string | null;
  component_name?: string | null;
}): boolean {
  const p = (slot.port_name || '').toLowerCase();
  const c = (slot.component_class_name || '').toLowerCase();
  const n = (slot.component_name || '').toLowerCase();

  if (p.includes('vehicle_attach')) return true;
  if (c.includes('krig_p52') || c.includes('krig_p72') || c.includes('anvl_c8') || c.includes('skylark')) return true;
  if (c.includes('rsi_ursa') || c.includes('rsi_lynx')) return true;
  if (n.includes('merlin') || n.includes('archimedes') || n.includes('pisces') || n.includes('skylark')) {
    if (p.includes('dock') || p.includes('snub') || p.includes('vehicle') || p.includes('bay')) return true;
  }
  return false;
}

export function resolveDockedShipUuid(slot: {
  port_name?: string | null;
  component_class_name?: string | null;
  component_name?: string | null;
}): string | null {
  const c = (slot.component_class_name || '').toLowerCase();
  const n = (slot.component_name || '').toLowerCase();
  const p = (slot.port_name || '').toLowerCase();

  for (const [key, uuid] of Object.entries(DOCKED_CRAFT_UUID_MAP)) {
    if (c === key || c.includes(key) || n.includes(key) || p.includes(key)) {
      return uuid;
    }
  }
  return null;
}

export function buildLoadoutTree(
  slots: RawLoadoutSlot[],
  lang: SupportedLanguage,
  options: LoadoutTreeOptions = {},
): GroupedLoadoutSection[] {
  const isFr = lang === 'fr';

  const flat = flattenSlots(slots);

  // 1. Trace parasite/docked vehicle slots and find all their descendants
  const childrenMap = new Map<number, number[]>();
  const dockedVehicleIds = new Set<number>();
  const fixtureIds = new Set<number>();

  for (const s of flat) {
    const id = s.id != null ? Number(s.id) : null;
    const parentId = s.parent_id != null ? Number(s.parent_id) : null;
    if (id != null && parentId != null) {
      const list = childrenMap.get(parentId) || [];
      list.push(id);
      childrenMap.set(parentId, list);
    }
    if (id != null && isDockedVehicleSlot(s)) {
      dockedVehicleIds.add(id);
    }
    if (id != null && isInteriorFixturePort(s.port_name, s.component_class_name)) {
      fixtureIds.add(id);
    }
  }

  // Find all descendants of docked vehicle slots (and interior fixtures) to completely exclude them
  const parasiteDescendantIds = new Set<number>();
  function markDescendants(parentId: number) {
    const children = childrenMap.get(parentId) || [];
    for (const childId of children) {
      parasiteDescendantIds.add(childId);
      markDescendants(childId);
    }
  }
  for (const dockedId of dockedVehicleIds) {
    markDescendants(dockedId);
  }
  for (const fixtureId of fixtureIds) {
    markDescendants(fixtureId);
  }

  const nodeMap = new Map<number, LoadoutNode>();
  const allNodes: LoadoutNode[] = [];

  for (let idx = 0; idx < flat.length; idx++) {
    const s = flat[idx];
    const id = s.id != null ? Number(s.id) : idx + 1000;

    // Prune parasite internal descendants and noisy ports
    if (parasiteDescendantIds.has(id)) {
      continue;
    }
    if (isNoisyPort(s.port_name, s.component_class_name, s.component_name)) {
      continue;
    }
    // Empty generic mounts (no component, no children): placeholders with nothing to show
    const rawPortType = (s.port_type || '').toLowerCase();
    const isEmpty = !s.component_class_name && !s.component_name && !s.component_type;
    if (isEmpty && (!rawPortType || rawPortType === 'other') && !childrenMap.get(id)?.length) {
      continue;
    }

    const parentId = s.parent_id != null ? Number(s.parent_id) : null;
    const isDocked = dockedVehicleIds.has(id);
    const humanPort = humanizePortName(s.port_name || '', s.component_type || s.port_type || '', lang, s.component_class_name);
    const resolvedCompName = humanizeComponentName(s, lang);
    const dockedUuid = isDocked ? resolveDockedShipUuid(s) : null;

    const node: LoadoutNode = {
      id,
      parentId,
      port_name: s.port_name || '',
      port_type: s.port_type || '',
      humanPortName: humanPort,
      component_uuid: s.component_uuid,
      component_class_name: s.component_class_name,
      component_name: resolvedCompName,
      component_type: s.component_type,
      component_sub_type: s.component_sub_type,
      component_size: s.component_size ?? s.port_max_size ?? s.port_min_size,
      component_grade: s.component_grade ?? s.grade,
      component_class: s.component_class,
      component_manufacturer: s.component_manufacturer ?? s.manufacturer_code,
      docked_ship_uuid: dockedUuid,
      weapon_dps: s.weapon_dps ? Number(s.weapon_dps) : null,
      weapon_damage: s.weapon_damage ? Number(s.weapon_damage) : null,
      weapon_fire_rate: s.weapon_fire_rate ? Number(s.weapon_fire_rate) : null,
      weapon_range: s.weapon_range ? Number(s.weapon_range) : null,
      weapon_speed: s.weapon_speed ? Number(s.weapon_speed) : null,
      weapon_burst_dps: s.weapon_burst_dps ? Number(s.weapon_burst_dps) : null,
      weapon_sustained_dps: s.weapon_sustained_dps ? Number(s.weapon_sustained_dps) : null,
      weapon_alpha_damage: s.weapon_alpha_damage ? Number(s.weapon_alpha_damage) : null,
      weapon_damage_type: s.weapon_damage_type,
      weapon_ammo_count: s.weapon_ammo_count,
      shield_hp: s.shield_hp ? Number(s.shield_hp) : null,
      shield_regen: s.shield_regen ? Number(s.shield_regen) : null,
      shield_hardening: s.shield_hardening ? Number(s.shield_hardening) : null,
      shield_faces: s.shield_faces ? Number(s.shield_faces) : null,
      quantum_speed: s.quantum_speed ? Number(s.quantum_speed) : s.qd_speed ? Number(s.qd_speed) : null,
      quantum_range: s.quantum_range ? Number(s.quantum_range) : s.qd_range ? Number(s.qd_range) : null,
      quantum_spool_time: s.quantum_spool_time ? Number(s.quantum_spool_time) : s.qd_spool_time ? Number(s.qd_spool_time) : null,
      qd_fuel_rate: s.qd_fuel_rate ? Number(s.qd_fuel_rate) : null,
      qd_cooldown: s.qd_cooldown ? Number(s.qd_cooldown) : null,
      cooler_cooling_rate: s.cooler_cooling_rate ? Number(s.cooler_cooling_rate) : s.cooling_rate ? Number(s.cooling_rate) : null,
      power_output: s.power_output ? Number(s.power_output) : null,
      em_signature: s.em_signature ? Number(s.em_signature) : null,
      ir_signature: s.ir_signature ? Number(s.ir_signature) : null,
      thruster_max_thrust: s.thruster_max_thrust ? Number(s.thruster_max_thrust) : null,
      thruster_type: s.thruster_type,
      cm_ammo_count: s.cm_ammo_count ? Number(s.cm_ammo_count) : null,
      children: [],
    };
    nodeMap.set(id, node);
    allNodes.push(node);
  }

  // Link children to parents
  const linkedRoots: LoadoutNode[] = [];
  for (const node of allNodes) {
    if (dockedVehicleIds.has(node.id)) {
      node.children = [];
    }

    if (node.parentId != null && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId)!;
      if (!dockedVehicleIds.has(parent.id)) {
        parent.children.push(node);
      }
    } else {
      linkedRoots.push(node);
    }
  }

  // Modules & transparent containers: their functional ports join their natural category
  // (Hardpoint ➔ Module ➔ Lance-torpilles devient une entrée « Munitions » marquée du module),
  // while the module itself gets a card in the « Modules » tab.
  const knownModuleSlots = new Map((options.moduleSlots ?? []).map((m) => [m.slotName, m.label ?? null]));
  const moduleHosts: LoadoutNode[] = [];
  const rootNodes: LoadoutNode[] = [];
  const queue = [...linkedRoots];
  while (queue.length) {
    const root = queue.shift()!;
    const isModuleHost = root.moduleSlot == null && (knownModuleSlots.has(root.port_name) || MODULE_HOST_PORT_RX.test(root.port_name));

    if (isModuleHost) {
      const label =
        knownModuleSlots.get(root.port_name) ?? (root.component_class_name ? humanizeModuleName(root.component_class_name, lang) : null);
      root.humanPortName = humanizeModuleSlot(root.port_name, lang);
      root.sourceModule = label;
      root.moduleSlot = root.port_name;
      if (label) root.component_name = label;
      for (const child of root.children) {
        child.parentId = null;
        child.moduleSlot = root.port_name;
        child.sourceModule = label;
        queue.push(child);
      }
      root.children = [];
      moduleHosts.push(root);
      continue;
    }

    const isTransparentContainer =
      root.children.length > 0 &&
      !dockedVehicleIds.has(root.id) &&
      (!root.port_type || root.port_type.toLowerCase() === 'other') &&
      matchDetailedGroup(root) == null;
    if (isTransparentContainer) {
      for (const child of root.children) {
        child.parentId = null;
        child.moduleSlot ??= root.moduleSlot;
        child.sourceModule ??= root.sourceModule;
        queue.push(child);
      }
      continue;
    }

    rootNodes.push(root);
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

  // Define section metadata in the user's preferred reading order
  const sectionDefs: Array<{
    key: LoadoutGroupKey;
    title: string;
    iconName: GroupedLoadoutSection['iconName'];
  }> = [
    { key: 'fixed_weapons', title: isFr ? 'Armes Pilote (Fixes / Articulées)' : 'Fixed & Gimbal Weapons', iconName: 'crosshair' },
    { key: 'turrets', title: isFr ? 'Tourelles (Habitées & Téléopérées)' : 'Turrets (Manned & Remote)', iconName: 'target' },
    { key: 'pds', title: isFr ? 'Défense Rapprochée (PDS / PDC)' : 'Point Defense Systems (PDS)', iconName: 'shield-alert' },
    {
      key: 'ordnance',
      title: isFr ? 'Munitions & Râteliers (Missiles, Torpilles, Bombes)' : 'Ordnance (Missiles, Torpedoes, Bombs)',
      iconName: 'rocket',
    },
    {
      key: 'countermeasures',
      title: isFr ? 'Contre-mesures (Leurres & Brouillage)' : 'Countermeasures (Decoy & Noise)',
      iconName: 'sparkles',
    },
    { key: 'quantum', title: isFr ? 'Voyage Quantique & Module de Saut' : 'Quantum Drive & Jump Module', iconName: 'compass' },
    { key: 'shields', title: isFr ? 'Générateurs de Boucliers' : 'Shield Generators', iconName: 'shield' },
    { key: 'power_plants', title: isFr ? 'Générateurs d’Énergie' : 'Power Plants', iconName: 'zap' },
    { key: 'coolers', title: isFr ? 'Refroidisseurs Thermiques' : 'Coolers', iconName: 'snowflake' },
    { key: 'radar', title: isFr ? 'Radars & Systèmes de Détection' : 'Radar & Scanners', iconName: 'radio' },
    { key: 'life_support', title: isFr ? 'Systèmes de Survie' : 'Life Support', iconName: 'heart-pulse' },
    {
      key: 'thrusters',
      title: isFr ? 'Propulseurs (Principaux, Rétro, Manœuvre)' : 'Thrusters (Main, Retro, Maneuver)',
      iconName: 'gauge',
    },
    { key: 'docked_vehicles', title: isFr ? 'Véhicules Arrimés & Parasites' : 'Docked & Parasite Vehicles', iconName: 'anchor' },
    {
      key: 'specialized',
      title: isFr
        ? 'Équipements Spécialisés (Minage, Salvage, Tracteur, Tactique)'
        : 'Specialized Equipment (Mining, Salvage, Tractor, Tactical)',
      iconName: 'wrench',
    },
    { key: 'avionics_blades', title: isFr ? 'Ordinateurs de Bord & Blades' : 'Computers & Flight Blades', iconName: 'cpu' },
    { key: 'fuel', title: isFr ? 'Réservoirs de Carburant (QT / H2) & Intakes' : 'Fuel Tanks (QT / H2) & Intakes', iconName: 'fuel' },
    { key: 'modules', title: isFr ? 'Modules Interchangeables' : 'Interchangeable Modules', iconName: 'layers' },
  ];

  const grouped = new Map<LoadoutGroupKey, LoadoutNode[]>();
  for (const def of sectionDefs) {
    grouped.set(def.key, []);
  }

  for (const root of rootNodes) {
    const detailedKey = determineDetailedGroup(root);
    const list = grouped.get(detailedKey) || grouped.get('specialized')!;
    list.push(root);
  }
  grouped.get('modules')!.push(...moduleHosts);

  // Specialized: one entry per identical tool (8 ore bags → "8x Sac à minerai"), tagged by specialty
  const specialized = compactIdenticalRoots(grouped.get('specialized')!);
  for (const node of specialized) node.specialtyTag = determineSpecialtyTag(node);
  grouped.set('specialized', specialized);

  const result: GroupedLoadoutSection[] = [];
  for (const def of sectionDefs) {
    const items = grouped.get(def.key) || [];
    if (items.length > 0) {
      if (def.key !== 'modules') {
        items.sort((a, b) => {
          if (def.key === 'specialized') {
            const tagDelta = SPECIALTY_ORDER.indexOf(a.specialtyTag ?? 'utility') - SPECIALTY_ORDER.indexOf(b.specialtyTag ?? 'utility');
            if (tagDelta !== 0) return tagDelta;
          }
          const sizeA = Number(a.component_size ?? 0);
          const sizeB = Number(b.component_size ?? 0);
          if (sizeB !== sizeA) return sizeB - sizeA;
          return a.humanPortName.localeCompare(b.humanPortName);
        });
      }
      const section: GroupedLoadoutSection = {
        key: def.key,
        title: `${def.title} (${items.length})`,
        iconName: def.iconName,
        nodes: items,
      };
      if (def.key === 'specialized') {
        section.subgroups = SPECIALTY_ORDER.map((tag) => ({
          tag,
          title: specialtyTitle(tag, isFr),
          nodes: items.filter((n) => (n.specialtyTag ?? 'utility') === tag),
        })).filter((g) => g.nodes.length > 0);
      }
      result.push(section);
    }
  }

  return result;
}

/** Merge identical leaf roots (same component, no children) into one counted entry. */
function compactIdenticalRoots(nodes: LoadoutNode[]): LoadoutNode[] {
  const compacted: LoadoutNode[] = [];
  const seen = new Map<string, LoadoutNode>();
  for (const node of nodes) {
    if (node.children.length > 0 || !node.component_class_name) {
      compacted.push(node);
      continue;
    }
    const key = `${node.component_class_name}|${node.moduleSlot ?? ''}`;
    const existing = seen.get(key);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      // Positions differ (#1, #2, front / rear…): keep only the common label
      existing.humanPortName = existing.humanPortName.replace(/\s*#\d+$/, '');
      if (existing.humanPortName !== node.humanPortName.replace(/\s*#\d+$/, '')) {
        existing.humanPortName = existing.humanPortName.replace(/\s*\([^)]*\)$/, '');
      }
    } else {
      seen.set(key, node);
      compacted.push(node);
    }
  }
  return compacted;
}

/**
 * Backward compatibility helper for flat list consumers.
 */
export function groupLoadoutSlots(slots: RawLoadoutSlot[], lang: SupportedLanguage): GroupedLoadoutSection[] {
  return buildLoadoutTree(slots, lang);
}
