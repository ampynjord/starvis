'use client';

import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import {
  Activity,
  Building2,
  ChevronRight,
  CircleDot,
  Eye,
  Globe2,
  Loader2,
  MapPin,
  Package,
  RadioTower,
  Route,
  Search,
  ShieldAlert,
  Sparkles,
  Store,
  Telescope,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EarlyAccessNotice } from '@/components/ui/EarlyAccessNotice';
import { ErrorState } from '@/components/ui/ErrorState';
import { useEnv } from '@/contexts/EnvContext';
import { createVisibilityTracker, disposeObject3D, getThreePixelRatio } from '@/lib/three-performance';
import { api } from '@/services/api';
import type { Location, PaginatedResponse, Shop, ShopInventoryItem } from '@/types/api';
import { fCredits } from '@/utils/formatters';
import { DetailRow, HudMetric, InfoTile, Metric, StatBar } from './universe-explorer-panels';

type Coordinates = { x?: number | string | null; y?: number | string | null; z?: number | string | null };

type JumpPointLink = {
  id?: string | null;
  direction?: string | null;
  status?: string | null;
  exitSystemCode?: string | null;
  exitSystemName?: string | null;
};

type RsiStarmapPosition = {
  id: number;
  rsi_id?: string | null;
  name: string;
  type: string;
  system_code?: string | null;
  system_name?: string | null;
  parent_id?: number | string | null;
  parent_db_id?: number | null;
  status?: string | null;
  faction_name?: string | null;
  coordinates?: Coordinates | null;
  thumbnail?: string | null;
  description?: string | null;
  star_type?: string | null;
  habitable_zone_inner?: number | string | null;
  habitable_zone_outer?: number | string | null;
  population?: number | string | null;
  economy?: number | string | null;
  danger?: number | string | null;
  jump_points?: JumpPointLink[] | null;
  aggregated?: {
    planets?: number;
    moons?: number;
    stations?: number;
    population?: number;
    economy?: number;
    danger?: number;
  } | null;
  p4k_location?: {
    uuid?: string | null;
    name?: string | null;
    type?: string | null;
    system_code?: string | null;
    parent_uuid?: string | null;
    coordinates?: Coordinates | null;
    p4k_path?: string | null;
    is_scannable?: boolean | null;
  } | null;
};

type JumpPointRow = {
  id: number;
  rsi_id?: string | null;
  name: string;
  system_code?: string | null;
  system_name?: string | null;
  jump_points?: JumpPointLink[] | null;
  web_url?: string | null;
};

type LocationWithMap = Location & {
  parent_id?: number | null;
  aggregated?: RsiStarmapPosition['aggregated'];
  coordinates?: Coordinates | null;
  rsi_starmap_location_id?: number | null;
  p4k_path?: string | null;
  thumbnail?: string | null;
  star_type?: string | null;
  habitable_zone_inner?: number | null;
  habitable_zone_outer?: number | null;
  population?: number | null;
  economy?: number | null;
  danger?: number | null;
  jump_points?: JumpPointLink[] | null;
  rsi_starmap?: {
    name?: string | null;
    type?: string | null;
    status?: string | null;
    system_code?: string | null;
    system_name?: string | null;
    faction_name?: string | null;
    coordinates?: Coordinates | null;
  } | null;
};

type MapNode = {
  id: string;
  loc: LocationWithMap;
  parentId: string | null;
  systemCode: string;
  position: THREE.Vector3;
  radius: number;
  color: number;
  label: string;
  shopCount: number;
  shop?: Shop;
};

type JumpConnection = { from: MapNode; to: MapNode; status: string | null };

type ViewMode = 'galaxy' | 'system';

const FALLBACK_POSITIONS: RsiStarmapPosition[] = [
  {
    id: 1,
    rsi_id: 'stanton',
    name: 'Stanton',
    type: 'system',
    system_code: 'STAN',
    coordinates: { x: 0, y: 0, z: 0 },
    jump_points: [
      { exitSystemCode: 'PYRO', exitSystemName: 'Pyro' },
      { exitSystemCode: 'TERR', exitSystemName: 'Terra' },
    ],
  },
  {
    id: 2,
    rsi_id: 'pyro',
    name: 'Pyro',
    type: 'system',
    system_code: 'PYRO',
    coordinates: { x: 42, y: 0, z: -36 },
    jump_points: [{ exitSystemCode: 'STAN', exitSystemName: 'Stanton' }],
  },
  {
    id: 3,
    rsi_id: 'terra',
    name: 'Terra',
    type: 'system',
    system_code: 'TERR',
    coordinates: { x: 78, y: 0, z: 24 },
    jump_points: [
      { exitSystemCode: 'STAN', exitSystemName: 'Stanton' },
      { exitSystemCode: 'SOL', exitSystemName: 'Sol' },
    ],
  },
  { id: 4, rsi_id: 'sol', name: 'Sol', type: 'system', system_code: 'SOL', coordinates: { x: -82, y: 0, z: -18 } },
  { id: 5, rsi_id: 'microtech', name: 'microTech', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: 18, y: 0, z: -12 } },
  { id: 6, rsi_id: 'hurston', name: 'Hurston', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: 10, y: 0, z: 24 } },
  { id: 7, rsi_id: 'crusader', name: 'Crusader', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: -22, y: 0, z: 15 } },
  { id: 8, rsi_id: 'arccorp', name: 'ArcCorp', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: -12, y: 0, z: -21 } },
  { id: 9, rsi_id: 'stanton-pyro', name: 'Stanton - Pyro', type: 'jump_point', system_code: 'STAN', parent_id: 1, coordinates: { x: 34, y: 0, z: -33 } },
];

const TYPE_ORDER = [
  'system',
  'star',
  'planet',
  'station',
  'asteroid',
  'jump_point',
  'moon',
  'orbital_station',
  'rest_stop',
  'landing_zone',
  'zone',
  'city',
  'base',
  'outpost',
  'location',
  'shop',
  'hospital',
  'rental',
  'service',
  'comm_array',
];
const MAP_TYPES = new Set(TYPE_ORDER);

const TYPE_STYLE: Record<string, { label: string; color: number; radius: number; icon: React.ReactNode; text: string; accent: string }> = {
  system: { label: 'Star system', color: 0x39e7ff, radius: 1.65, icon: <Sparkles size={12} />, text: 'text-cyan-300', accent: 'border-cyan-700/60 bg-cyan-950/25' },
  star: { label: 'Star', color: 0xffcc66, radius: 1.25, icon: <Sparkles size={12} />, text: 'text-amber-300', accent: 'border-amber-700/60 bg-amber-950/25' },
  planet: { label: 'Planet', color: 0x2dd4bf, radius: 1.55, icon: <Globe2 size={12} />, text: 'text-teal-300', accent: 'border-teal-700/60 bg-teal-950/25' },
  moon: { label: 'Moon', color: 0x94a3b8, radius: 0.82, icon: <CircleDot size={11} />, text: 'text-slate-300', accent: 'border-slate-700/60 bg-slate-900/35' },
  station: { label: 'Space station', color: 0xa78bfa, radius: 0.76, icon: <Building2 size={11} />, text: 'text-violet-300', accent: 'border-violet-700/60 bg-violet-950/25' },
  orbital_station: { label: 'Orbital station', color: 0x818cf8, radius: 0.68, icon: <Building2 size={11} />, text: 'text-indigo-300', accent: 'border-indigo-700/60 bg-indigo-950/25' },
  asteroid: { label: 'Asteroid', color: 0x94a3b8, radius: 0.72, icon: <CircleDot size={11} />, text: 'text-slate-300', accent: 'border-slate-700/60 bg-slate-900/35' },
  landing_zone: { label: 'City / zone', color: 0x38bdf8, radius: 0.7, icon: <MapPin size={11} />, text: 'text-sky-300', accent: 'border-sky-700/60 bg-sky-950/25' },
  zone: { label: 'Zone', color: 0x38bdf8, radius: 0.52, icon: <MapPin size={10} />, text: 'text-sky-300', accent: 'border-sky-700/60 bg-sky-950/25' },
  city: { label: 'City', color: 0x38bdf8, radius: 0.64, icon: <Building2 size={11} />, text: 'text-sky-300', accent: 'border-sky-700/60 bg-sky-950/25' },
  base: { label: 'Base', color: 0x64748b, radius: 0.5, icon: <MapPin size={10} />, text: 'text-slate-400', accent: 'border-slate-800 bg-slate-950/35' },
  rest_stop: { label: 'Rest stop', color: 0xf59e0b, radius: 0.7, icon: <Store size={11} />, text: 'text-amber-300', accent: 'border-amber-700/60 bg-amber-950/25' },
  outpost: { label: 'Outpost', color: 0x64748b, radius: 0.5, icon: <MapPin size={10} />, text: 'text-slate-400', accent: 'border-slate-800 bg-slate-950/35' },
  location: { label: 'Location', color: 0x64748b, radius: 0.42, icon: <MapPin size={10} />, text: 'text-slate-400', accent: 'border-slate-800 bg-slate-950/35' },
  shop: { label: 'Shop', color: 0xfbbf24, radius: 0.34, icon: <Store size={10} />, text: 'text-amber-300', accent: 'border-amber-800/60 bg-amber-950/20' },
  hospital: { label: 'Hospital', color: 0x22c55e, radius: 0.36, icon: <Activity size={10} />, text: 'text-emerald-300', accent: 'border-emerald-800/60 bg-emerald-950/20' },
  rental: { label: 'Rental', color: 0x60a5fa, radius: 0.36, icon: <Store size={10} />, text: 'text-blue-300', accent: 'border-blue-800/60 bg-blue-950/20' },
  service: { label: 'Service', color: 0x22d3ee, radius: 0.34, icon: <Store size={10} />, text: 'text-cyan-300', accent: 'border-cyan-800/60 bg-cyan-950/20' },
  jump_point: { label: 'Jump point', color: 0xc084fc, radius: 0.92, icon: <Route size={11} />, text: 'text-purple-300', accent: 'border-purple-700/60 bg-purple-950/25' },
  comm_array: { label: 'Comm array', color: 0x22d3ee, radius: 0.55, icon: <RadioTower size={10} />, text: 'text-cyan-300', accent: 'border-cyan-800/60 bg-cyan-950/20' },
};

