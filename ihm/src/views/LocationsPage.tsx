'use client';

import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Crosshair, Globe2, Loader2, MapPin, Radio, Search, Sparkles, Volume2, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { useEnv } from '@/contexts/EnvContext';
import { createVisibilityTracker, disposeObject3D, getThreePixelRatio } from '@/lib/three-performance';
import { api } from '@/services/api';
import type { Location, Shop } from '@/types/api';

type Coordinates = { x?: number | string | null; y?: number | string | null; z?: number | string | null };
type RsiStarmapPosition = {
  id: number;
  rsi_id?: string | null;
  name: string;
  type: string;
  system_code?: string | null;
  system_name?: string | null;
  parent_id?: number | null;
  coordinates?: Coordinates | null;
  aggregated?: {
    planets?: number;
    moons?: number;
    stations?: number;
    population?: number;
    economy?: number;
    danger?: number;
  } | null;
};
type LocationWithMap = Location & {
  parent_id?: number | null;
  aggregated?: RsiStarmapPosition['aggregated'];
  coordinates?: Coordinates | null;
  rsi_starmap_location_id?: number | null;
  p4k_path?: string | null;
  rsi_starmap?: {
    name?: string | null;
    type?: string | null;
    status?: string | null;
    system_code?: string | null;
    faction_name?: string | null;
    coordinates?: Coordinates | null;
  } | null;
};

type StarmapNode = {
  id: string;
  loc: LocationWithMap;
  parentId: string | null;
  systemCode: string;
  position: THREE.Vector3;
  radius: number;
  color: number;
  glow: number;
  label: string;
  shopCount: number;
};

type StarmapViewMode = 'galaxy' | 'system' | 'object';

const FALLBACK_STARMAP_POSITIONS: RsiStarmapPosition[] = [
  { id: 1, rsi_id: 'stanton', name: 'Stanton', type: 'system', system_code: 'STAN', parent_id: null, coordinates: { x: 0, y: 0, z: 0 } },
  { id: 2, rsi_id: 'sol', name: 'Sol', type: 'system', system_code: 'SOL', parent_id: null, coordinates: { x: -82, y: 4, z: -18 } },
  { id: 3, rsi_id: 'terra', name: 'Terra', type: 'system', system_code: 'TERR', parent_id: null, coordinates: { x: 72, y: -2, z: 24 } },
  { id: 4, rsi_id: 'pyro', name: 'Pyro', type: 'system', system_code: 'PYRO', parent_id: null, coordinates: { x: 42, y: 1, z: -44 } },
  { id: 5, rsi_id: 'magnus', name: 'Magnus', type: 'system', system_code: 'MAGN', parent_id: null, coordinates: { x: 112, y: 5, z: 62 } },
  { id: 6, rsi_id: 'microtech', name: 'microTech', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: 18, y: 0, z: -12 } },
  { id: 7, rsi_id: 'crusader', name: 'Crusader', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: -22, y: 0, z: 15 } },
  { id: 8, rsi_id: 'hurston', name: 'Hurston', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: 10, y: 0, z: 24 } },
  { id: 9, rsi_id: 'arccorp', name: 'ArcCorp', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: -12, y: 0, z: -21 } },
  { id: 10, rsi_id: 'port-olisar', name: 'Port Olisar', type: 'station', system_code: 'STAN', parent_id: 7, coordinates: { x: -26, y: 0, z: 19 } },
  { id: 11, rsi_id: 'stanton-pyro', name: 'Stanton - Pyro', type: 'jump_point', system_code: 'STAN', parent_id: 1, coordinates: { x: 34, y: 0, z: -33 } },
  { id: 12, rsi_id: 'stanton-terra', name: 'Stanton - Terra', type: 'jump_point', system_code: 'STAN', parent_id: 1, coordinates: { x: 44, y: 0, z: 18 } },
];

const TYPE_ORDER = ['system', 'star', 'planet', 'moon', 'landing_zone', 'station', 'rest_stop', 'outpost', 'comm_array', 'jump_point'];
const IMPORTANT_TYPES = new Set(['system', 'star', 'planet', 'moon', 'landing_zone', 'station', 'rest_stop', 'outpost', 'comm_array', 'jump_point']);

const TYPE_META: Record<string, { label: string; color: number; glow: number; radius: number; icon: React.ReactNode }> = {
  system: { label: 'System', color: 0x20e4ff, glow: 0x083044, radius: 3.8, icon: <Sparkles size={12} /> },
  star: { label: 'Star', color: 0xffc857, glow: 0x332006, radius: 3.4, icon: <Sparkles size={12} /> },
  planet: { label: 'Planet', color: 0x2dd4bf, glow: 0x06352f, radius: 2.1, icon: <Globe2 size={12} /> },
  moon: { label: 'Moon', color: 0x94a3b8, glow: 0x111827, radius: 1.15, icon: <Globe2 size={11} /> },
  landing_zone: { label: 'Landing Zone', color: 0x38bdf8, glow: 0x082f49, radius: 0.95, icon: <Building2 size={11} /> },
  station: { label: 'Station', color: 0xa78bfa, glow: 0x24124d, radius: 0.95, icon: <Radio size={11} /> },
  rest_stop: { label: 'Rest Stop', color: 0xf59e0b, glow: 0x3b2206, radius: 0.85, icon: <MapPin size={11} /> },
  outpost: { label: 'Outpost', color: 0x64748b, glow: 0x111827, radius: 0.62, icon: <MapPin size={10} /> },
  comm_array: { label: 'Comm Array', color: 0x22d3ee, glow: 0x083344, radius: 0.7, icon: <Radio size={10} /> },
  jump_point: { label: 'Jump Point', color: 0xc084fc, glow: 0x2e1065, radius: 1.05, icon: <Zap size={11} /> },
};

