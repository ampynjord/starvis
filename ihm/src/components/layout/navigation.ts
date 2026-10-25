import {
  Boxes,
  CalendarClock,
  ClipboardList,
  Code2,
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
  id: 'platform' | 'ships' | 'equipment' | 'economy' | 'universe';
  label: string;
  items: NavItemDef[];
};

const PLATFORM_ITEMS: NavItemDef[] = [
  { to: '/developer', icon: Code2, label: 'API & Datasets' },
  { to: '/changelog', icon: Scroll, label: 'Patch Changelog' },
  { to: '/about', icon: Database, label: 'About Starvis' },
  { to: '/roadmap', icon: CalendarClock, label: 'Roadmap' },
];

const SHIPS_ITEMS: NavItemDef[] = [
  { to: '/ships', icon: Rocket, label: 'Ships & Vehicles' },
  { to: '/components', icon: Zap, label: 'Vehicle Components' },
  { to: '/manufacturers', icon: Wrench, label: 'Manufacturers' },
];

const EQUIPMENT_ITEMS: NavItemDef[] = [
  { to: '/items', icon: Package, label: 'All FPS Items' },
  { to: '/weapons', icon: Crosshair, label: 'Weapons' },
  { to: '/armor', icon: Shield, label: 'Armor' },
  { to: '/loot', icon: Boxes, label: 'Loot Tables' },
];

const ECONOMY_ITEMS: NavItemDef[] = [
  { to: '/commodities', icon: Factory, label: 'Commodities' },
  { to: '/missions', icon: ClipboardList, label: 'Missions' },
  { to: '/factions', icon: Shield, label: 'Factions' },
];

const UNIVERSE_ITEMS: NavItemDef[] = [
  { to: '/starmap', icon: MapPin, label: 'Starmap' },
  { to: '/galactapedia', icon: Globe, label: 'Galactapedia' },
  { to: '/comm-links', icon: Newspaper, label: 'Comm-Links' },
];

export const NAV_GROUPS: NavGroupDef[] = [
  { id: 'platform', label: 'Platform', items: PLATFORM_ITEMS },
  { id: 'ships', label: 'Ships & Vehicles', items: SHIPS_ITEMS },
  { id: 'equipment', label: 'FPS & Equipment', items: EQUIPMENT_ITEMS },
  { id: 'economy', label: 'Economy & Industry', items: ECONOMY_ITEMS },
  { id: 'universe', label: 'Universe', items: UNIVERSE_ITEMS },
];