function normalizeType(type: string) {
  return type
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase()
    .replace(/^star_system$/, 'system');
}

function typeStyle(type: string) {
  return TYPE_STYLE[normalizeType(type)] ?? {
    label: normalizeType(type).replace(/_/g, ' '),
    color: 0x64748b,
    radius: 0.42,
    icon: <MapPin size={10} />,
    text: 'text-slate-400',
    accent: 'border-slate-800 bg-slate-950/35',
  };
}

function typeRank(type: string) {
  const index = TYPE_ORDER.indexOf(normalizeType(type));
  return index === -1 ? TYPE_ORDER.length : index;
}

function shopNodeType(shop: Shop) {
  const type = `${shop.shop_type ?? shop.shopType ?? ''} ${shop.name ?? ''}`.toLowerCase();
  if (type.includes('medical') || type.includes('hospital') || type.includes('clinic')) return 'hospital';
  if (type.includes('rent')) return 'rental';
  if (type.includes('service') || type.includes('repair') || type.includes('refuel') || type.includes('customs')) return 'service';
  return 'shop';
}

function shopLocationLabel(shop?: Shop | null) {
  if (!shop) return '';
  return [shop.city, shop.planet_moon, shop.system].filter(Boolean).join(' / ') || shop.location || 'Unknown location';
}

async function loadAllShops(env: string) {
  const firstPage = await api.shops.list({ env, page: 1, limit: 100 });
  const pages = Math.max(1, firstPage.pages ?? Math.ceil((firstPage.total ?? firstPage.data.length) / 100));
  if (pages === 1) return firstPage;

  const nextPages = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) => api.shops.list({ env, page: index + 2, limit: 100 })),
  );
  const data = [firstPage, ...nextPages].flatMap((page) => page.data);
  return {
    ...firstPage,
    data,
    count: data.length,
    page: 1,
    limit: data.length,
  } satisfies PaginatedResponse<Shop>;
}

function lookupKey(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function shopToLocation(shop: Shop, parent: LocationWithMap): LocationWithMap {
  const type = shopNodeType(shop);
  return {
    uuid: `shop-${shop.id}`,
    class_name: shop.class_name || `shop-${shop.id}`,
    name: shop.name,
    type,
    system_code: parent.system_code ?? shop.system ?? null,
    parent_uuid: parent.uuid,
    loc_key: shop.loc_key ?? parent.loc_key ?? null,
    description: `${typeStyle(type).label} located at ${shopLocationLabel(shop)}.`,
    is_scannable: false,
    hide_in_starmap: false,
    coordinates: parent.coordinates ?? parent.rsi_starmap?.coordinates ?? null,
    rsi_starmap: parent.rsi_starmap
      ? {
          system_code: parent.rsi_starmap.system_code,
          system_name: parent.rsi_starmap.system_name,
          faction_name: parent.rsi_starmap.faction_name,
        }
      : null,
  } as LocationWithMap;
}

function toNumber(value: unknown) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function coords(loc: LocationWithMap) {
  const c = loc.coordinates ?? loc.rsi_starmap?.coordinates;
  if (!c) return null;
  const x = toNumber(c.x);
  const y = toNumber(c.y);
  const z = toNumber(c.z);
  if (x == null) return null;
  if (z != null) return new THREE.Vector3(x, y ?? 0, z);
  if (y != null) return new THREE.Vector3(x, 0, y);
  return null;
}

function systemCode(loc: LocationWithMap) {
  return (loc.system_code ?? loc.rsi_starmap?.system_code ?? loc.rsi_starmap?.system_name ?? loc.uuid.slice(0, 4)).toUpperCase();
}

function rsiImageUrl(url?: string | null) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `https://robertsspaceindustries.com${url.startsWith('/') ? '' : '/'}${url}`;
}

function posToLocation(pos: RsiStarmapPosition): LocationWithMap {
  const stableId = pos.rsi_id ?? String(pos.id);
  const parentStableId = pos.parent_id != null ? String(pos.parent_id) : null;
  const p4k = pos.p4k_location;
  return {
    uuid: `starmap-${stableId}`,
    class_name: pos.rsi_id ? `RSI_${pos.rsi_id}` : `RSI_${pos.id}`,
    name: pos.name,
    type: normalizeType(pos.type),
    system_code: pos.system_code ?? p4k?.system_code ?? null,
    parent_uuid: parentStableId ? `starmap-${parentStableId}` : null,
    parent_id: typeof pos.parent_id === 'number' ? pos.parent_id : null,
    loc_key: null,
    description: pos.description ?? null,
    is_scannable: Boolean(p4k?.is_scannable),
    hide_in_starmap: false,
    coordinates: pos.coordinates ?? p4k?.coordinates ?? null,
    p4k_path: p4k?.p4k_path ?? null,
    rsi_starmap_location_id: pos.id,
    aggregated: pos.aggregated ?? null,
    thumbnail: pos.thumbnail ?? null,
    star_type: pos.star_type ?? null,
    habitable_zone_inner: toNumber(pos.habitable_zone_inner),
    habitable_zone_outer: toNumber(pos.habitable_zone_outer),
    population: toNumber(pos.population),
    economy: toNumber(pos.economy),
    danger: toNumber(pos.danger),
    jump_points: Array.isArray(pos.jump_points) ? pos.jump_points : null,
    rsi_starmap: {
      name: pos.name,
      type: pos.type,
      status: pos.status ?? null,
      system_code: pos.system_code ?? null,
      system_name: pos.system_name ?? null,
      faction_name: pos.faction_name ?? null,
      coordinates: pos.coordinates ?? null,
    },
  } as LocationWithMap;
}

function mergeLocation(mapLoc: LocationWithMap, gameLoc: LocationWithMap): LocationWithMap {
  return {
    ...gameLoc,
    ...mapLoc,
    uuid: mapLoc.uuid,
    name: mapLoc.name || gameLoc.name,
    type: normalizeType(mapLoc.type || gameLoc.type),
    parent_uuid: mapLoc.parent_uuid ?? gameLoc.parent_uuid ?? null,
    parent_id: mapLoc.parent_id ?? gameLoc.parent_id ?? null,
    system_code: mapLoc.system_code ?? gameLoc.system_code ?? null,
    loc_key: gameLoc.loc_key ?? mapLoc.loc_key ?? null,
    description: mapLoc.description ?? gameLoc.description ?? null,
    is_scannable: gameLoc.is_scannable ?? mapLoc.is_scannable ?? false,
    p4k_path: mapLoc.p4k_path ?? gameLoc.p4k_path ?? null,
    coordinates: mapLoc.coordinates ?? gameLoc.coordinates ?? gameLoc.rsi_starmap?.coordinates ?? null,
    aggregated: mapLoc.aggregated ?? gameLoc.aggregated ?? null,
    rsi_starmap: {
      ...(gameLoc.rsi_starmap ?? {}),
      ...(mapLoc.rsi_starmap ?? {}),
    },
  };
}

function combineLocations(starmapPositions: RsiStarmapPosition[], gameLocations: LocationWithMap[]) {
  const mapLocations = starmapPositions.map(posToLocation);
  const byRsiId = new Map<number, LocationWithMap>();
  const combined = new Map<string, LocationWithMap>();

  for (const loc of mapLocations) {
    if (loc.rsi_starmap_location_id != null) byRsiId.set(loc.rsi_starmap_location_id, loc);
    combined.set(loc.uuid, loc);
  }

  for (const loc of gameLocations) {
    const normalized = { ...loc, type: normalizeType(loc.type) };
    const matched = normalized.rsi_starmap_location_id != null ? byRsiId.get(normalized.rsi_starmap_location_id) : null;
    if (matched) combined.set(matched.uuid, mergeLocation(matched, normalized));
  }

  return [...combined.values()];
}

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function factionColor(faction?: string | null) {
  const value = (faction ?? '').toLowerCase();
  if (value.includes('uee')) return 0x38bdf8;
  if (value.includes("xi'an") || value.includes('xian')) return 0xa78bfa;
  if (value.includes('banu')) return 0x34d399;
  if (value.includes('vanduul')) return 0xf87171;
  if (value.includes('unclaimed')) return 0x94a3b8;
  return 0x39e7ff;
}

function factionHex(faction?: string | null) {
  return `#${factionColor(faction).toString(16).padStart(6, '0')}`;
}

