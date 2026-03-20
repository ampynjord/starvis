export const API_BASE = '/api/v1';

export const VARIANT_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard',
  collector: 'Collector',
  npc: 'NPC',
  pyam_exec: 'PyAM / Exec',
};

export const VARIANT_TYPE_COLORS: Record<string, string> = {
  standard: 'text-cyan-400 border-cyan-800 bg-cyan-950/40',
  collector: 'text-amber-400 border-amber-800 bg-amber-950/40',
  npc: 'text-red-400 border-red-800 bg-red-950/40',
  pyam_exec: 'text-purple-400 border-purple-800 bg-purple-950/40',
};

export const COMPONENT_TYPE_COLORS: Record<string, string> = {
  WeaponGun: 'text-red-400',
  WeaponMissile: 'text-orange-400',
  Shield: 'text-blue-400',
  QuantumDrive: 'text-purple-400',
  PowerPlant: 'text-yellow-400',
  Cooler: 'text-cyan-400',
  FuelTank: 'text-green-400',
  Thruster: 'text-amber-400',
  Scanner: 'text-teal-400',
  Radar: 'text-indigo-400',
};
