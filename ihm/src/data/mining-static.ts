import miningStatic from './mining-static.json';

export interface RefineryMethod {
  id: string;
  name: string;
  yieldPct: number;
  feePct: number;
  timeMultiplier: number;
  description: string;
}

export interface OrePrice {
  name: string;
  classFragment: string;
  pricePerScu: number;
  scuPerKg: number;
}

export interface RefineryLocation {
  id: string;
  name: string;
  system: string;
}

export interface CrewRole {
  id: string;
  label: string;
  defaultShares: number;
}

export const REFINERY_METHODS = miningStatic.refineryMethods as RefineryMethod[];
export const ORE_PRICES = miningStatic.orePrices as OrePrice[];
export const BASE_REFINERY_MINUTES_PER_SCU = miningStatic.baseRefineryMinutesPerScu;
export const REFINERY_LOCATIONS = miningStatic.refineryLocations as RefineryLocation[];
export const CREW_ROLES = miningStatic.crewRoles as CrewRole[];