function buildNodes(locations: LocationWithMap[], shops: Shop[]) {
  const visible = locations
    .map((loc) => ({ ...loc, type: normalizeType(loc.type) }))
    .filter((loc) => !loc.hide_in_starmap && MAP_TYPES.has(loc.type));
  const shopsByLocKey = new Map<string, number>();
  for (const shop of shops) {
    if (!shop.loc_key) continue;
    shopsByLocKey.set(shop.loc_key, (shopsByLocKey.get(shop.loc_key) ?? 0) + 1);
  }

  const systems = visible.filter((loc) => loc.type === 'system');
  const roots = systems.length > 0
    ? systems
    : visible.filter((loc) => loc.type === 'star' && !loc.parent_uuid && loc.parent_id == null);
  const rootByCode = new Map(roots.map((loc) => [systemCode(loc), loc]));
  const visibleIds = new Set(visible.map((loc) => loc.uuid));
  const visibleByUuid = new Map(visible.map((loc) => [loc.uuid, loc]));
  const byRsiId = new Map<number, LocationWithMap>();
  for (const loc of visible) {
    if (loc.rsi_starmap_location_id != null) byRsiId.set(loc.rsi_starmap_location_id, loc);
  }
  const resolvedSystemCache = new Map<string, string>();
  const resolvedSystemCode = (loc: LocationWithMap, seen = new Set<string>()): string => {
    const cached = resolvedSystemCache.get(loc.uuid);
    if (cached) return cached;
    if (loc.type === 'system' || loc.system_code || loc.rsi_starmap?.system_code || loc.rsi_starmap?.system_name) {
      const code = systemCode(loc);
      resolvedSystemCache.set(loc.uuid, code);
      return code;
    }
    if (!seen.has(loc.uuid)) {
      seen.add(loc.uuid);
      const parent =
        loc.parent_id != null
          ? byRsiId.get(loc.parent_id)
          : loc.parent_uuid
            ? visibleByUuid.get(loc.parent_uuid)
            : null;
      if (parent) {
        const code = resolvedSystemCode(parent, seen);
        resolvedSystemCache.set(loc.uuid, code);
        return code;
      }
    }
    const code = systemCode(loc);
    resolvedSystemCache.set(loc.uuid, code);
    return code;
  };
  const parentIdFor = (loc: LocationWithMap) => {
    if (loc.parent_id != null) {
      const parent = byRsiId.get(loc.parent_id);
      if (parent?.uuid && parent.uuid !== loc.uuid) return parent.uuid;
    }
    if (loc.parent_uuid && visibleIds.has(loc.parent_uuid)) return loc.parent_uuid;
    const root = rootByCode.get(resolvedSystemCode(loc));
    return root && root.uuid !== loc.uuid ? root.uuid : null;
  };

  const rootCoords = roots.map((loc) => coords(loc)).filter(Boolean) as THREE.Vector3[];
  const bounds = rootCoords.length > 1 ? new THREE.Box3().setFromPoints(rootCoords) : null;
  const center = bounds?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
  const size = bounds?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
  const scale = 145 / Math.max(size.x, size.z, 1);
  const normalizedRootPosition = (loc: LocationWithMap, index: number) => {
    const c = coords(loc);
    if (c && bounds) return c.clone().sub(center).multiplyScalar(scale);
    const t = (index + 0.5) / Math.max(roots.length, 1);
    const a = index * 2.399963229728653;
    const r = Math.sqrt(t) * 72;
    return new THREE.Vector3(Math.cos(a) * r, (hash(`${loc.uuid}:y`) - 0.5) * 5, Math.sin(a) * r);
  };

  const nodes = new Map<string, MapNode>();
  roots.forEach((loc, index) => {
    const style = typeStyle(loc.type);
    const planetCount = toNumber(loc.aggregated?.planets) ?? 0;
    const radius = 1.05 + Math.min(planetCount, 7) * 0.16;
    const color = loc.type === 'star' || loc.type === 'system' ? factionColor(loc.rsi_starmap?.faction_name) : style.color;
    nodes.set(loc.uuid, {
      id: loc.uuid,
      loc,
      parentId: null,
      systemCode: systemCode(loc),
      position: normalizedRootPosition(loc, index),
      radius,
      color,
      label: loc.name,
      shopCount: loc.loc_key ? shopsByLocKey.get(loc.loc_key) ?? 0 : 0,
    });
  });

  const children = visible
    .filter((loc) => !nodes.has(loc.uuid))
    .sort((a, b) => typeRank(a.type) - typeRank(b.type) || a.name.localeCompare(b.name));

  const rootIdFor = (loc: LocationWithMap) => {
    const root = rootByCode.get(resolvedSystemCode(loc));
    return root?.uuid ?? null;
  };
  const coordinateBoundsByRoot = new Map<string, THREE.Box3>();
  for (const root of roots) {
    const points = children
      .filter((loc) => rootIdFor(loc) === root.uuid)
      .map((loc) => coords(loc))
      .filter(Boolean) as THREE.Vector3[];
    if (points.length > 1) coordinateBoundsByRoot.set(root.uuid, new THREE.Box3().setFromPoints(points));
  }
  const positionFromCoordinates = (loc: LocationWithMap, parent: MapNode | null) => {
    const c = coords(loc);
    const rootId = rootIdFor(loc);
    const boundsForRoot = rootId ? coordinateBoundsByRoot.get(rootId) : null;
    const rootNode = rootId ? nodes.get(rootId) : null;
    if (!c || !boundsForRoot || !rootNode) return null;
    const localCenter = boundsForRoot.getCenter(new THREE.Vector3());
    const localSize = boundsForRoot.getSize(new THREE.Vector3());
    const scaleFactor = loc.type === 'moon' ? 15 : 48;
    const localScale = scaleFactor / Math.max(localSize.x, localSize.z, localSize.y * 0.6, 1);
    const targetBase = loc.type === 'moon' && parent ? parent.position : rootNode.position;
    const centered = c.clone().sub(localCenter).multiplyScalar(localScale);
    centered.y *= 0.32;
    return targetBase.clone().add(centered);
  };

  for (const loc of children) {
    const parentId = parentIdFor(loc);
    const parent = parentId ? nodes.get(parentId) : null;
    const style = typeStyle(loc.type);
    const siblings = children.filter((candidate) => parentIdFor(candidate) === parentId);
    const index = siblings.findIndex((candidate) => candidate.uuid === loc.uuid);
    const angle = (index / Math.max(siblings.length, 1)) * Math.PI * 2 + hash(loc.uuid) * 0.6;
    const distance =
      loc.type === 'planet' ? 10 + index * 1.4 :
      loc.type === 'moon' ? 3.2 + index * 0.6 :
      loc.type === 'jump_point' ? 17 + index * 1.2 :
      5.4 + index * 0.3;
    const base = parent?.position ?? new THREE.Vector3();
    const position =
      positionFromCoordinates(loc, parent ?? null) ??
      base.clone().add(new THREE.Vector3(Math.cos(angle) * distance, (hash(`${loc.uuid}:height`) - 0.5) * 3, Math.sin(angle) * distance));
    nodes.set(loc.uuid, {
      id: loc.uuid,
      loc,
      parentId,
      systemCode: resolvedSystemCode(loc),
      position,
      radius: style.radius,
      color: style.color,
      label: loc.name,
      shopCount: loc.loc_key ? shopsByLocKey.get(loc.loc_key) ?? 0 : 0,
    });
  }

  const locationNodeByLocKey = new Map<string, MapNode>();
  const locationNodeByName = new Map<string, MapNode>();
  for (const node of nodes.values()) {
    if (node.loc.loc_key) locationNodeByLocKey.set(node.loc.loc_key, node);
    for (const value of [node.loc.name, node.loc.class_name, node.loc.rsi_starmap?.name]) {
      const key = lookupKey(value);
      if (key && !locationNodeByName.has(key)) locationNodeByName.set(key, node);
    }
  }

  const findShopParent = (shop: Shop) => {
    if (shop.loc_key) {
      const exact = locationNodeByLocKey.get(shop.loc_key);
      if (exact) return exact;
    }
    for (const value of [shop.location, shop.city, shop.planet_moon, shop.system]) {
      const key = lookupKey(value);
      if (!key) continue;
      const direct = locationNodeByName.get(key);
      if (direct) return direct;
    }
    const systemValue = lookupKey(shop.system);
    if (systemValue) {
      return [...nodes.values()].find((node) => node.loc.type === 'system' && lookupKey(node.label) === systemValue) ?? null;
    }
    return null;
  };

  const shopsByParent = new Map<string, Shop[]>();
  const orphanShops: Shop[] = [];
  for (const shop of shops) {
    const parent = findShopParent(shop);
    if (!parent) {
      orphanShops.push(shop);
      continue;
    }
    const list = shopsByParent.get(parent.id);
    if (list) list.push(shop);
    else shopsByParent.set(parent.id, [shop]);
  }

  for (const [parentId, parentShops] of shopsByParent) {
    const parent = nodes.get(parentId);
    if (!parent) continue;
    parentShops
      .sort((a, b) => shopNodeType(a).localeCompare(shopNodeType(b)) || a.name.localeCompare(b.name))
      .forEach((shop, index) => {
        const loc = shopToLocation(shop, parent.loc);
        const style = typeStyle(loc.type);
        const angle = index * 2.399963229728653 + hash(`shop-${shop.id}`) * 0.35;
        const ring = 1.6 + Math.floor(index / 8) * 0.85;
        const position = parent.position.clone().add(new THREE.Vector3(Math.cos(angle) * ring, 0.2, Math.sin(angle) * ring));
        nodes.set(loc.uuid, {
          id: loc.uuid,
          loc,
          parentId,
          systemCode: parent.systemCode,
          position,
          radius: style.radius,
          color: style.color,
          label: shop.name,
          shopCount: 0,
          shop,
        });
      });
  }

  orphanShops
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((shop, index) => {
      const loc = {
        uuid: `shop-${shop.id}`,
        class_name: shop.class_name || `shop-${shop.id}`,
        name: shop.name,
        type: shopNodeType(shop),
        system_code: shop.system ?? null,
        parent_uuid: null,
        loc_key: shop.loc_key ?? null,
        description: `${typeStyle(shopNodeType(shop)).label} located at ${shopLocationLabel(shop)}.`,
        is_scannable: false,
        hide_in_starmap: false,
      } as LocationWithMap;
      const style = typeStyle(loc.type);
      const angle = index * 2.399963229728653;
      const ring = 90 + Math.sqrt(index + 1) * 2.2;
      nodes.set(loc.uuid, {
        id: loc.uuid,
        loc,
        parentId: null,
        systemCode: shop.system || 'SHOP',
        position: new THREE.Vector3(Math.cos(angle) * ring, -1.5, Math.sin(angle) * ring),
        radius: style.radius,
        color: style.color,
        label: shop.name,
        shopCount: 0,
        shop,
      });
    });

  for (const node of nodes.values()) {
    if (node.parentId && !nodes.has(node.parentId)) {
      node.parentId = null;
    }
  }

  return [...nodes.values()];
}

function descendants(nodes: MapNode[], rootId: string) {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id);
        changed = true;
      }
    }
  }
  return result;
}

function orbitalPosition(center: THREE.Vector3, distance: number, angle: number, height = 0) {
  return center.clone().add(new THREE.Vector3(Math.cos(angle) * distance, height, Math.sin(angle) * distance));
}

