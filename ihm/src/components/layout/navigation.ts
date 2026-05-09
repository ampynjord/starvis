import {
  BarChart3,
  ClipboardList,
  Crosshair,
  Factory,
  Globe,
  Layers3,
  MapPin,
  Newspaper,
  Paintbrush,
  Rocket,
  Scroll,
  Settings2,
  Shield,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  Wrench,
} from 'lucide-react';

export type NavItemDef = {
  to: string;
  icon: React.ElementType;
  label: string;
  auth?: boolean;
  comingSoon?: boolean;
};

export type NavGroupDef = {
  id: 'ships' | 'fps' | 'economy' | 'universe';
  label: string;
  items: NavItemDef[];
};

const SHIPS_ITEMS: NavItemDef[] = [
  { to: '/ships', icon: Rocket, label: 'Ships & Vehicles' },
  { to: '/ships-components', icon: Settings2, label: 'Ship Components' },
  { to: '/paints', icon: Paintbrush, label: 'Paints' },
  { to: '/compare', icon: BarChart3, label: 'Compare' },
  { to: '/ranking', icon: Trophy, label: 'Ranking' },
  { to: '/loadout-manager', icon: SlidersHorizontal, label: 'Loadout Manager' },
];

const FPS_ITEMS: NavItemDef[] = [
  { to: '/fps-gear', icon: Crosshair, label: 'FPS Gear' },
  { to: '/consumables', icon: Layers3, label: 'Consumables' },
  { to: '/fps-calculator', icon: SlidersHorizontal, label: 'FPS Calculator', comingSoon: true },
];

const ECONOMY_ITEMS: NavItemDef[] = [
  { to: '/commodities', icon: Factory, label: 'Commodities' },
  { to: '/crafting-calculator', icon: Scroll, label: 'Crafting Calculator' },
  { to: '/mining-calculator', icon: BarChart3, label: 'Mining Calculator' },
  { to: '/trade-calculator', icon: TrendingUp, label: 'Trade Calculator' },
];

const UNIVERSE_ITEMS: NavItemDef[] = [
  { to: '/missions', icon: ClipboardList, label: 'Missions' },
  { to: '/locations', icon: MapPin, label: 'Locations' },
  { to: '/factions', icon: Shield, label: 'Factions' },
  { to: '/manufacturers', icon: Wrench, label: 'Manufacturers' },
  { to: '/galactapedia', icon: Globe, label: 'Galactapedia' },
  { to: '/comm-links', icon: Newspaper, label: 'Comm-Links' },
];

export const NAV_GROUPS: NavGroupDef[] = [
  { id: 'ships', label: 'Ships', items: SHIPS_ITEMS },
  { id: 'fps', label: 'FPS & Equipment', items: FPS_ITEMS },
  { id: 'economy', label: 'Economy & Industry', items: ECONOMY_ITEMS },
  { id: 'universe', label: 'Universe', items: UNIVERSE_ITEMS },
];