function normalizeType(type: string) {
  const normalized = type.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
  return normalized === 'star_system' ? 'system' : normalized;
}

function metaFor(type: string) {
  const normalized = normalizeType(type);
  return TYPE_META[normalized] ?? { label: normalized.replace(/_/g, ' '), color: 0x64748b, glow: 0x111827, radius: 0.45, icon: <MapPin size={10} /> };
}

function coordNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getCoordinates(loc: LocationWithMap): THREE.Vector3 | null {
  const c = loc.coordinates ?? loc.rsi_starmap?.coordinates;
  if (!c) return null;
  const x = coordNumber(c.x);
  const y = coordNumber(c.y);
  const z = coordNumber(c.z);
  if (x == null || z == null) return null;
  return new THREE.Vector3(x, y ?? 0, z);
}

function systemCodeFor(loc: LocationWithMap) {
  const byCode = loc.system_code ?? loc.rsi_starmap?.system_code;
  if (byCode) return byCode.toUpperCase();
  const m = loc.class_name?.match(/^([A-Za-z]+)SolarSystem$/);
  return m?.[1]?.toUpperCase() ?? loc.uuid.slice(0, 8).toUpperCase();
}

function starmapPositionToLocation(pos: RsiStarmapPosition): LocationWithMap {
  const uuid = `starmap-${pos.id}`;
  return {
    uuid,
    class_name: pos.rsi_id ? `RSI_${pos.rsi_id}` : uuid,
    name: pos.name,
    type: normalizeType(pos.type),
    system_code: pos.system_code ?? null,
    parent_uuid: pos.parent_id != null ? `starmap-${pos.parent_id}` : null,
    parent_id: pos.parent_id ?? null,
    rsi_starmap_location_id: pos.id,
    loc_key: null,
    coordinates: pos.coordinates ?? null,
    p4k_path: null,
    is_scannable: false,
    hide_in_starmap: false,
    aggregated: pos.aggregated ?? null,
    rsi_starmap: {
      name: pos.name,
      type: pos.type,
      system_code: pos.system_code ?? null,
      system_name: pos.system_name ?? null,
      coordinates: pos.coordinates ?? null,
    },
  } as LocationWithMap;
}

function mergeLocationData(mapLoc: LocationWithMap, gameLoc: LocationWithMap): LocationWithMap {
  return {
    ...mapLoc,
    ...gameLoc,
    uuid: mapLoc.uuid,
    class_name: gameLoc.class_name || mapLoc.class_name,
    name: mapLoc.name || gameLoc.name,
    type: normalizeType(mapLoc.type || gameLoc.type),
    system_code: gameLoc.system_code ?? mapLoc.system_code ?? mapLoc.rsi_starmap?.system_code ?? null,
    parent_uuid: gameLoc.parent_uuid ?? mapLoc.parent_uuid ?? null,
    parent_id: mapLoc.parent_id ?? gameLoc.parent_id ?? null,
    rsi_starmap_location_id: mapLoc.rsi_starmap_location_id ?? gameLoc.rsi_starmap_location_id ?? null,
    loc_key: gameLoc.loc_key ?? mapLoc.loc_key ?? null,
    description: gameLoc.description ?? mapLoc.description ?? null,
    coordinates: mapLoc.coordinates ?? gameLoc.coordinates ?? gameLoc.rsi_starmap?.coordinates ?? null,
    p4k_path: gameLoc.p4k_path ?? mapLoc.p4k_path ?? null,
    is_scannable: gameLoc.is_scannable ?? mapLoc.is_scannable ?? false,
    hide_in_starmap: gameLoc.hide_in_starmap ?? mapLoc.hide_in_starmap ?? false,
    aggregated: mapLoc.aggregated ?? gameLoc.aggregated ?? null,
    rsi_starmap: {
      ...(gameLoc.rsi_starmap ?? {}),
      ...(mapLoc.rsi_starmap ?? {}),
      coordinates: mapLoc.rsi_starmap?.coordinates ?? mapLoc.coordinates ?? gameLoc.rsi_starmap?.coordinates ?? gameLoc.coordinates ?? null,
      system_code: gameLoc.rsi_starmap?.system_code ?? mapLoc.rsi_starmap?.system_code ?? gameLoc.system_code ?? mapLoc.system_code ?? null,
    },
  };
}

function combineVerseLocations(starmapPositions: RsiStarmapPosition[], gameLocations: LocationWithMap[]): LocationWithMap[] {
  const mapLocations = starmapPositions.map(starmapPositionToLocation);
  const byRsiId = new Map<number, LocationWithMap>();
  const combined = new Map<string, LocationWithMap>();

  for (const loc of mapLocations) {
    if (loc.rsi_starmap_location_id != null) byRsiId.set(loc.rsi_starmap_location_id, loc);
    combined.set(loc.uuid, loc);
  }

  for (const rawGameLoc of gameLocations) {
    const gameLoc = { ...rawGameLoc, type: normalizeType(rawGameLoc.type) };
    const rsiId = gameLoc.rsi_starmap_location_id ?? null;
    const matchingMapLoc = rsiId != null ? byRsiId.get(rsiId) : undefined;
    if (matchingMapLoc) {
      combined.set(matchingMapLoc.uuid, mergeLocationData(matchingMapLoc, gameLoc));
    } else {
      combined.set(gameLoc.uuid, gameLoc);
    }
  }

  return [...combined.values()];
}

