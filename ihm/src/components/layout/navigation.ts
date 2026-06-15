import {
  BarChart3,
  Bot,
  ClipboardList,
  Crosshair,
  Database,
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
  earlyAccess?: boolean;
  auth?: boolean;
  /** Use exact pathname match for active state (avoids prefix collision between sibling routes). */
  exact?: boolean;
};

export type NavGroupDef = {
  id: 'ships' | 'equipment' | 'economy' | 'universe' | 'integrations';
  label: string;
  items: NavItemDef[];
};

const SHIPS_ITEMS: NavItemDef[] = [
  { to: '/ships', icon: Rocket, label: 'Ships & Vehicles' },
  { to: '/vehicles', icon: Zap, label: 'Vehicle Equipment' },
  { to: '/compare', icon: BarChart3, label: 'Compare' },
  { to: '/ranking', icon: Trophy, label: 'Ranking' },
  { to: '/loadout-manager', icon: SlidersHorizontal, label: 'Loadout Manager', earlyAccess: true },
];

const EQUIPMENT_ITEMS: NavItemDef[] = [
  { to: '/armor', icon: Shield, label: 'Armor' },
  { to: '/clothing', icon: Package, label: 'Clothing' },
  { to: '/weapons', icon: Crosshair, label: 'Weapons' },
  { to: '/utility', icon: Wrench, label: 'Utility' },
  { to: '/ammo', icon: Zap, label: 'Ammo', exact: true },
  { to: '/sustenance', icon: Utensils, label: 'Sustenance' },
  { to: '/fps-calculator', icon: SlidersHorizontal, label: 'FPS Calculator', earlyAccess: true },
];

const ECONOMY_ITEMS: NavItemDef[] = [
  { to: '/commodities', icon: Factory, label: 'Commodities' },
  { to: '/crafting-calculator', icon: Scroll, label: 'Crafting Calculator', earlyAccess: true },
  { to: '/mining-calculator', icon: BarChart3, label: 'Mining Calculator', earlyAccess: true },
  { to: '/trade-calculator', icon: TrendingUp, label: 'Trade Calculator', earlyAccess: true },
];

const UNIVERSE_ITEMS: NavItemDef[] = [
  { to: '/missions', icon: ClipboardList, label: 'Missions' },
  { to: '/starmap', icon: MapPin, label: 'Starmap', earlyAccess: true },
  { to: '/factions', icon: Shield, label: 'Factions' },
  { to: '/manufacturers', icon: Wrench, label: 'Manufacturers' },
  { to: '/galactapedia', icon: Globe, label: 'Galactapedia' },
  { to: '/comm-links', icon: Newspaper, label: 'Comm-Links' },
];

const PLATFORM_ITEMS: NavItemDef[] = [
  { to: '/about', icon: Database, label: 'About Starvis' },
  { to: '/discord', icon: Bot, label: 'Discord Bot' },
];

export const NAV_GROUPS: NavGroupDef[] = [
  { id: 'ships', label: 'Ships & Vehicles', items: SHIPS_ITEMS },
  { id: 'equipment', label: 'FPS & Equipment', items: EQUIPMENT_ITEMS },
  { id: 'economy', label: 'Economy & Industry', items: ECONOMY_ITEMS },
  { id: 'universe', label: 'Universe', items: UNIVERSE_ITEMS },
  { id: 'integrations', label: 'Platform', items: PLATFORM_ITEMS },
];