function relaxGalaxyNodes(nodes: MapNode[]) {
  const display = nodes.map((node) => ({ ...node, position: node.position.clone(), radius: Math.max(node.radius * 0.88, 0.9) }));
  const minDistance = 8.8;
  for (let iteration = 0; iteration < 90; iteration++) {
    for (let i = 0; i < display.length; i++) {
      for (let j = i + 1; j < display.length; j++) {
        const a = display[i];
        const b = display[j];
        const delta = b.position.clone().sub(a.position);
        delta.y = 0;
        const distance = Math.max(delta.length(), 0.001);
        const wanted = minDistance + a.radius + b.radius;
        if (distance >= wanted) continue;
        const push = delta.normalize().multiplyScalar((wanted - distance) * 0.5);
        a.position.add(push.clone().multiplyScalar(-1));
        b.position.add(push);
      }
    }
  }
  return display.map((node) => {
    const radial = Math.hypot(node.position.x, node.position.z);
    if (radial > 158) {
      const scale = 158 / radial;
      node.position.x *= scale;
      node.position.z *= scale;
    }
    node.position.y = (hash(`${node.id}:galaxy-layer`) - 0.5) * 7;
    return node;
  });
}

function layoutSystemNodes(nodes: MapNode[], currentRoot: MapNode | null) {
  if (!currentRoot) return nodes;
  const ids = descendants(nodes, currentRoot.id);
  const source = nodes.filter((node) => ids.has(node.id));
  const byId = new Map(source.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, MapNode[]>();
  for (const node of source) {
    if (!node.parentId) continue;
    const list = childrenByParent.get(node.parentId);
    if (list) list.push(node);
    else childrenByParent.set(node.parentId, [node]);
  }
  for (const list of childrenByParent.values()) {
    list.sort(
      (a, b) =>
        typeRank(a.loc.type) - typeRank(b.loc.type) ||
        a.label.localeCompare(b.label),
    );
  }

  const positions = new Map<string, THREE.Vector3>([[currentRoot.id, new THREE.Vector3(0, 0, 0)]]);
  const rootChildren = childrenByParent.get(currentRoot.id) ?? [];
  const starChildren = rootChildren.filter((node) => normalizeType(node.loc.type) === 'star');
  const planets = rootChildren.filter((node) => normalizeType(node.loc.type) === 'planet');
  const rootPorts = rootChildren.filter((node) => ['station', 'orbital_station', 'landing_zone', 'rest_stop', 'outpost', 'comm_array'].includes(normalizeType(node.loc.type)));
  const jumpPoints = rootChildren.filter((node) => normalizeType(node.loc.type) === 'jump_point');
  const otherRootChildren = rootChildren.filter(
    (node) => !starChildren.includes(node) && !planets.includes(node) && !rootPorts.includes(node) && !jumpPoints.includes(node),
  );

  starChildren.forEach((node, index) => {
    positions.set(node.id, index === 0 ? new THREE.Vector3(0, 0.1, 0) : orbitalPosition(new THREE.Vector3(), 4 + index * 2.2, index * 2.399963229728653, 0.25));
  });

  planets.forEach((node, index) => {
    const angle = -Math.PI * 0.12 + index * 2.399963229728653;
    const ring = 10 + index * 5.2;
    positions.set(node.id, orbitalPosition(new THREE.Vector3(), ring, angle, (hash(`${node.id}:system-y`) - 0.5) * 0.5));
  });

  rootPorts.forEach((node, index) => {
    positions.set(node.id, orbitalPosition(new THREE.Vector3(), 14 + index * 2.4, Math.PI * 0.75 + index * 1.35, 0.45));
  });

  jumpPoints.forEach((node, index) => {
    positions.set(node.id, orbitalPosition(new THREE.Vector3(), 34 + (index % 2) * 4, -Math.PI * 0.35 + index * 0.9, 0.2));
  });

  otherRootChildren.forEach((node, index) => {
    positions.set(node.id, orbitalPosition(new THREE.Vector3(), 18 + index * 2.8, Math.PI * 1.25 + index * 1.2, 0.1));
  });

  const orderedParents = [...planets, ...rootPorts, ...otherRootChildren, ...starChildren];
  for (const parent of orderedParents) {
    const parentPosition = positions.get(parent.id);
    if (!parentPosition) continue;
    const children = childrenByParent.get(parent.id) ?? [];
    children.forEach((child, index) => {
      const type = normalizeType(child.loc.type);
      const distance =
        type === 'moon' ? 3.5 + index * 0.9 :
        type === 'station' || type === 'rest_stop' || type === 'landing_zone' ? 4.8 + index * 0.7 :
        ['shop', 'hospital', 'rental', 'service', 'location'].includes(type) ? 1.8 + Math.floor(index / 8) * 0.75 :
        5.8 + index * 0.8;
      const angle = index * 2.399963229728653 + hash(child.id) * 0.5;
      positions.set(child.id, orbitalPosition(parentPosition, distance, angle, 0.35));
    });
  }

  return source.map((node) => {
    const type = normalizeType(node.loc.type);
    const positioned = positions.get(node.id) ?? byId.get(node.parentId ?? '')?.position ?? new THREE.Vector3();
    return {
      ...node,
      position: positioned.clone(),
      radius:
        node.id === currentRoot.id ? 1.15 :
        type === 'star' ? Math.max(node.radius, 1.35) :
        type === 'planet' ? Math.max(node.radius, 1.3) :
        node.radius,
    };
  });
}

function Scene({
  nodes,
  jumpLinks,
  selectedId,
  highlightId,
  focusSelected,
  onSelect,
}: {
  nodes: MapNode[];
  jumpLinks: { a: string; b: string }[];
  selectedId: string | null;
  highlightId: string | null;
  focusSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedId);
  const highlightRef = useRef(highlightId);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    selectedRef.current = selectedId;
    highlightRef.current = highlightId;
    onSelectRef.current = onSelect;
  }, [selectedId, highlightId, onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || nodes.length === 0) return;

    const renderFallbackCanvas = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const width = Math.max(container.clientWidth, 640);
      const height = Math.max(container.clientHeight, 420);
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      const ctx = canvas.getContext('2d');
      if (!ctx) return () => canvas.remove();
      ctx.scale(ratio, ratio);
      ctx.fillStyle = '#020914';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 220; i++) {
        const x = hash(`fallback-star-x-${i}`) * width;
        const y = hash(`fallback-star-y-${i}`) * height;
        const alpha = 0.25 + hash(`fallback-star-a-${i}`) * 0.45;
        ctx.fillStyle = `rgba(103, 232, 249, ${alpha})`;
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.strokeStyle = 'rgba(8, 145, 178, 0.28)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      const minX = Math.min(...nodes.map((node) => node.position.x));
      const maxX = Math.max(...nodes.map((node) => node.position.x));
      const minZ = Math.min(...nodes.map((node) => node.position.z));
      const maxZ = Math.max(...nodes.map((node) => node.position.z));
      const project = (node: MapNode) => {
        const x = ((node.position.x - minX) / Math.max(maxX - minX, 1)) * (width - 160) + 80;
        const y = ((node.position.z - minZ) / Math.max(maxZ - minZ, 1)) * (height - 160) + 80;
        return { x, y };
      };
      ctx.font = '10px monospace';
      for (const link of jumpLinks) {
        const a = nodes.find((node) => node.id === link.a);
        const b = nodes.find((node) => node.id === link.b);
        if (!a || !b) continue;
        const pa = project(a);
        const pb = project(b);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.24)';
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      for (const node of nodes) {
        const point = project(node);
        const active = node.id === selectedId || node.id === highlightId;
        const radius = active ? 8 : Math.max(4, node.radius * 3);
        ctx.fillStyle = `#${node.color.toString(16).padStart(6, '0')}`;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = active ? 16 : 8;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = active ? '#e0faff' : '#67e8f9';
        ctx.fillText(node.label.toUpperCase(), point.x + radius + 5, point.y + 3);
      }
      container.appendChild(canvas);
      return () => canvas.remove();
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000204);
    scene.fog = new THREE.FogExp2(0x01060c, 0.0018);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      return renderFallbackCanvas();
    }
    renderer.setPixelRatio(getThreePixelRatio());
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(46, container.clientWidth / container.clientHeight, 0.1, 1400);
    camera.position.set(0, 118, 148);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 12;
    controls.maxDistance = 320;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.minPolarAngle = Math.PI * 0.08;
    controls.target.set(0, 0, 0);

    const visibility = createVisibilityTracker(container);
    scene.add(new THREE.AmbientLight(0x123647, 0.55));
    const light = new THREE.DirectionalLight(0xbdf8ff, 1.9);
    light.position.set(80, 120, 40);
    scene.add(light);
    const rimLight = new THREE.PointLight(0x38bdf8, 0.7, 360);
    rimLight.position.set(-80, 70, -90);
    scene.add(rimLight);

    const starCount = 3000;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starPalette = [new THREE.Color(0xb7ecff), new THREE.Color(0x5eead4), new THREE.Color(0xfef3c7), new THREE.Color(0xc4b5fd)];
    for (let i = 0; i < starPositions.length; i += 3) {
      const r = 180 + hash(`star-r-${i}`) * 620;
      const a = hash(`star-a-${i}`) * Math.PI * 2;
      starPositions[i] = Math.cos(a) * r;
      starPositions[i + 1] = (hash(`star-y-${i}`) - 0.5) * 320;
      starPositions[i + 2] = Math.sin(a) * r;
      const color = starPalette[Math.floor(hash(`star-c-${i}`) * starPalette.length)] ?? starPalette[0];
      starColors[i] = color.r;
      starColors[i + 1] = color.g;
      starColors[i + 2] = color.b;
    }
    const starGeometry = new THREE.BufferGeometry()
      .setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
      .setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ size: 0.46, transparent: true, opacity: 0.58, depthWrite: false, vertexColors: true }),
    );
    scene.add(stars);

    const group = new THREE.Group();
    scene.add(group);

    const grid = new THREE.GridHelper(360, 24, 0x0e7490, 0x052536);
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.055;
    grid.position.y = -8;
    group.add(grid);

    const horizon = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 192 }, (_, i) => {
          const a = (i / 192) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(a) * 155, -7.95, Math.sin(a) * 155);
        }),
      ),
      new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.11 }),
    );
    group.add(horizon);

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const linePositions: number[] = [];
    for (const node of nodes) {
      if (!node.parentId) continue;
      const parent = byId.get(node.parentId);
      if (!parent) continue;
      linePositions.push(parent.position.x, parent.position.y, parent.position.z, node.position.x, node.position.y, node.position.z);
    }
    const links = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3)),
      new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.12 }),
    );
    group.add(links);

    const jumpLines: { a: string; b: string; material: THREE.LineBasicMaterial }[] = [];
    for (const link of jumpLinks) {
      const a = byId.get(link.a);
      const b = byId.get(link.b);
      if (!a || !b) continue;
      const mid = a.position.clone().add(b.position).multiplyScalar(0.5);
      mid.y += a.position.distanceTo(b.position) * 0.16;
      const curve = new THREE.QuadraticBezierCurve3(a.position.clone(), mid, b.position.clone());
      const material = new THREE.LineBasicMaterial({
        color: 0x0891b2,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), material);
      group.add(line);
      jumpLines.push({ a: link.a, b: link.b, material });
    }

    const meshes = new Map<string, THREE.Mesh>();
    const halos = new Map<string, THREE.Sprite>();
    const labels: THREE.Sprite[] = [];
    const denseScene = nodes.filter((node) => !node.parentId).length > 45;

    function glowSprite(color: number) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      const c = new THREE.Color(color);
      const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
      gradient.addColorStop(0, `rgba(${rgb},0.62)`);
      gradient.addColorStop(0.35, `rgba(${rgb},0.18)`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    }

    function labelSprite(text: string, color: string) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.font = '700 25px Rajdhani, Arial';
      ctx.textAlign = 'center';
      ctx.shadowColor = color;
      ctx.shadowBlur = 7;
      ctx.fillStyle = color;
      ctx.fillText(text.toUpperCase(), 128, 36);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      sprite.scale.set(12, 3, 1);
      return sprite;
    }

    for (const node of nodes) {
      const type = normalizeType(node.loc.type);
      const geometry =
        type === 'system' ? new THREE.TorusGeometry(node.radius * 1.9, node.radius * 0.08, 8, 72) :
        type === 'station' || type === 'rest_stop' ? new THREE.OctahedronGeometry(node.radius * 1.25, 1) :
        type === 'outpost' || type === 'landing_zone' ? new THREE.BoxGeometry(node.radius * 1.5, node.radius * 0.65, node.radius * 1.5) :
        type === 'jump_point' ? new THREE.TorusGeometry(node.radius * 1.6, node.radius * 0.1, 8, 42) :
        new THREE.SphereGeometry(node.radius, type === 'system' || type === 'star' ? 32 : 24, type === 'system' || type === 'star' ? 16 : 12);
      const isRoot = !node.parentId;
      const material = new THREE.MeshPhongMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: isRoot ? 0.48 : type === 'star' ? 0.72 : type === 'system' ? 0.38 : 0.16,
        shininess: 70,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(node.position);
      if (type === 'system') mesh.rotation.x = Math.PI * 0.5;
      mesh.userData.nodeId = node.id;
      group.add(mesh);
      meshes.set(node.id, mesh);

      const halo = glowSprite(node.color);
      if (halo) {
        const scale = isRoot ? node.radius * 5.6 : type === 'system' || type === 'star' ? node.radius * 6.2 : node.radius * 3.2;
        halo.position.copy(node.position);
        halo.scale.set(scale, scale, 1);
        halo.userData.baseScale = scale;
        halo.userData.nodeId = node.id;
        halos.set(node.id, halo);
        group.add(halo);
      }

      if (isRoot || type === 'star') {
        const corona = glowSprite(node.color);
        if (corona) {
          const coronaScale = node.radius * 10;
          corona.position.copy(node.position);
          corona.scale.set(coronaScale, coronaScale, 1);
          (corona.material as THREE.SpriteMaterial).opacity = 0.12;
          group.add(corona);
        }
      }

      const showRootLabel = isRoot && node.label.length <= 14 && (!denseScene || node.id === selectedId || node.id === highlightId);
      if ((!isRoot && (type === 'star' || type === 'planet')) || showRootLabel) {
        const label = labelSprite(node.label, type === 'star' ? '#facc15' : '#67e8f9');
        if (label) {
          label.position.copy(node.position).add(new THREE.Vector3(0, node.radius + 2.2, 0));
          label.userData.isLabel = true;
          labels.push(label);
          group.add(label);
        }
      }

      if (type === 'planet' || type === 'moon') {
        const parent = node.parentId ? byId.get(node.parentId) : null;
        if (parent) {
          const orbit = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(
              Array.from({ length: 128 }, (_, i) => {
                const a = (i / 128) * Math.PI * 2;
                const d = parent.position.distanceTo(node.position);
                return new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d).add(parent.position);
              }),
            ),
            new THREE.LineBasicMaterial({ color: type === 'planet' ? 0x0e7490 : 0x164e63, transparent: true, opacity: type === 'planet' ? 0.2 : 0.1 }),
          );
          group.add(orbit);
        }
      }

      if (type === 'jump_point') {
        const ring = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            Array.from({ length: 72 }, (_, i) => {
              const a = (i / 72) * Math.PI * 2;
              return new THREE.Vector3(Math.cos(a) * node.radius * 2.2, Math.sin(a) * node.radius * 2.2, 0).add(node.position);
            }),
          ),
          new THREE.LineBasicMaterial({ color: node.color, transparent: true, opacity: 0.55 }),
        );
        ring.rotation.x = Math.PI * 0.5;
        group.add(ring);
      }
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hoverRef = { current: null as string | null };
    const pick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects([...meshes.values()], false)[0]?.object.userData.nodeId as string | undefined;
    };
    const onPointerUp = (event: PointerEvent) => {
      const hit = pick(event);
      if (hit) onSelectRef.current(hit);
    };
    const onPointerMove = (event: PointerEvent) => {
      const hit = pick(event);
      hoverRef.current = hit ?? null;
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    };
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    let frame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visibility.isVisible()) return;
      const t = clock.getElapsedTime();
      for (const [id, mesh] of meshes) {
        const selected = selectedRef.current === id;
        const hovered = hoverRef.current === id;
        const material = mesh.material as THREE.MeshPhongMaterial;
        mesh.rotation.y += 0.0018;
        mesh.scale.setScalar(selected ? 1.34 + Math.sin(t * 5) * 0.04 : hovered ? 1.16 : 1);
        material.emissiveIntensity = selected ? 1.1 : hovered ? 0.78 : normalizeType(byId.get(id)?.loc.type ?? '') === 'system' ? 0.45 : 0.22;
        const halo = halos.get(id);
        if (halo) {
          const baseScale = Number(halo.userData.baseScale ?? 1);
          const pulse = selected ? 1.25 + Math.sin(t * 5) * 0.08 : 1 + Math.sin(t * 0.8 + hash(id) * 10) * 0.03;
          halo.scale.set(baseScale * pulse, baseScale * pulse, 1);
          halo.position.copy(mesh.position);
          halo.quaternion.copy(camera.quaternion);
          (halo.material as THREE.SpriteMaterial).opacity = selected ? 0.98 : hovered ? 0.72 : 0.42;
        }
      }
      const activeSystem = hoverRef.current && byId.has(hoverRef.current) ? hoverRef.current : highlightRef.current;
      for (const jump of jumpLines) {
        const active = activeSystem != null && (jump.a === activeSystem || jump.b === activeSystem);
        jump.material.opacity = active ? 0.85 : 0.15;
        jump.material.color.setHex(active ? 0x67e8f9 : 0x0891b2);
      }
      links.rotation.y = Math.sin(t * 0.08) * 0.015;
      labels.forEach((label) => label.quaternion.copy(camera.quaternion));
      const selected = focusSelected && selectedRef.current ? byId.get(selectedRef.current) : null;
      if (selected) controls.target.lerp(selected.position, 0.04);
      if (!selected) controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.02);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resize = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(getThreePixelRatio());
      renderer.setSize(width, height);
    });
    resize.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.dispose();
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      controls.dispose();
      disposeObject3D(scene);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [nodes, jumpLinks, focusSelected]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