function makeLabel(text: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '700 34px Rajdhani, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), 256, 52);
  ctx.font = '600 18px monospace';
  ctx.shadowBlur = 6;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
  ctx.fillText('STARVIS STARMAP', 256, 76);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(18, 3.4, 1);
  return sprite;
}

function makeGlowTexture(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.22, color);
  gradient.addColorStop(0.48, `${color}88`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeBodyTexture(seed: string, base: string, accent: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(55, 45, 8, 80, 80, 94);
  gradient.addColorStop(0, accent);
  gradient.addColorStop(0.42, base);
  gradient.addColorStop(1, '#020611');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.32;
  for (let i = 0; i < 42; i++) {
    const x = hashFloat(`${seed}:cloud-x:${i}`) * 160;
    const y = hashFloat(`${seed}:cloud-y:${i}`) * 160;
    const w = 24 + hashFloat(`${seed}:cloud-w:${i}`) * 90;
    const h = 5 + hashFloat(`${seed}:cloud-h:${i}`) * 24;
    ctx.fillStyle = i % 3 === 0 ? accent : '#d7fbff';
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, hashFloat(`${seed}:cloud-r:${i}`) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function geometryForNode(node: StarmapNode) {
  const type = normalizeType(node.loc.type);
  if (type === 'station' || type === 'rest_stop') return new THREE.OctahedronGeometry(node.radius * 1.35, 1);
  if (type === 'landing_zone' || type === 'outpost') return new THREE.BoxGeometry(node.radius * 1.5, node.radius * 0.65, node.radius * 1.5);
  if (type === 'comm_array') return new THREE.TetrahedronGeometry(node.radius * 1.4, 0);
  return new THREE.SphereGeometry(node.radius * (type === 'system' ? 0.72 : 1), type === 'system' ? 20 : 18, type === 'system' ? 10 : 9);
}

function colorsForBody(node: StarmapNode) {
  const type = normalizeType(node.loc.type);
  if (type === 'star') return { base: '#ff9f2d', accent: '#fff2b8' };
  if (type === 'moon') return { base: '#64748b', accent: '#dbeafe' };
  if (node.loc.name.toLowerCase().includes('micro')) return { base: '#6ee7d8', accent: '#d9fff8' };
  if (node.loc.name.toLowerCase().includes('crusader')) return { base: '#f7d38b', accent: '#fff7d1' };
  if (node.loc.name.toLowerCase().includes('hurston')) return { base: '#8a5a33', accent: '#f59e0b' };
  if (node.loc.name.toLowerCase().includes('arc')) return { base: '#475569', accent: '#38bdf8' };
  return { base: '#0f766e', accent: '#67e8f9' };
}

function hashFloat(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function descendantsOf(nodes: StarmapNode[], rootId: string) {
  const byParent = new Map<string, StarmapNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    if (!byParent.has(node.parentId)) byParent.set(node.parentId, []);
    byParent.get(node.parentId)!.push(node);
  }
  const result: StarmapNode[] = [];
  const queue = [...(byParent.get(rootId) ?? [])];
  while (queue.length) {
    const node = queue.shift()!;
    result.push(node);
    queue.push(...(byParent.get(node.id) ?? []));
  }
  return result;
}

function rootSystemFor(nodes: StarmapNode[], nodeId: string | null) {
  if (!nodeId) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let current = byId.get(nodeId) ?? null;
  while (current?.parentId) current = byId.get(current.parentId) ?? current;
  return current;
}

function buildStarmap(locs: LocationWithMap[], shops: Shop[]): StarmapNode[] {
  const visible = locs
    .map((loc) => ({ ...loc, type: normalizeType(loc.type) }))
    .filter((loc) => !loc.hide_in_starmap && IMPORTANT_TYPES.has(loc.type));
  const byId = new Map(visible.map((loc) => [loc.uuid, loc]));
  const roots = visible.filter((loc) => loc.type === 'system' || (loc.type === 'star' && !loc.parent_uuid && loc.parent_id == null));
  const rootByCode = new Map(roots.map((loc) => [systemCodeFor(loc), loc]));
  const shopsByLocKey = new Map<string, number>();
  for (const shop of shops) {
    if (!shop.loc_key) continue;
    shopsByLocKey.set(shop.loc_key, (shopsByLocKey.get(shop.loc_key) ?? 0) + 1);
  }

  const rawSystemCoords = roots.map((loc) => getCoordinates(loc)).filter(Boolean) as THREE.Vector3[];
  const box = rawSystemCoords.length > 1 ? new THREE.Box3().setFromPoints(rawSystemCoords) : null;
  const size = box?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
  const center = box?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
  const maxAxis = Math.max(size.x, size.y, size.z, 1);
  const normalizeSystemPos = (loc: LocationWithMap, index: number) => {
    const c = getCoordinates(loc);
    if (c && box) return c.clone().sub(center).multiplyScalar(150 / maxAxis);
    const angle = (index / Math.max(roots.length, 1)) * Math.PI * 2;
    const ring = 42 + (index % 3) * 18;
    return new THREE.Vector3(Math.cos(angle) * ring, (hashFloat(loc.uuid) - 0.5) * 18, Math.sin(angle) * ring);
  };

  const nodes = new Map<string, StarmapNode>();
  roots.forEach((loc, index) => {
    const m = metaFor(loc.type);
    nodes.set(loc.uuid, {
      id: loc.uuid,
      loc,
      parentId: null,
      systemCode: systemCodeFor(loc),
      position: normalizeSystemPos(loc, index),
      radius: m.radius,
      color: m.color,
      glow: m.glow,
      label: loc.name,
      shopCount: loc.loc_key ? shopsByLocKey.get(loc.loc_key) ?? 0 : 0,
    });
  });

  const childrenByParent = new Map<string, LocationWithMap[]>();
  const getParentId = (loc: LocationWithMap) => {
    if (loc.parent_uuid && byId.has(loc.parent_uuid)) return loc.parent_uuid;
    const root = rootByCode.get(systemCodeFor(loc));
    return loc.uuid === root?.uuid ? null : root?.uuid ?? null;
  };
  for (const loc of visible) {
    const parentId = getParentId(loc);
    if (!parentId || loc.type === 'system') continue;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId)!.push(loc);
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => {
      const ao = TYPE_ORDER.indexOf(a.type);
      const bo = TYPE_ORDER.indexOf(b.type);
      return (ao === -1 ? 99 : ao) - (bo === -1 ? 99 : bo) || a.name.localeCompare(b.name);
    });
  }

  const queue = [...nodes.values()];
  while (queue.length) {
    const parent = queue.shift()!;
    const children = childrenByParent.get(parent.id) ?? [];
    children.forEach((loc, index) => {
      const m = metaFor(loc.type);
      const count = children.length;
      const angle = (index / Math.max(count, 1)) * Math.PI * 2 + hashFloat(loc.uuid) * 0.8;
      const tier = loc.type === 'star' ? 0 : loc.type === 'planet' ? 1 : loc.type === 'moon' ? 0.55 : 0.85;
      const baseDistance =
        loc.type === 'star' ? 0 : loc.type === 'planet' ? 9 + index * 2.6 : loc.type === 'moon' ? 3.8 + index * 0.8 : 5.2 + index * 0.45;
      const vertical = (hashFloat(`${loc.uuid}:y`) - 0.5) * (loc.type === 'planet' ? 4 : 2.2);
      const position = parent.position
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * baseDistance * tier, vertical, Math.sin(angle) * baseDistance * tier));
      const node: StarmapNode = {
        id: loc.uuid,
        loc,
        parentId: parent.id,
        systemCode: systemCodeFor(loc),
        position,
        radius: m.radius,
        color: m.color,
        glow: m.glow,
        label: loc.name,
        shopCount: loc.loc_key ? shopsByLocKey.get(loc.loc_key) ?? 0 : 0,
      };
      nodes.set(node.id, node);
      queue.push(node);
    });
  }

  return [...nodes.values()];
}

