export const API_BASE = '/api/v1';

export const VARIANT_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard',
  collector: 'Collector',
  wikelo: 'Wikelo',
  pyam_exec: 'PyAM / Exec',
};

export const VARIANT_TYPE_COLORS: Record<string, string> = {
  standard: 'text-cyan-400 border-cyan-800 bg-cyan-950/40',
  collector: 'text-amber-400 border-amber-800 bg-amber-950/40',
  wikelo: 'text-emerald-400 border-emerald-800 bg-emerald-950/40',
  pyam_exec: 'text-purple-400 border-purple-800 bg-purple-950/40',
};

/** Internal DB type → human-readable game label */
export const COMPONENT_TYPE_LABELS: Record<string, string> = {
  WeaponGun: 'Gun',
  WeaponMissile: 'Missile',
  Shield: 'Shield',
  QuantumDrive: 'Quantum Drive',
  PowerPlant: 'Power Plant',
  Cooler: 'Cooler',
  FuelTank: 'Fuel Tank',
  FuelIntake: 'Fuel Intake',
  Thruster: 'Thruster',
  Radar: 'Radar',
  Countermeasure: 'Countermeasure',
  EMP: 'EMP',
  MissileRack: 'Missile Rack',
  MiningLaser: 'Mining Laser',
  TractorBeam: 'Tractor Beam',
  SalvageHead: 'Salvage Head',
  LifeSupport: 'Life Support',
  QuantumInterdictionGenerator: 'Quantum Interdiction',
  Gimbal: 'Gimbal',
  Turret: 'Turret',
  TurretUnmanned: 'Unmanned Turret',
  SelfDestruct: 'Self Destruct',
  Scanner: 'Scanner',
};

export const COMPONENT_TYPE_COLORS: Record<string, string> = {
  WeaponGun: 'text-red-400',
  WeaponMissile: 'text-orange-400',
  Shield: 'text-blue-400',
  QuantumDrive: 'text-purple-400',
  PowerPlant: 'text-yellow-400',
  Cooler: 'text-cyan-400',
  FuelTank: 'text-green-400',
  FuelIntake: 'text-green-300',
  Thruster: 'text-amber-400',
  Radar: 'text-indigo-400',
  Countermeasure: 'text-teal-400',
  EMP: 'text-fuchsia-400',
  MissileRack: 'text-orange-300',
  MiningLaser: 'text-emerald-400',
  TractorBeam: 'text-sky-400',
  SalvageHead: 'text-lime-400',
  LifeSupport: 'text-rose-400',
  QuantumInterdictionGenerator: 'text-violet-400',
  Gimbal: 'text-slate-400',
  Turret: 'text-red-300',
  TurretUnmanned: 'text-red-200',
  SelfDestruct: 'text-rose-600',
  Scanner: 'text-teal-400',
};

/** FPS item type → human-readable game label (matches SC inventory names) */
export const ITEM_TYPE_LABELS: Record<string, string> = {
  FPS_Weapon: 'Weapon',
  Armor_Helmet: 'Helmet',
  Armor_Torso: 'Core',
  Armor_Arms: 'Arms',
  Armor_Legs: 'Legs',
  Armor_Backpack: 'Back',
  Undersuit: 'Undersuit',
  Clothing: 'Clothing',
  Gadget: 'Gadget',
  Tool: 'Tool',
  Consumable: 'Consumable',
  Attachment: 'Attachment',
  Magazine: 'Magazine',
};

/** Commodity type → display label */
export const COMMODITY_TYPE_LABELS: Record<string, string> = {
  Food: 'Food',
  Drink: 'Drink',
  Mineral: 'Mineral',
  Metal: 'Metal',
  Gas: 'Gas',
  Vice: 'Vice',
  Natural: 'Natural',
  'Consumer Goods': 'Consumer Goods',
  Manmade: 'Manmade',
  'Processed Goods': 'Processed Goods',
  Alloy: 'Alloy',
  'Agricultural Supply': 'Agricultural Supply',
  Halogen: 'Halogen',
  Counterfeit: 'Contraband',
  'Medical Supply': 'Medical',
  Scrap: 'Scrap',
  'Mixed Mining': 'Mixed Mining',
  Nonmetal: 'Non-Metal',
  Waste: 'Waste',
  Refined: 'Refined',
  Raw: 'Raw',
};