function TreeRow({
  node,
  depth,
  childrenByParent,
  expanded,
  visibleIds,
  selectedId,
  onToggle,
  onSelect,
}: {
  node: MapNode;
  depth: number;
  childrenByParent: Map<string, MapNode[]>;
  expanded: Set<string>;
  visibleIds: Set<string> | null;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (node: MapNode) => void;
}) {
  const children = (childrenByParent.get(node.id) ?? []).filter((child) => !visibleIds || visibleIds.has(child.id));
  const isRoot = !node.parentId;
  const isExpanded = visibleIds ? children.length > 0 : expanded.has(node.id);
  const active = selectedId === node.id;
  const style = typeStyle(node.loc.type);
  const faction = node.loc.rsi_starmap?.faction_name;
  return (
    <div>
      <div
        className={`mb-0.5 flex items-center rounded-sm border transition-colors ${
          active
            ? 'border-cyan-700/70 bg-cyan-950/45 text-cyan-100 shadow-[inset_2px_0_0_rgba(34,211,238,0.8)]'
            : 'border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-950/45 hover:text-slate-200'
        }`}
        style={{ paddingLeft: depth * 14 }}
      >
        {children.length > 0 ? (
          <button type="button" onClick={() => onToggle(node.id)} className="shrink-0 p-1 text-slate-600 hover:text-cyan-300">
            <ChevronRight size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button type="button" onClick={() => onSelect(node)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left">
          {isRoot ? (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: factionHex(faction), boxShadow: `0 0 6px ${factionHex(faction)}` }}
            />
          ) : (
            <span className={`shrink-0 ${style.text}`}>{style.icon}</span>
          )}
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-rajdhani text-sm font-semibold ${isRoot ? 'uppercase tracking-wide' : ''}`}>{node.label}</span>
            {isRoot && (
              <span className="block truncate font-mono-sc text-[9px] uppercase tracking-wider text-slate-600">
                {node.systemCode}
                {faction ? ` · ${faction}` : ''}
              </span>
            )}
          </span>
          {node.shopCount > 0 && <Store size={10} className="shrink-0 text-amber-400" />}
        </button>
      </div>
      {isExpanded &&
        children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            childrenByParent={childrenByParent}
            expanded={expanded}
            visibleIds={visibleIds}
            selectedId={selectedId}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function inventoryKindLabel(kind?: string | null) {
  if (!kind) return 'Unknown';
  return kind.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function inventoryPriceRows(item: ShopInventoryItem) {
  const rows: { label: string; value: number; className: string }[] = [];
  if (item.base_price != null && Number(item.base_price) > 0) rows.push({ label: 'Buy', value: Number(item.base_price), className: 'text-amber-400' });
  if (item.sell_price != null && Number(item.sell_price) > 0) rows.push({ label: 'Sell', value: Number(item.sell_price), className: 'text-red-400' });
  for (const [label, value] of [
    ['1d', item.rental_price_1d],
    ['3d', item.rental_price_3d],
    ['7d', item.rental_price_7d],
    ['30d', item.rental_price_30d],
  ] as const) {
    if (value != null && Number(value) > 0) rows.push({ label, value: Number(value), className: 'text-blue-300' });
  }
  return rows;
}

function inventoryTargetHref(item: ShopInventoryItem) {
  const uuid = item.component_uuid;
  if (!uuid) return null;
  if (item.inventory_kind === 'ship') return `/ships/${uuid}`;
  if (item.inventory_kind === 'item') return `/items/${uuid}`;
  if (item.inventory_kind === 'commodity') return `/commodities/${uuid}`;
  if (item.inventory_kind === 'component') return `/components/${uuid}`;
  return null;
}

function ShopInventoryPanel({
  inventory,
  loading,
}: {
  inventory?: ShopInventoryItem[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-4 sci-panel p-3">
        <div className="flex items-center gap-2 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-500">
          <Loader2 size={12} className="animate-spin" />
          Loading inventory
        </div>
      </div>
    );
  }

  if (!inventory?.length) {
    return (
      <div className="mt-4 sci-panel p-3 text-center">
        <p className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">No extracted inventory</p>
        <p className="mt-1 text-xs text-slate-700">This location exists, but no purchasable or rentable content is currently linked to it.</p>
      </div>
    );
  }

  const grouped = inventory.reduce<Map<string, ShopInventoryItem[]>>((map, item) => {
    const key = item.inventory_kind || 'unknown';
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
    return map;
  }, new Map());

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1 font-orbitron text-[10px] uppercase tracking-widest text-slate-600">
          <Package size={11} />
          Inventory
        </p>
        <span className="font-mono-sc text-[10px] text-amber-400">{inventory.length.toLocaleString('en-US')} entries</span>
      </div>
      <div className="space-y-3">
        {[...grouped.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([kind, items]) => (
            <div key={kind} className="rounded-sm border border-slate-900 bg-slate-950/35 p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono-sc text-[9px] uppercase tracking-widest text-cyan-700">{inventoryKindLabel(kind)}</span>
                <span className="font-mono-sc text-[9px] text-slate-700">{items.length}</span>
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                {items.slice(0, 60).map((item) => {
                  const href = inventoryTargetHref(item);
                  const priceRows = inventoryPriceRows(item);
                  const sourceLabel = item.source_name ?? item.source_type ?? item.source ?? null;
                  const confidence = item.confidence_score ?? item.confidence ?? null;
                  const content = (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-rajdhani text-sm font-semibold text-slate-300">
                          {item.item_name ?? item.component_name ?? item.component_class_name ?? 'Unknown item'}
                        </p>
                        <p className="truncate font-mono-sc text-[9px] uppercase tracking-wider text-slate-700">
                          {[item.item_type, item.item_size != null ? `S${item.item_size}` : null, item.terminal].filter(Boolean).join(' · ') || item.item_class_name}
                        </p>
                        {sourceLabel && (
                          <p className="mt-1 truncate font-mono-sc text-[9px] uppercase tracking-wider text-slate-700">
                            {sourceLabel}
                            {confidence != null ? ` · ${Math.round(Number(confidence) * 100)}%` : ''}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {priceRows.length ? (
                          <div className="space-y-0.5">
                            {priceRows.map((row) => (
                              <p key={row.label} className={`font-mono-sc text-[10px] ${row.className}`}>
                                {row.label} {fCredits(row.value)}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="font-mono-sc text-[10px] text-slate-700">Price unknown</p>
                        )}
                        {item.current_inventory != null && (
                          <p className="font-mono-sc text-[9px] text-slate-700">
                            Stock {Number(item.current_inventory).toLocaleString('en-US')}
                            {item.max_inventory != null ? ` / ${Number(item.max_inventory).toLocaleString('en-US')}` : ''}
                          </p>
                        )}
                      </div>
                    </>
                  );
                  const className = 'flex w-full items-start gap-2 rounded-sm border border-slate-900 bg-black/20 px-2 py-2 text-left transition-colors hover:border-cyan-900/70';
                  return href ? (
                    <Link key={item.id} href={href} className={className}>
                      {content}
                    </Link>
                  ) : (
                    <div key={item.id} className={className}>
                      {content}
                    </div>
                  );
                })}
              </div>
              {items.length > 60 && (
                <p className="mt-2 font-mono-sc text-[9px] text-slate-700">Showing first 60 entries in this group.</p>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

export default function UniverseExplorerPage() {
  const { env } = useEnv();
  const [shopParam, setShopParam] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('galaxy');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: starmapPositions, isLoading: loadingStarmap, error: starmapError } = useQuery({
    queryKey: ['starmap-positions'],
    queryFn: () => api.starmap.positions() as Promise<RsiStarmapPosition[]>,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const { data: jumpRows } = useQuery({
    queryKey: ['starmap-jump-points'],
    queryFn: () => api.starmap.jumpPoints() as Promise<JumpPointRow[]>,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const { data: gameLocations, isLoading: loadingLocations } = useQuery({
    queryKey: ['locations-all', env],
    queryFn: () => api.locations.all(env) as Promise<LocationWithMap[]>,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const { data: shopsData } = useQuery({
    queryKey: ['shops-all', env],
    queryFn: () => loadAllShops(env),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const allLocations = useMemo(
    () => combineLocations(starmapPositions?.length ? starmapPositions : FALLBACK_POSITIONS, gameLocations ?? []),
    [gameLocations, starmapPositions],
  );
  const allNodes = useMemo(() => buildNodes(allLocations, shopsData?.data ?? []), [allLocations, shopsData]);
  const roots = useMemo(() => allNodes.filter((node) => !node.parentId), [allNodes]);
  const selectedNode = useMemo(
    () => allNodes.find((node) => node.id === selectedId) ?? roots[0] ?? allNodes[0] ?? null,
    [allNodes, roots, selectedId],
  );
  const selectedShopId = selectedNode?.shop?.id ?? null;
  const { data: selectedShopInventory, isLoading: loadingSelectedShopInventory } = useQuery({
    queryKey: ['shop-inventory', selectedShopId, env],
    queryFn: () => api.shops.inventory(selectedShopId!, env),
    enabled: selectedShopId != null,
    staleTime: 5 * 60_000,
  });
  const currentRoot = useMemo(() => {
    if (!selectedNode) return roots[0] ?? null;
    let cursor: MapNode | null = selectedNode;
    while (cursor?.parentId) cursor = allNodes.find((node) => node.id === cursor?.parentId) ?? cursor;
    return cursor;
  }, [allNodes, roots, selectedNode]);
  const systemIds = useMemo(() => (viewMode === 'system' && currentRoot ? descendants(allNodes, currentRoot.id) : null), [allNodes, currentRoot, viewMode]);

  const query = search.trim().toLowerCase();
  const visibleNodes = useMemo(() => {
    const baseNodes = viewMode === 'galaxy'
      ? roots
      : allNodes.filter((node) => !systemIds || systemIds.has(node.id));
    return baseNodes.filter((node) => {
      const typeMatch = typeFilter === 'all' || normalizeType(node.loc.type) === typeFilter;
      const textMatch =
        !query ||
        node.label.toLowerCase().includes(query) ||
        node.systemCode.toLowerCase().includes(query) ||
        (node.loc.class_name ?? '').toLowerCase().includes(query) ||
        (node.shop?.shop_type ?? node.shop?.shopType ?? '').toLowerCase().includes(query) ||
        shopLocationLabel(node.shop).toLowerCase().includes(query);
      return typeMatch && textMatch;
    });
  }, [allNodes, query, roots, systemIds, typeFilter, viewMode]);

  const sceneNodes = useMemo(() => {
    const base =
      viewMode === 'galaxy'
        ? visibleNodes.length ? visibleNodes : roots
        : allNodes.filter((node) => !systemIds || systemIds.has(node.id));
    return viewMode === 'galaxy' ? relaxGalaxyNodes(base) : layoutSystemNodes(base, currentRoot);
  }, [allNodes, currentRoot, roots, systemIds, viewMode, visibleNodes]);

  const countsByType = useMemo(() => {
    const counts = new Map<string, number>();
    const baseNodes = viewMode === 'galaxy' ? roots : allNodes.filter((node) => !systemIds || systemIds.has(node.id));
    for (const node of baseNodes) counts.set(normalizeType(node.loc.type), (counts.get(normalizeType(node.loc.type)) ?? 0) + 1);
    return counts;
  }, [allNodes, roots, systemIds, viewMode]);

  const systemSummaries = useMemo(() => roots
    .map((root) => {
      const ids = descendants(allNodes, root.id);
      const children = allNodes.filter((node) => ids.has(node.id) && node.id !== root.id);
      return {
        root,
        objects: children.length + 1,
        planets: children.filter((node) => normalizeType(node.loc.type) === 'planet').length,
        moons: children.filter((node) => normalizeType(node.loc.type) === 'moon').length,
        stations: children.filter((node) => ['station', 'orbital_station', 'rest_stop', 'landing_zone', 'shop', 'hospital', 'rental', 'service'].includes(normalizeType(node.loc.type))).length,
        danger: root.loc.aggregated?.danger,
        economy: root.loc.aggregated?.economy,
      };
    })
    .sort((a, b) => a.root.label.localeCompare(b.root.label)), [allNodes, roots]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, MapNode[]>();
    for (const node of allNodes) {
      if (!node.parentId) continue;
      const list = map.get(node.parentId);
      if (list) list.push(node);
      else map.set(node.parentId, [node]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          typeRank(a.loc.type) - typeRank(b.loc.type) || a.label.localeCompare(b.label),
      );
    }
    return map;
  }, [allNodes]);

  const treeRoots = useMemo(() => [...roots].sort((a, b) => a.label.localeCompare(b.label)), [roots]);
  const emptyChildrenByParent = useMemo(() => new Map<string, MapNode[]>(), []);

  const searchResultNodes = useMemo(() => {
    if (!query) return null;
    return allNodes
      .filter((node) => {
        const typeMatch = typeFilter === 'all' || normalizeType(node.loc.type) === typeFilter;
        const textMatch =
          node.label.toLowerCase().includes(query) ||
          node.systemCode.toLowerCase().includes(query) ||
          (node.loc.class_name ?? '').toLowerCase().includes(query) ||
          (node.shop?.shop_type ?? node.shop?.shopType ?? '').toLowerCase().includes(query) ||
          shopLocationLabel(node.shop).toLowerCase().includes(query);
        return typeMatch && textMatch;
      })
      .sort((a, b) => typeRank(a.loc.type) - typeRank(b.loc.type) || a.label.localeCompare(b.label))
      .slice(0, 200);
  }, [allNodes, query, typeFilter]);

  const treeVisibleIds = useMemo(() => {
    if (!query) return null;
    const ids = new Set<string>();
    const visit = (node: MapNode): boolean => {
      let match =
        node.label.toLowerCase().includes(query) ||
        node.systemCode.toLowerCase().includes(query) ||
        (node.loc.class_name ?? '').toLowerCase().includes(query) ||
        (node.shop?.shop_type ?? node.shop?.shopType ?? '').toLowerCase().includes(query) ||
        shopLocationLabel(node.shop).toLowerCase().includes(query);
      for (const child of childrenByParent.get(node.id) ?? []) {
        if (visit(child)) match = true;
      }
      if (match) ids.add(node.id);
      return match;
    };
    for (const root of treeRoots) visit(root);
    return ids;
  }, [childrenByParent, query, treeRoots]);

  const jumpConnections = useMemo(() => {
    const rootByCode = new Map(roots.map((root) => [root.systemCode, root]));
    const sources = jumpRows?.length
      ? jumpRows.map((row) => ({ code: (row.system_code ?? '').toUpperCase(), links: row.jump_points ?? [] }))
      : roots.map((root) => ({ code: root.systemCode, links: root.loc.jump_points ?? [] }));
    const seen = new Set<string>();
    const connections: JumpConnection[] = [];
    for (const source of sources) {
      const from = rootByCode.get(source.code);
      if (!from) continue;
      for (const link of source.links) {
        const to = link.exitSystemCode ? rootByCode.get(link.exitSystemCode.toUpperCase()) : null;
        if (!to || to.id === from.id) continue;
        const key = [from.id, to.id].sort().join('>');
        if (seen.has(key)) continue;
        seen.add(key);
        connections.push({ from, to, status: link.status ?? null });
      }
    }
    return connections;
  }, [jumpRows, roots]);

  const jumpLinkPairs = useMemo(
    () => jumpConnections.map((connection) => ({ a: connection.from.id, b: connection.to.id })),
    [jumpConnections],
  );
  const sceneJumpLinkPairs = useMemo(() => {
    const visibleIds = new Set(sceneNodes.map((node) => node.id));
    return jumpLinkPairs.filter((link) => visibleIds.has(link.a) && visibleIds.has(link.b));
  }, [jumpLinkPairs, sceneNodes]);

  const selectedJumpLinks = useMemo(() => {
    if (!currentRoot) return [];
    return jumpConnections
      .filter((connection) => connection.from.id === currentRoot.id || connection.to.id === currentRoot.id)
      .map((connection) => ({
        target: connection.from.id === currentRoot.id ? connection.to : connection.from,
        status: connection.status,
      }));
  }, [currentRoot, jumpConnections]);

  const selectedChildren = useMemo(() => {
    if (!selectedNode) return [];
    const direct = allNodes.filter((node) => node.parentId === selectedNode.id);
    return direct.sort((a, b) => typeRank(a.loc.type) - typeRank(b.loc.type) || a.label.localeCompare(b.label)).slice(0, 10);
  }, [allNodes, selectedNode]);

  const currentSystemSummary = useMemo(() => (
    currentRoot ? systemSummaries.find((summary) => summary.root.id === currentRoot.id) ?? null : null
  ), [currentRoot, systemSummaries]);

  useEffect(() => {
    setShopParam(new URLSearchParams(window.location.search).get('shop'));
  }, []);

  useEffect(() => {
    if (!shopParam || allNodes.length === 0) return;
    const target = allNodes.find((node) => node.shop?.id != null && String(node.shop.id) === shopParam);
    if (!target) return;

    const ancestorIds = new Set<string>();
    let cursor: MapNode | undefined = target;
    let guard = 0;
    while (cursor?.parentId && guard < 32) {
      ancestorIds.add(cursor.parentId);
      cursor = allNodes.find((node) => node.id === cursor?.parentId);
      guard += 1;
    }

    setSelectedId(target.id);
    setViewMode('system');
    if (ancestorIds.size > 0) {
      setExpanded((prev) => new Set([...prev, ...ancestorIds]));
    }
  }, [allNodes, shopParam]);

  useEffect(() => {
    if (!shopParam && !selectedId && allNodes.length > 0) {
      const stanton = allNodes.find(
        (node) => !node.parentId && (node.systemCode === 'STANTON' || node.systemCode === 'STAN' || node.label.toLowerCase().includes('stanton')),
      );
      const first = stanton ?? allNodes.find((node) => !node.parentId) ?? allNodes[0];
      setSelectedId(first.id);
      if (stanton) {
        setExpanded((prev) => new Set(prev).add(stanton.id));
        setViewMode('system');
      }
    }
  }, [allNodes, selectedId, shopParam]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTreeSelect = (node: MapNode) => {
    setSelectedId(node.id);
    if (!node.parentId) {
      setExpanded((prev) => new Set(prev).add(node.id));
    } else {
      setViewMode('system');
    }
  };

  const navigateToSystem = (target: MapNode) => {
    setSelectedId(target.id);
    setExpanded((prev) => new Set(prev).add(target.id));
  };

  const loading = (loadingStarmap || loadingLocations) && allNodes.length === 0;
  if (starmapError && allNodes.length === 0) return <ErrorState error={starmapError as Error} />;

  const selectedLoc = selectedNode?.loc;
  const selectedFaction = selectedLoc?.rsi_starmap?.faction_name;
  const selectedThumbnail = rsiImageUrl(selectedLoc?.thumbnail);
  const hzInner = selectedLoc?.habitable_zone_inner;
  const hzOuter = selectedLoc?.habitable_zone_outer;
  const aggregated = currentRoot?.loc.aggregated;
  const selectedIsShop = Boolean(selectedNode?.shop);

  return (
    <div className="-m-3 flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-black text-slate-200 sm:-m-6">
      <div className="relative border-b border-cyan-950/80 bg-[#092231]/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-cyan-400/25" />
        <div className="relative flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-cyan-800/60 bg-black/25">
              <Telescope size={20} className="text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h1 className="font-orbitron text-lg font-bold uppercase tracking-widest text-cyan-200">Starvis Starmap</h1>
              <p className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
                {allNodes.length.toLocaleString('en-US')} mapped objects · {roots.length.toLocaleString('en-US')} systems · {jumpConnections.length.toLocaleString('en-US')} jump routes
              </p>
            </div>
          </div>
          <EarlyAccessNotice className="max-w-xl border-cyan-900/45 bg-cyan-950/10">
            Starmap positions mix extracted coordinates, RSI hierarchy and layout normalization. Use it for navigation and discovery, not as guaranteed astronomical precision.
          </EarlyAccessNotice>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-sm border border-cyan-900/50 bg-cyan-950/20 p-1">
              {(['galaxy', 'system'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-sm px-3 py-1.5 font-orbitron text-[10px] uppercase tracking-wider transition-colors ${
                    viewMode === mode ? 'bg-cyan-800/80 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.16)]' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            {currentRoot && (
              <button
                type="button"
                onClick={() => {
                  setSelectedId(currentRoot.id);
                  setViewMode('system');
                }}
                className="rounded-sm border border-purple-800/50 bg-purple-950/20 px-3 py-2 font-mono-sc text-[10px] uppercase tracking-widest text-purple-300 transition-colors hover:border-purple-500/60"
              >
                Focus {currentRoot.label}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr_340px]">
        <aside className="z-20 flex min-h-0 flex-col border-b border-cyan-950/70 bg-[#020b12]/88 p-3 backdrop-blur lg:border-b-0 lg:border-r">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search system, place, shop..."
              className="sci-input w-full pl-9 pr-9"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            <HudMetric icon={<Sparkles size={11} />} label="Systems" value={roots.length.toLocaleString('en-US')} />
            <HudMetric icon={<Globe2 size={11} />} label="Objects" value={allNodes.length.toLocaleString('en-US')} />
            <HudMetric icon={<Route size={11} />} label="Routes" value={jumpConnections.length.toLocaleString('en-US')} />
          </div>

          <div className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-900 pb-3 lg:flex-wrap">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`shrink-0 rounded-sm border px-2 py-1 font-mono-sc text-[10px] uppercase ${typeFilter === 'all' ? 'border-cyan-700 bg-cyan-950/30 text-cyan-300' : 'border-slate-800 text-slate-600 hover:text-slate-300'}`}
            >
              All
            </button>
            {TYPE_ORDER.filter((type) => countsByType.has(type)).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={`shrink-0 rounded-sm border px-2 py-1 font-mono-sc text-[10px] uppercase ${typeFilter === type ? `${typeStyle(type).accent} ${typeStyle(type).text}` : 'border-slate-800 text-slate-600 hover:text-slate-300'}`}
              >
                {typeStyle(type).label} {countsByType.get(type)}
              </button>
            ))}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <p className="font-orbitron text-[10px] uppercase tracking-widest text-slate-600">{searchResultNodes ? 'Search results' : 'Known systems'}</p>
            <span className="font-mono-sc text-[10px] text-cyan-700">
              {searchResultNodes?.length ?? (treeVisibleIds ? treeRoots.filter((root) => treeVisibleIds.has(root.id)) : treeRoots).length}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {(searchResultNodes ?? treeRoots.filter((root) => !treeVisibleIds || treeVisibleIds.has(root.id)))
              .map((root) => (
                <TreeRow
                  key={root.id}
                  node={root}
                  depth={0}
                  childrenByParent={searchResultNodes ? emptyChildrenByParent : childrenByParent}
                  expanded={expanded}
                  visibleIds={searchResultNodes ? null : treeVisibleIds}
                  selectedId={selectedNode?.id ?? null}
                  onToggle={toggleExpanded}
                  onSelect={handleTreeSelect}
                />
              ))}
          </div>
        </aside>

        <main className="relative min-h-[420px] overflow-hidden bg-black">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(8,47,73,0.24),transparent_38%)]" />
          <div className="pointer-events-none absolute inset-x-8 top-6 z-10 hidden items-center justify-between border-b border-cyan-950/70 bg-black/20 px-1 py-2 backdrop-blur-sm md:flex">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-500">
                <Eye size={11} />
                {viewMode === 'galaxy' ? 'Galaxy overview' : currentRoot?.label ?? 'System view'}
              </span>
              {currentSystemSummary && (
                <span className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
                  {currentSystemSummary.objects} objects · {currentSystemSummary.planets} planets · {currentSystemSummary.stations} ports
                </span>
              )}
            </div>
            <span className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-700">
              Drag rotate · Scroll zoom · Click object
            </span>
          </div>
          {loading ? (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="animate-spin text-cyan-400" size={32} />
            </div>
          ) : (
            <Scene
              nodes={sceneNodes}
              jumpLinks={sceneJumpLinkPairs}
              selectedId={selectedNode?.id ?? null}
              highlightId={currentRoot?.id ?? null}
              focusSelected
              onSelect={setSelectedId}
            />
          )}
          <div className="pointer-events-none absolute bottom-4 left-4 grid grid-cols-2 gap-2 md:grid-cols-5">
            <LegendSwatch type="system" />
            <LegendSwatch type="planet" />
            <LegendSwatch type="station" />
            <LegendSwatch type="jump_point" />
            <LegendSwatch type="shop" />
          </div>
        </main>

        <AnimatePresence mode="wait">
          {selectedNode && selectedLoc && (
            <motion.aside
              key={selectedNode.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="z-20 flex min-h-0 flex-col overflow-y-auto border-t border-cyan-950/70 bg-[#020b12]/88 p-4 backdrop-blur lg:border-l lg:border-t-0"
            >
              {selectedThumbnail && (
                <div className="relative -mx-4 -mt-4 mb-4 h-36 shrink-0 overflow-hidden border-b border-cyan-950/60">
                  <img src={selectedThumbnail} alt={selectedNode.label} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                </div>
              )}

              <div className="mb-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono-sc text-[10px] uppercase tracking-widest ${typeStyle(selectedLoc.type).accent} ${typeStyle(selectedLoc.type).text}`}>
                    {typeStyle(selectedLoc.type).icon}
                    {typeStyle(selectedLoc.type).label}
                  </span>
                  <span className="font-mono-sc text-[10px] uppercase tracking-widest text-cyan-700">{selectedNode.systemCode}</span>
                </div>
                <h2 className="font-orbitron text-xl font-bold uppercase tracking-wider text-slate-100">{selectedNode.label}</h2>
                {selectedLoc.rsi_starmap?.system_name && (
                  <p className="mt-1 text-xs text-slate-600">{selectedLoc.rsi_starmap.system_name}</p>
                )}
                {selectedFaction && (
                  <span
                    className="mt-2 inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono-sc text-[10px] uppercase tracking-widest"
                    style={{
                      borderColor: `${factionHex(selectedFaction)}66`,
                      backgroundColor: `${factionHex(selectedFaction)}14`,
                      color: factionHex(selectedFaction),
                    }}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: factionHex(selectedFaction) }} />
                    {selectedFaction}
                  </span>
                )}
              </div>

              {selectedLoc.description && (
                <div className="mb-4 max-h-32 shrink-0 overflow-y-auto pr-1">
                  <p className="text-xs leading-relaxed text-slate-400">{selectedLoc.description}</p>
                </div>
              )}

              {!selectedIsShop && (
                <div className="sci-panel mb-4 p-3">
                  <StatBar
                    icon={<Users size={10} />}
                    label="Population"
                    value={selectedLoc.population ?? toNumber(selectedLoc.aggregated?.population)}
                    color="#22d3ee"
                  />
                  <StatBar
                    icon={<Activity size={10} />}
                    label="Economy"
                    value={selectedLoc.economy ?? toNumber(selectedLoc.aggregated?.economy)}
                    color="#34d399"
                  />
                  <StatBar
                    icon={<ShieldAlert size={10} />}
                    label="Danger"
                    value={selectedLoc.danger ?? toNumber(selectedLoc.aggregated?.danger)}
                    color="#f87171"
                  />
                </div>
              )}

              {(selectedLoc.star_type || (hzInner != null && hzOuter != null)) && (
                <div className="sci-panel mb-4 p-3">
                  <DetailRow label="Star type" value={selectedLoc.star_type} />
                  <DetailRow label="Habitable zone" value={hzInner != null && hzOuter != null ? `${hzInner} – ${hzOuter} AU` : null} />
                </div>
              )}

              {currentSystemSummary && (
                <div className="mb-4 grid grid-cols-3 gap-2">
                  <InfoTile
                    icon={<Globe2 size={12} />}
                    label="Planets"
                    value={toNumber(aggregated?.planets) ?? currentSystemSummary.planets}
                  />
                  <InfoTile
                    icon={<CircleDot size={12} />}
                    label="Moons"
                    value={toNumber(aggregated?.moons) ?? currentSystemSummary.moons}
                  />
                  <InfoTile
                    icon={<Building2 size={12} />}
                    label="Stations"
                    value={toNumber(aggregated?.stations) ?? currentSystemSummary.stations}
                  />
                </div>
              )}

              <div className="mb-4 grid grid-cols-3 gap-2">
                <Metric label="X" value={selectedNode.position.x.toFixed(1)} />
                <Metric label="Y" value={selectedNode.position.y.toFixed(1)} />
                <Metric label="Z" value={selectedNode.position.z.toFixed(1)} />
              </div>

              <div className="sci-panel p-3">
                {selectedNode.shop && (
                  <>
                    <DetailRow label="Shop type" value={selectedNode.shop.display_shop_type ?? selectedNode.shop.shop_type ?? selectedNode.shop.shopType} />
                    <DetailRow label="Location" value={shopLocationLabel(selectedNode.shop)} />
                  </>
                )}
                <DetailRow label="Class" value={selectedLoc.class_name} />
                <DetailRow label="RSI status" value={selectedLoc.rsi_starmap?.status} />
                <DetailRow label="Scannable" value={selectedLoc.is_scannable ? 'Yes' : 'No'} />
                {!selectedIsShop && <DetailRow label="Shops" value={selectedNode.shopCount || null} />}
              </div>

              {selectedIsShop && (
                <ShopInventoryPanel inventory={selectedShopInventory} loading={loadingSelectedShopInventory} />
              )}

              {selectedJumpLinks.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 font-orbitron text-[10px] uppercase tracking-widest text-slate-600">Jump connections</p>
                  <div className="space-y-1">
                    {selectedJumpLinks.map((jump) => (
                      <button
                        key={jump.target.id}
                        type="button"
                        onClick={() => navigateToSystem(jump.target)}
                        className="flex w-full items-center gap-2 rounded-sm border border-slate-900 bg-slate-950/45 px-2 py-2 text-left text-slate-400 transition-colors hover:border-purple-800/60 hover:text-purple-200"
                      >
                        <Route size={11} className="shrink-0 text-purple-400" />
                        <span className="min-w-0 flex-1 truncate font-rajdhani text-sm font-semibold">{jump.target.label}</span>
                        <span className="font-mono-sc text-[9px] uppercase text-slate-700">{jump.status ?? jump.target.systemCode}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedChildren.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 font-orbitron text-[10px] uppercase tracking-widest text-slate-600">Orbit / children</p>
                  <div className="space-y-1">
                    {selectedChildren.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => setSelectedId(child.id)}
                        className="flex w-full items-center gap-2 rounded-sm border border-slate-900 bg-slate-950/45 px-2 py-2 text-left text-slate-400 transition-colors hover:border-cyan-900/60 hover:text-slate-200"
                      >
                        <span className={typeStyle(child.loc.type).text}>{typeStyle(child.loc.type).icon}</span>
                        <span className="min-w-0 flex-1 truncate font-rajdhani text-sm font-semibold">{child.label}</span>
                        <span className="font-mono-sc text-[9px] uppercase text-slate-700">{typeStyle(child.loc.type).label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setViewMode('system')} className="sci-btn-primary flex-1 py-2 text-xs">
                  Focus system
                </button>
                <button type="button" onClick={() => setViewMode('galaxy')} className="rounded-sm border border-slate-800 px-3 py-2 font-mono-sc text-xs text-slate-500 hover:text-slate-300">
                  Galaxy
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LegendSwatch({ type }: { type: string }) {
  const style = typeStyle(type);
  return (
    <div className={`rounded-sm border px-2 py-1.5 backdrop-blur ${style.accent}`}>
      <span className={`flex items-center gap-1 font-mono-sc text-[9px] uppercase tracking-widest ${style.text}`}>
        {style.icon}
        {style.label}
      </span>
    </div>
  );
}