function StarmapScene({
  nodes,
  mode,
  selectedId,
  highlightedIds,
  onSelect,
}: {
  nodes: StarmapNode[];
  mode: StarmapViewMode;
  selectedId: string | null;
  highlightedIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const selectedRef = useRef(selectedId);
  const highlightedRef = useRef(highlightedIds);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    selectedRef.current = selectedId;
    highlightedRef.current = highlightedIds;
    onSelectRef.current = onSelect;
  }, [selectedId, highlightedIds, onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !nodes.length) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x01040a);
    scene.fog = new THREE.FogExp2(0x01040a, 0.0018);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      return;
    }
    renderer.setPixelRatio(getThreePixelRatio());
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(mode === 'galaxy' ? 42 : 46, container.clientWidth / container.clientHeight, 0.1, 2400);
    camera.position.set(0, mode === 'galaxy' ? 190 : 58, mode === 'galaxy' ? 22 : 92);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.autoRotate = false;
    controls.enablePan = true;
    controls.panSpeed = 0.7;
    controls.minDistance = 12;
    controls.maxDistance = 420;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minPolarAngle = Math.PI * 0.08;
    const visibility = createVisibilityTracker(container);

    scene.add(new THREE.AmbientLight(0x0c2435, 1.4));
    const key = new THREE.DirectionalLight(0x95f4ff, 2.8);
    key.position.set(1, 2, 1);
    scene.add(key);
    const rim = new THREE.PointLight(0x15d7ff, 6, 420);
    rim.position.set(-80, 80, -90);
    scene.add(rim);

    const starGeo = new THREE.BufferGeometry();
    const starCount = Math.min(mode === 'galaxy' ? 2600 : 1400, 900 + nodes.length * 18);
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starPositions.length; i += 3) {
      const r = 280 + hashFloat(`r${i}`) * 520;
      const a = hashFloat(`a${i}`) * Math.PI * 2;
      const y = (hashFloat(`y${i}`) - 0.5) * 460;
      starPositions[i] = Math.cos(a) * r;
      starPositions[i + 1] = y;
      starPositions[i + 2] = Math.sin(a) * r;
      const cool = 0.55 + hashFloat(`c${i}`) * 0.45;
      starColors[i] = 0.45 * cool;
      starColors[i + 1] = 0.8 * cool;
      starColors[i + 2] = cool;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({ size: 0.7, transparent: true, opacity: 0.62, depthWrite: false, vertexColors: true });
    scene.add(new THREE.Points(starGeo, starMat));

    const grid = new THREE.GridHelper(320, mode === 'galaxy' ? 24 : 18, 0x0e7490, 0x083344);
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.14;
    grid.position.y = -18;
    scene.add(grid);

    const objects = new Map<string, THREE.Mesh>();
    const labels: THREE.Sprite[] = [];
    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);

    const parentLinePositions: number[] = [];
    const routeLinePositions: number[] = [];
    const animatedObjects: THREE.Object3D[] = [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const node of nodes) {
      if (!node.parentId) continue;
      const parent = byId.get(node.parentId);
      if (!parent) continue;
      parentLinePositions.push(parent.position.x, parent.position.y, parent.position.z, node.position.x, node.position.y, node.position.z);
      if (node.loc.type === 'planet' || node.loc.type === 'moon') {
        const distance = parent.position.distanceTo(node.position);
        const orbit = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            Array.from({ length: mode === 'galaxy' ? 72 : 96 }, (_, i) => {
              const segmentCount = mode === 'galaxy' ? 72 : 96;
              const angle = (i / segmentCount) * Math.PI * 2;
              return new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance).add(parent.position);
            }),
          ),
          new THREE.LineBasicMaterial({ color: 0x164e63, transparent: true, opacity: node.loc.type === 'planet' ? 0.18 : 0.08 }),
        );
        nodeGroup.add(orbit);
      }
    }
    const roots = nodes.filter((node) => !node.parentId);
    for (const source of roots) {
      const nearest = roots
        .filter((target) => target.id !== source.id)
        .sort((a, b) => source.position.distanceTo(a.position) - source.position.distanceTo(b.position))
        .slice(0, 2);
      for (const target of nearest) {
        if (source.id > target.id) continue;
        routeLinePositions.push(source.position.x, source.position.y, source.position.z, target.position.x, target.position.y, target.position.z);
      }
    }
    const routeLineGeo = new THREE.BufferGeometry();
    routeLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(routeLinePositions, 3));
    nodeGroup.add(new THREE.LineSegments(routeLineGeo, new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.16 })));
    const parentLineGeo = new THREE.BufferGeometry();
    parentLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(parentLinePositions, 3));
    nodeGroup.add(new THREE.LineSegments(parentLineGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.24 })));

    const cyanGlow = makeGlowTexture('#22d3ee');
    const amberGlow = makeGlowTexture('#fbbf24');

    for (const node of nodes) {
      const normalizedType = normalizeType(node.loc.type);
      const geo = geometryForNode(node);
      const bodyColors = colorsForBody(node);
      const map = ['star', 'planet', 'moon'].includes(normalizedType) ? makeBodyTexture(node.id, bodyColors.base, bodyColors.accent) : undefined;
      const mat = new THREE.MeshPhongMaterial({
        color: normalizedType === 'star' ? 0xffd166 : node.color,
        emissive: normalizedType === 'star' ? 0xff7a18 : node.glow,
        map,
        shininess: normalizedType === 'planet' ? 28 : 75,
        transparent: true,
        opacity: node.loc.type === 'outpost' ? 0.72 : 0.92,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(node.position);
      mesh.userData.nodeId = node.id;
      nodeGroup.add(mesh);
      objects.set(node.id, mesh);

      if (normalizedType === 'jump_point') {
        const jumpGroup = new THREE.Group();
        jumpGroup.position.copy(node.position);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.68, blending: THREE.AdditiveBlending });
        const ringA = new THREE.Mesh(new THREE.TorusGeometry(node.radius * 2.8, node.radius * 0.08, 6, 64), ringMat);
        const ringB = new THREE.Mesh(new THREE.TorusGeometry(node.radius * 1.8, node.radius * 0.045, 6, 64), ringMat.clone());
        ringA.rotation.x = Math.PI / 2;
        ringB.rotation.y = Math.PI / 2;
        jumpGroup.add(ringA, ringB);
        nodeGroup.add(jumpGroup);
        animatedObjects.push(jumpGroup);
      }

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: normalizedType === 'star' ? amberGlow : cyanGlow,
          transparent: true,
          opacity: normalizedType === 'system' || normalizedType === 'star' ? 0.42 : 0.18,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.position.copy(node.position);
      const glowScale = node.radius * (normalizedType === 'system' ? 9 : normalizedType === 'star' ? 7 : 4.4);
      glow.scale.set(glowScale, glowScale, 1);
      glow.userData.label = true;
      nodeGroup.add(glow);

      if (normalizedType === 'system' || normalizedType === 'star') {
        const label = makeLabel(node.label, normalizedType === 'star' ? '#fbbf24' : '#22d3ee');
        label.position.copy(node.position).add(new THREE.Vector3(0, node.radius + 4, 0));
        label.userData.label = true;
        labels.push(label);
        nodeGroup.add(label);
      }

      if (normalizedType === 'system' || normalizedType === 'star') {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(node.radius * (normalizedType === 'system' ? 3.8 : 2.6), 0.018, 5, 80),
          new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.16 }),
        );
        ring.position.copy(node.position);
        ring.rotation.x = Math.PI / 2;
        nodeGroup.add(ring);
      }

      if (normalizedType === 'station' || normalizedType === 'rest_stop') {
        const stationRing = new THREE.Mesh(
          new THREE.TorusGeometry(node.radius * 1.9, 0.025, 5, 48),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.42 }),
        );
        stationRing.position.copy(node.position);
        stationRing.rotation.x = Math.PI / 2;
        nodeGroup.add(stationRing);
        animatedObjects.push(stationRing);
      }
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const getHit = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      return raycaster.intersectObjects([...objects.values()], false)[0]?.object.userData.nodeId as string | undefined;
    };
    const onPointerUp = (event: PointerEvent) => {
      const id = getHit(event);
      if (id) onSelectRef.current(id);
    };
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const clock = new THREE.Clock();
    let frame = 0;
    const focus = new THREE.Vector3();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visibility.isVisible()) return;
      const t = clock.getElapsedTime();
      for (const [id, mesh] of objects) {
        const isSelected = selectedRef.current === id;
        const isHighlighted = highlightedRef.current.has(id);
        const mat = mesh.material as THREE.MeshPhongMaterial;
        const scale = isSelected ? 1.45 + Math.sin(t * 5) * 0.08 : isHighlighted ? 1.22 : 1;
        mesh.scale.setScalar(scale);
        mat.opacity = isSelected || isHighlighted ? 1 : 0.72;
        mat.emissiveIntensity = isSelected ? 2.2 : isHighlighted ? 1.35 : 0.8;
      }
      const selected = selectedRef.current ? byId.get(selectedRef.current) : null;
      if (selected) {
        focus.copy(selected.position);
        controls.target.lerp(focus, 0.045);
      }
      for (const label of labels) label.quaternion.copy(camera.quaternion);
      animatedObjects.forEach((object, index) => {
        object.rotation.y += 0.004 + index * 0.0004;
        object.rotation.z += 0.002;
      });
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resize = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(getThreePixelRatio());
      renderer.setSize(w, h);
    });
    resize.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.dispose();
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      disposeObject3D(scene);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      rendererRef.current = null;
    };
  }, [nodes, mode]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

