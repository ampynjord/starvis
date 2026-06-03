import {
  BarChart3,
  ClipboardList,
  Crosshair,
  Factory,
  Globe,
  MapPin,
  Newspaper,
  Package,
  Rocket,
  Scroll,
  Shield,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  Utensils,
  Wrench,
  Zap,
} from 'lucide-react';

export type NavItemDef = {
  to: string;
  icon: React.ElementType;
  label: string;
  auth?: boolean;
  /** Use exact pathname match for active state (avoids prefix collision between sibling routes). */
  exact?: boolean;
};

export type NavGroupDef = {
  id: 'ships' | 'equipment' | 'economy' | 'universe';
  label: string;
  items: NavItemDef[];
};

const SHIPS_ITEMS: NavItemDef[] = [
  { to: '/ships', icon: Rocket, label: 'Ships & Vehicles' },
  { to: '/vehicles', icon: Zap, label: 'Vehicle Equipment' },
  { to: '/compare', icon: BarChart3, label: 'Compare' },
  { to: '/ranking', icon: Trophy, label: 'Ranking' },
  { to: '/loadout-manager', icon: SlidersHorizontal, label: 'Loadout Manager' },
];

const EQUIPMENT_ITEMS: NavItemDef[] = [
  { to: '/armor', icon: Shield, label: 'Armor' },
  { to: '/clothing', icon: Package, label: 'Clothing' },
  { to: '/weapons', icon: Crosshair, label: 'Weapons' },
  { to: '/utility', icon: Wrench, label: 'Utility' },
  { to: '/ammo', icon: Zap, label: 'Ammo', exact: true },
  { to: '/sustenance', icon: Utensils, label: 'Sustenance' },
  { to: '/fps-calculator', icon: SlidersHorizontal, label: 'FPS Calculator' },
];

const ECONOMY_ITEMS: NavItemDef[] = [
  { to: '/commodities', icon: Factory, label: 'Commodities' },
  { to: '/crafting-calculator', icon: Scroll, label: 'Crafting Calculator' },
  { to: '/mining-calculator', icon: BarChart3, label: 'Mining Calculator' },
  { to: '/trade-calculator', icon: TrendingUp, label: 'Trade Calculator' },
];

const UNIVERSE_ITEMS: NavItemDef[] = [
  { to: '/missions', icon: ClipboardList, label: 'Missions' },
  { to: '/locations', icon: MapPin, label: 'Starmap' },
  { to: '/factions', icon: Shield, label: 'Factions' },
  { to: '/manufacturers', icon: Wrench, label: 'Manufacturers' },
  { to: '/galactapedia', icon: Globe, label: 'Galactapedia' },
  { to: '/comm-links', icon: Newspaper, label: 'Comm-Links' },
];

export const NAV_GROUPS: NavGroupDef[] = [
  { id: 'ships', label: 'Ships & Vehicles', items: SHIPS_ITEMS },
  { id: 'equipment', label: 'FPS & Equipment', items: EQUIPMENT_ITEMS },
  { id: 'economy', label: 'Economy & Industry', items: ECONOMY_ITEMS },
  { id: 'universe', label: 'Universe', items: UNIVERSE_ITEMS },
];
