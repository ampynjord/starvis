// Star Citizen mining static data — refinery methods and known ore sell prices

export interface RefineryMethod {
  id: string;
  name: string;
  yieldPct: number; // fraction of ore recovered (0–1)
  feePct: number; // refinery fee as % of raw value (0–1)
  timeMultiplier: number; // relative time (1.0 = base)
  description: string;
}

export const REFINERY_METHODS: RefineryMethod[] = [
  {
    id: 'ferron',
    name: 'Ferron Exchange',
    yieldPct: 0.75,
    feePct: 0.06,
    timeMultiplier: 0.75,
    description: 'Fast, low cost, lower yield.',
  },
  {
    id: 'cormack',
    name: 'Cormack Method',
    yieldPct: 0.94,
    feePct: 0.07,
    timeMultiplier: 1.0,
    description: 'High yield, standard speed.',
  },
  {
    id: 'trawtha',
    name: 'TRAWTHA Refine',
    yieldPct: 0.7,
    feePct: 0.05,
    timeMultiplier: 0.7,
    description: 'Cheapest and fastest, lowest yield.',
  },
  {
    id: 'electro',
    name: 'Electrostarolysis',
    yieldPct: 0.85,
    feePct: 0.09,
    timeMultiplier: 0.9,
    description: 'Good yield/speed balance, higher fee.',
  },
  {
    id: 'pyro',
    name: 'Pyrometric Chromasolv',
    yieldPct: 0.76,
    feePct: 0.08,
    timeMultiplier: 0.8,
    description: 'Fast with decent yield but costly.',
  },
  {
    id: 'thermo',
    name: 'Thermonatic Decomp',
    yieldPct: 0.92,
    feePct: 0.1,
    timeMultiplier: 0.95,
    description: 'Near-top yield, very high fee.',
  },
  {
    id: 'xcr',
    name: 'XCR Reaction',
    yieldPct: 0.84,
    feePct: 0.075,
    timeMultiplier: 0.85,
    description: 'Balanced all-rounder.',
  },
];

export interface OrePrice {
  name: string;
  /** Known class name fragment for matching against API data */
  classFragment: string;
  pricePerScu: number; // aUEC/SCU
  scuPerKg: number; // 1 SCU = how many kg
}

// Community-sourced approximate sell prices (aUEC per SCU).
// Players can override these in the Profit Calculator.
export const ORE_PRICES: OrePrice[] = [
  { name: 'Quantanium', classFragment: 'quantanium', pricePerScu: 1450, scuPerKg: 1 },
  { name: 'Bexalite', classFragment: 'bexalite', pricePerScu: 640, scuPerKg: 1 },
  { name: 'Laranite', classFragment: 'laranite', pricePerScu: 512, scuPerKg: 1 },
  { name: 'Diamond', classFragment: 'diamond', pricePerScu: 600, scuPerKg: 1 },
  { name: 'Borase', classFragment: 'borase', pricePerScu: 349, scuPerKg: 1 },
  { name: 'Taranite', classFragment: 'taranite', pricePerScu: 302, scuPerKg: 1 },
  { name: 'Agricium', classFragment: 'agricium', pricePerScu: 300, scuPerKg: 1 },
  { name: 'Hephaestanite', classFragment: 'hephaestanite', pricePerScu: 205, scuPerKg: 1 },
  { name: 'Gold', classFragment: 'gold', pricePerScu: 202, scuPerKg: 1 },
  { name: 'Titanium', classFragment: 'titanium', pricePerScu: 196, scuPerKg: 1 },
  { name: 'Corundum', classFragment: 'corundum', pricePerScu: 155, scuPerKg: 1 },
  { name: 'Tungsten', classFragment: 'tungsten', pricePerScu: 145, scuPerKg: 1 },
  { name: 'Copper', classFragment: 'copper', pricePerScu: 140, scuPerKg: 1 },
  { name: 'Beryl', classFragment: 'beryl', pricePerScu: 128, scuPerKg: 1 },
  { name: 'Quartz', classFragment: 'quartz', pricePerScu: 96, scuPerKg: 1 },
  { name: 'Aluminium', classFragment: 'alumin', pricePerScu: 80, scuPerKg: 1 },
  { name: 'Iron', classFragment: 'iron', pricePerScu: 60, scuPerKg: 1 },
  { name: 'Inert Materials', classFragment: 'inert', pricePerScu: 0, scuPerKg: 1 },
];

// Approximate base refinery time in minutes per 1 SCU for each ore category.
// Used only for timer estimation when no exact data is available.
export const BASE_REFINERY_MINUTES_PER_SCU = 10;

export interface RefineryLocation {
  id: string;
  name: string;
  system: string;
}

export const REFINERY_LOCATIONS: RefineryLocation[] = [
  { id: 'arc_corp', name: 'ArcCorp Mining Area 157', system: 'Stanton' },
  { id: 'cl_lagrange', name: 'CL-Lagrange Station', system: 'Stanton' },
  { id: 'cru_l5', name: 'CRU-L5 Station', system: 'Stanton' },
  { id: 'grim_hex', name: 'Grim HEX', system: 'Stanton' },
  { id: 'hdms', name: 'HDMS Outpost', system: 'Stanton' },
  { id: 'mic_l1', name: 'MIC-L1 Station', system: 'Stanton' },
  { id: 'mic_l2', name: 'MIC-L2 Station', system: 'Stanton' },
  { id: 'port_olisar', name: 'Port Olisar', system: 'Stanton' },
  { id: 'pyro_l1', name: 'Pyro Gateway Station', system: 'Pyro' },
  { id: 'ruin_station', name: 'Ruin Station', system: 'Pyro' },
  { id: 'checkmate', name: 'Checkmate', system: 'Pyro' },
];

export const CREW_ROLES = [
  { id: 'miner', label: 'Miner', defaultShares: 2 },
  { id: 'pilot', label: 'Pilot', defaultShares: 1 },
  { id: 'scout', label: 'Scout', defaultShares: 1 },
  { id: 'turret', label: 'Turret', defaultShares: 1 },
  { id: 'other', label: 'Other', defaultShares: 1 },
];