export default function LocationsPage() {
  const { env } = useEnv();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<StarmapViewMode>('galaxy');
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(['system', 'star', 'planet', 'moon', 'landing_zone', 'station', 'rest_stop', 'jump_point']));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: starmapPositions, isLoading: loadingStarmap, error: starmapError } = useQuery({
    queryKey: ['starmap-positions'],
    queryFn: () => api.starmap.positions() as Promise<RsiStarmapPosition[]>,
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
    queryFn: () => api.shops?.list?.({ env, limit: 500 }) ?? Promise.resolve({ data: [], total: 0, page: 1, limit: 0, pages: 0 }),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const fallbackStarmapPositions = starmapPositions?.length ? starmapPositions : FALLBACK_STARMAP_POSITIONS;
  const rawLocs = useMemo(() => combineVerseLocations(fallbackStarmapPositions, gameLocations ?? []), [fallbackStarmapPositions, gameLocations]);
  const nodes = useMemo(() => buildStarmap(rawLocs, shopsData?.data ?? []), [rawLocs, shopsData]);
  const isLoading = (loadingStarmap || loadingLocations) && nodes.length === 0;
  const error = starmapError && nodes.length === 0 ? starmapError : null;
  const rootSystem = useMemo(() => rootSystemFor(nodes, selectedId), [nodes, selectedId]);
  const modeNodes = useMemo(() => {
    if (viewMode === 'galaxy') return nodes.filter((node) => !node.parentId);
    const root = rootSystem ?? nodes.find((node) => !node.parentId) ?? null;
    if (viewMode === 'system' && root) return [root, ...descendantsOf(nodes, root.id)];
    const selected = selectedId ? nodes.find((node) => node.id === selectedId) : null;
    if (viewMode === 'object' && selected) {
      const parent = selected.parentId ? nodes.find((node) => node.id === selected.parentId) : null;
      return [parent, selected, ...descendantsOf(nodes, selected.id)].filter(Boolean) as StarmapNode[];
    }
    return nodes;
  }, [nodes, rootSystem, selectedId, viewMode]);
  const query = search.trim().toLowerCase();
  const filteredNodes = useMemo(
    () =>
      modeNodes.filter((node) => {
        const typeMatch = activeTypes.has(node.loc.type);
        const searchMatch =
          !query ||
          node.loc.name.toLowerCase().includes(query) ||
          (node.loc.class_name ?? '').toLowerCase().includes(query) ||
          node.systemCode.toLowerCase().includes(query);
        return typeMatch && searchMatch;
      }),
    [activeTypes, modeNodes, query],
  );
  const highlightedIds = useMemo(() => new Set(filteredNodes.map((node) => node.id)), [filteredNodes]);
  const selectedNode = useMemo(() => modeNodes.find((node) => node.id === selectedId) ?? filteredNodes[0] ?? modeNodes[0] ?? nodes[0] ?? null, [filteredNodes, modeNodes, nodes, selectedId]);
  const countsByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of nodes) counts.set(node.loc.type, (counts.get(node.loc.type) ?? 0) + 1);
    return counts;
  }, [nodes]);

  useEffect(() => {
    if (!selectedId && filteredNodes[0]) setSelectedId(filteredNodes[0].id);
  }, [filteredNodes, selectedId]);

  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      if (next.size === 0) next.add(type);
      return next;
    });
  };

  if (error) return <ErrorState error={error as Error} />;

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] -m-4 md:-m-6 overflow-hidden bg-[#01040a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_34%_28%,rgba(255,138,61,0.34),transparent_26%),radial-gradient(ellipse_at_48%_58%,rgba(39,245,213,0.14),transparent_33%),radial-gradient(ellipse_at_76%_24%,rgba(255,218,113,0.13),transparent_24%),linear-gradient(90deg,rgba(1,6,12,0.35),rgba(2,10,17,0.08),rgba(1,6,12,0.45))] pointer-events-none z-10 mix-blend-screen" />
      <div className="absolute inset-0 z-10 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0,rgba(1,4,10,0.32)_58%,rgba(1,4,10,0.82)_100%)]" />
      <div className="absolute inset-x-0 top-0 z-20 h-10 border-b border-cyan-500/60 bg-[#061521]/75 shadow-[0_0_24px_rgba(0,190,255,0.24)]" />
      <div className="absolute inset-x-0 bottom-0 z-20 h-28 border-t border-cyan-500/50 bg-[#03101a]/85 shadow-[0_0_28px_rgba(0,190,255,0.24)]" />

      {isLoading ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <Loader2 className="text-cyan-500 animate-spin" size={34} />
        </div>
      ) : (
        <StarmapScene nodes={filteredNodes.length ? filteredNodes : modeNodes.length ? modeNodes : nodes} mode={viewMode} selectedId={selectedNode?.id ?? null} highlightedIds={highlightedIds} onSelect={setSelectedId} />
      )}

      <header className="absolute left-0 right-0 top-0 z-30 pointer-events-none">
        <div className="flex h-10 items-center justify-between px-6 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-500">
          <div className="flex items-center gap-5 pointer-events-auto">
            <button type="button" onClick={() => setViewMode('galaxy')} className={viewMode === 'galaxy' ? 'text-amber-400' : 'text-cyan-500 hover:text-cyan-300'}>Back</button>
            <button type="button" onClick={() => setViewMode('galaxy')} className={viewMode === 'galaxy' ? 'text-cyan-200' : 'text-cyan-500 hover:text-cyan-300'}>GLX</button>
            <button type="button" onClick={() => setViewMode('system')} className={viewMode === 'system' ? 'text-cyan-200' : 'text-cyan-500 hover:text-cyan-300'}>SYS</button>
            <button type="button" onClick={() => setViewMode('object')} className={viewMode === 'object' ? 'text-cyan-200' : 'text-cyan-500 hover:text-cyan-300'}>OBJ</button>
          </div>
          <div className="flex items-center gap-4 pointer-events-auto">
            <Volume2 size={14} />
            <Crosshair size={14} />
          </div>
        </div>
      </header>

      <section className="absolute left-4 right-4 top-14 z-30 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <div className="flex items-center gap-2 text-cyan-300">
            <Sparkles size={18} />
            <h1 className="font-orbitron text-lg md:text-2xl font-bold tracking-widest uppercase">Starvis Starmap</h1>
            <span className="sr-only">Unified RSI and P4K location map</span>
          </div>
          <p className="font-mono-sc text-[10px] text-slate-500 uppercase tracking-widest mt-1">
            {viewMode.toUpperCase()} · RSI starmap + P4K locations · {filteredNodes.length.toLocaleString('en-US')} visible · {nodes.length.toLocaleString('en-US')} mapped
          </p>
        </div>

        <div className="pointer-events-auto flex flex-col gap-2 w-full lg:w-[520px]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search system, planet, station..."
              className="sci-input w-full pl-9 pr-9 bg-slate-950/80 backdrop-blur-md"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {TYPE_ORDER.filter((type) => countsByType.has(type)).map((type) => {
              const meta = metaFor(type);
              const active = activeTypes.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`shrink-0 flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[10px] font-orbitron uppercase tracking-wider transition-colors ${
                    active ? 'border-cyan-700 bg-cyan-950/60 text-cyan-300' : 'border-slate-800 bg-slate-950/60 text-slate-600 hover:text-slate-300'
                  }`}
                >
                  {meta.icon}
                  {meta.label}
                  <span className="font-mono-sc text-slate-600">{countsByType.get(type)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {!isLoading && search.trim() && filteredNodes.length > 0 && (
        <div className="absolute left-4 top-[9.25rem] z-20 w-[min(340px,calc(100vw-2rem))] pointer-events-auto">
          <div className="max-h-[38vh] overflow-y-auto rounded-sm border border-cyan-900/35 bg-black/55 backdrop-blur-xl p-2 shadow-[0_0_40px_rgba(8,145,178,0.12)]">
            {filteredNodes.filter((node) => node.id !== selectedNode?.id).slice(0, 10).map((node) => {
              const selected = selectedNode?.id === node.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  className={`w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors ${
                    selected ? 'bg-cyan-950/60 text-cyan-300' : 'text-slate-400 hover:bg-slate-900/80 hover:text-slate-200'
                  }`}
                >
                  <span className="shrink-0 text-cyan-500">{metaFor(node.loc.type).icon}</span>
                  <span className="min-w-0 flex-1 truncate font-rajdhani text-sm font-semibold">{node.loc.name}</span>
                  <span className="shrink-0 font-mono-sc text-[9px] text-slate-600">{node.systemCode}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedNode && (
          <motion.div
            key={selectedNode.id}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            className="absolute left-1/2 top-1/2 z-30 hidden h-[330px] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 pointer-events-auto lg:block"
          >
            <div className="absolute inset-0 rounded-full border border-cyan-900/25 bg-cyan-950/10 backdrop-blur-[2px]" />
            <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-500/30 bg-black/35 shadow-[0_0_70px_rgba(0,216,255,0.18)]" />
            <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300/70 bg-[radial-gradient(circle,rgba(255,170,61,0.34),rgba(88,18,9,0.55)_68%,transparent_70%)] shadow-[0_0_40px_rgba(255,176,67,0.28)]" />
            <div className="absolute left-1/2 top-[2.2rem] -translate-x-1/2 text-center">
              <p className="font-orbitron text-lg font-bold uppercase tracking-widest text-amber-200">{selectedNode.loc.name}</p>
              <p className="font-mono-sc text-[10px] uppercase tracking-widest text-cyan-600">{selectedNode.systemCode}</p>
            </div>

            <div className="absolute left-12 top-24 w-56 border-y border-cyan-900/60 bg-[#031421]/70 px-4 py-4 text-right">
              <p className="font-mono-sc text-[10px] uppercase tracking-widest text-cyan-500">{metaFor(selectedNode.loc.type).label}</p>
              <div className="mt-3 space-y-1.5 font-mono-sc text-[10px] uppercase tracking-widest">
                <HudInfo label="Type" value={metaFor(selectedNode.loc.type).label} />
                {selectedNode.loc.rsi_starmap?.faction_name && <HudInfo label="Affiliation" value={selectedNode.loc.rsi_starmap.faction_name} />}
                {selectedNode.loc.aggregated?.population != null && <HudInfo label="Population" value={`${selectedNode.loc.aggregated.population}`} />}
                {selectedNode.loc.aggregated?.danger != null && <HudInfo label="Danger" value={`${selectedNode.loc.aggregated.danger}`} />}
                {selectedNode.shopCount > 0 && <HudInfo label="Shops" value={`${selectedNode.shopCount}`} />}
              </div>
            </div>

            <div className="absolute right-12 top-24 w-60 border-y border-cyan-900/60 bg-[#031421]/70 py-3">
              {['Inspect', 'Information', 'Routing', 'Bookmark'].map((action, index) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => {
                    if (index === 0) setViewMode('object');
                    if (index === 1) setViewMode('system');
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2 font-orbitron text-[11px] uppercase tracking-widest transition-colors ${
                    index === 0 ? 'bg-cyan-950/80 text-cyan-300' : 'text-cyan-700 hover:text-cyan-300'
                  }`}
                >
                  {action}
                  {index === 0 && <span className="text-amber-400">›</span>}
                </button>
              ))}
            </div>

            <div className="absolute bottom-8 left-1/2 grid w-80 -translate-x-1/2 grid-cols-3 gap-2">
              <Metric label="X" value={selectedNode.position.x.toFixed(1)} />
              <Metric label="Y" value={selectedNode.position.y.toFixed(1)} />
              <Metric label="Z" value={selectedNode.position.z.toFixed(1)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedNode && (
          <motion.aside
            key={`${selectedNode.id}-mobile`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="absolute inset-x-3 bottom-32 z-30 pointer-events-auto lg:hidden"
          >
            <div className="sci-panel bg-black/70 backdrop-blur-xl border-cyan-900/50 p-4 shadow-[0_0_60px_rgba(8,145,178,0.16)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono-sc text-[10px] uppercase tracking-widest text-cyan-500">{selectedNode.systemCode}</p>
                  <h2 className="font-orbitron text-lg text-white font-bold tracking-wider">{selectedNode.loc.name}</h2>
                </div>
                <GlowBadge color="cyan">{metaFor(selectedNode.loc.type).label}</GlowBadge>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="absolute inset-x-0 bottom-0 z-30 pointer-events-none h-28">
        <div className="absolute bottom-5 left-8 flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center border border-cyan-500/70 bg-cyan-950/25 shadow-[0_0_28px_rgba(0,216,255,0.22)]">
            <Sparkles size={28} className="text-cyan-300" />
          </div>
          <div>
            <p className="font-orbitron text-2xl font-bold tracking-[0.55em] text-cyan-200">SV</p>
            <p className="font-mono-sc text-[10px] uppercase tracking-[0.35em] text-cyan-500">Starmap</p>
          </div>
        </div>

        <div className="absolute bottom-3 left-1/2 hidden -translate-x-1/2 gap-4 md:flex">
          <HudGroup label="Factions">
            {['○', '▽', '◇', '△', '◎', '✹'].map((mark) => (
              <span key={mark} className="text-cyan-400">{mark}</span>
            ))}
          </HudGroup>
          <HudGroup label="Jump Tunnels">
            <span className="text-cyan-700">•</span>
            <span className="text-cyan-500">⊙</span>
            <span className="text-cyan-300">◉</span>
          </HudGroup>
          <HudGroup label="Sensors">
            <span className="text-cyan-500">♙</span>
            <span className="text-cyan-500">⌖</span>
            <span className="text-cyan-500">☠</span>
          </HudGroup>
        </div>

        <div className="absolute bottom-4 right-8 flex items-end gap-3 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-600">
          <button type="button" className="pointer-events-auto border-t-2 border-cyan-400 px-4 py-2 text-cyan-300">3D</button>
          <button type="button" className="pointer-events-auto border-t border-cyan-900 px-4 py-2">2D</button>
        </div>

        <div className="absolute bottom-2 left-8 font-mono-sc text-[9px] uppercase tracking-widest text-cyan-800">
          Drag to navigate · Scroll to zoom · Click object to inspect
        </div>
      </div>
    </div>
  );
}

function HudGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-40 border-t border-cyan-700/50 bg-cyan-950/20 px-6 py-2 text-center">
      <div className="flex justify-center gap-5 font-mono-sc text-sm">{children}</div>
      <p className="mt-1 font-mono-sc text-[9px] uppercase tracking-widest text-cyan-700">{label}</p>
    </div>
  );
}

function HudInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-end gap-3">
      <span className="text-cyan-700">{label}</span>
      <span className="text-cyan-300">{value}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-slate-800/70 bg-slate-900/50 px-2 py-2">
      <p className="font-mono-sc text-[9px] text-slate-600 uppercase">{label}</p>
      <p className="font-orbitron text-sm text-cyan-300 truncate">{value}</p>
    </div>
  );
}


