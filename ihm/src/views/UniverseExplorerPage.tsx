'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Aperture,
  Building2,
  ChevronLeft,
  CircleDot,
  Database,
  Focus,
  Globe2,
  Layers3,
  Loader2,
  MapPin,
  Maximize2,
  Orbit,
  Route,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { api } from '@/services/api';
import { DetailRow, HudMetric, InfoTile, StatBar } from './universe-explorer-panels';

type Coordinates = { x?: number | string | null; y?: number | string | null; z?: number | string | null };

type ArkAssets = {
  textures?: string[];
  models?: string[];
  skybox?: string[];
  raw?: string[];
};

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
  thumbnail_data?: {
    url?: string | null;
    images?: Record<string, string | null | undefined> | null;
  } | null;
  assets?: ArkAssets | null;
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
    coordinates?: Coordinates | null;
    p4k_path?: string | null;
    is_scannable?: boolean | null;
  } | null;
};

type StarmapNode = {
  id: string;
  dbId: number;
  rsiId: string | null;
  name: string;
  type: string;
  systemCode: string;
  systemName: string;
  parentId: string | null;
  status: string | null;
  faction: string | null;
  description: string | null;
  coordinates: THREE.Vector3 | null;
  scenePosition: THREE.Vector3;
  assets: Required<ArkAssets>;
  thumbnail: string | null;
  starType: string | null;
  population: number | null;
  economy: number | null;
  danger: number | null;
  habitableInner: number | null;
  habitableOuter: number | null;
  jumpPoints: JumpPointLink[];
  aggregated: RsiStarmapPosition['aggregated'];
  p4kName: string | null;
  p4kPath: string | null;
  isScannable: boolean;
};

type SystemSummary = {
  root: StarmapNode;
  objects: number;
  planets: number;
  moons: number;
  stations: number;
  textured: number;
};

type ViewMode = 'galaxy' | 'system';

const DEFAULT_SYSTEM = 'STANTON';
const RENDERABLE_TYPES = new Set(['system', 'star', 'planet', 'moon', 'station', 'asteroid_field', 'jump_point', 'blackhole', 'poi']);
const TYPE_ORDER = ['system', 'star', 'planet', 'moon', 'station', 'jump_point', 'asteroid_field', 'blackhole', 'poi'];

const TYPE_STYLE: Record<string, { label: string; color: number; radius: number; icon: ReactNode; glow: string }> = {
  system: { label: 'System',   color: 0x39e7ff, radius: 2.0,  icon: <Sparkles size={12} />, glow: 'text-cyan-300' },
  star:   { label: 'Star',     color: 0xffc45a, radius: 2.8,  icon: <Star size={12} />,     glow: 'text-amber-300' },
  planet: { label: 'Planet',   color: 0x38bdf8, radius: 1.55, icon: <Globe2 size={12} />,   glow: 'text-sky-300' },
  moon:   { label: 'Moon',     color: 0x94a3b8, radius: 0.52, icon: <CircleDot size={12} />,glow: 'text-slate-300' },
  station:{ label: 'Station',  color: 0xa78bfa, radius: 0.38, icon: <Building2 size={12} />,glow: 'text-violet-300' },
  asteroid_field: { label: 'Asteroids', color: 0x64748b, radius: 0.45, icon: <Aperture size={12} />, glow: 'text-slate-300' },
  jump_point: { label: 'Jump', color: 0x22d3ee, radius: 0.52, icon: <Route size={12} />,   glow: 'text-cyan-400' },
  blackhole:  { label: 'Blackhole', color: 0xf472b6, radius: 1.4, icon: <Orbit size={12} />, glow: 'text-pink-300' },
  poi: { label: 'POI',         color: 0x22d3ee, radius: 0.32, icon: <MapPin size={12} />,  glow: 'text-cyan-300' },
};

const FALLBACK_POSITIONS: RsiStarmapPosition[] = [
  { id: 1, rsi_id: '314', name: 'Stanton', type: 'system', system_code: 'STANTON', system_name: 'Stanton', coordinates: { x: 0, y: 0, z: 0 } },
  {
    id: 2,
    rsi_id: '1691',
    name: 'Stanton',
    type: 'star',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: '314',
    assets: { textures: ['https://cdn.robertsspaceindustries.com/static/starmap/suns/02_Texture.jpg'] },
  },
  {
    id: 3,
    rsi_id: '1692',
    name: 'microTech',
    type: 'planet',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: '1691',
    assets: { textures: ['https://robertsspaceindustries.com/media/l0arnhgmoajuyr/source/Planet_Stanton4.jpg'] },
  },
  {
    id: 4,
    rsi_id: '1693',
    name: 'Hurston',
    type: 'planet',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: '1691',
    assets: { textures: ['https://robertsspaceindustries.com/media/frurip2hsngx8r/source/Planet_Stanton3.jpg'] },
  },
  {
    id: 5,
    rsi_id: '1694',
    name: 'ArcCorp',
    type: 'planet',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: '1691',
    assets: { textures: ['https://robertsspaceindustries.com/media/2wkohq7v67kcor/source/Planet_Stanton.jpg'] },
  },
  {
    id: 6,
    rsi_id: '1695',
    name: 'Crusader',
    type: 'planet',
    system_code: 'STANTON',
    system_name: 'Stanton',
    parent_id: '1691',
    assets: { textures: ['https://robertsspaceindustries.com/media/cd3676xek3zbwr/source/Crusader-Texture.png'] },
  },
];

function normalizeType(type: string | null | undefined) {
  return String(type ?? 'poi')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase()
    .replace(/^single_star$/, 'system')
    .replace(/^satellite$/, 'moon')
    .replace(/^asteroid_belt$/, 'asteroid_field')
    .replace(/^jumppoint$/, 'jump_point')
    .replace(/^manmade$/, 'station');
}

function styleFor(type: string) {
  return TYPE_STYLE[normalizeType(type)] ?? TYPE_STYLE.poi;
}

function typeRank(type: string) {
  const rank = TYPE_ORDER.indexOf(normalizeType(type));
  return rank === -1 ? TYPE_ORDER.length : rank;
}

function toNumber(value: unknown) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceImage(url?: string | null) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `https://robertsspaceindustries.com${url.startsWith('/') ? '' : '/'}${url}`;
}

function mediaThumbnail(pos: RsiStarmapPosition) {
  return sourceImage(
    pos.thumbnail_data?.images?.product_thumb_large ??
      pos.thumbnail_data?.images?.post ??
      pos.thumbnail_data?.images?.source ??
      pos.thumbnail_data?.url ??
      pos.thumbnail ??
      null,
  );
}

function usableTexture(url: string | null | undefined) {
  return Boolean(url && /\.(png|jpg|jpeg|webp)(\?|$)/i.test(url) && !/chevrons|ui|icon|sprite|button|logo|font/i.test(url));
}

function assetTexture(assets: Required<ArkAssets>, thumbnail: string | null) {
  return (
    [...assets.textures, ...assets.skybox].map(sourceImage).find((url) => usableTexture(url)) ??
    (usableTexture(thumbnail) ? thumbnail : null)
  );
}

function webglTextureUrl(url: string | null) {
  if (!url) return null;
  if (!/robertsspaceindustries\.com/i.test(url)) return url;
  return `/api/rsi-assets?url=${encodeURIComponent(url)}`;
}

function coords(value?: Coordinates | null) {
  if (!value) return null;
  const x = toNumber(value.x);
  const y = toNumber(value.y);
  const z = toNumber(value.z);
  if (x == null) return null;
  return new THREE.Vector3(x, y ?? 0, z ?? 0);
}

function hash01(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return (hash >>> 0) / 4294967295;
}

function orbitPosition(node: Pick<StarmapNode, 'id' | 'type' | 'dbId'>, siblingIndex: number, siblingCount: number) {
  const type = normalizeType(node.type);
  const baseRadius =
    type === 'planet'
      ? 9 + siblingIndex * 5.5
      : type === 'moon'
        ? 2.2 + siblingIndex * 0.9
        : type === 'station'
          ? 2.8 + siblingIndex * 0.6
          : type === 'jump_point'
            ? 38
            : 14 + siblingIndex * 2.2;
  const angle = siblingCount > 0 ? (Math.PI * 2 * siblingIndex) / siblingCount + hash01(node.id) * 0.45 : hash01(node.id) * Math.PI * 2;
  const y = type === 'jump_point' ? (hash01(`${node.id}:y`) - 0.5) * 6 : type === 'planet' ? (hash01(`${node.id}:inclination`) - 0.5) * 0.18 : (hash01(`${node.id}:inclination`) - 0.5) * 0.35;
  return new THREE.Vector3(Math.cos(angle) * baseRadius, y, Math.sin(angle) * baseRadius);
}

function buildNodes(positions: RsiStarmapPosition[]) {
  const rawNodes = positions
    .map((pos) => {
      const type = normalizeType(pos.type);
      if (!RENDERABLE_TYPES.has(type)) return null;
      const rsiId = pos.rsi_id ? String(pos.rsi_id) : null;
      const id = `starmap-${rsiId ?? pos.id}`;
      const parentId = pos.parent_id != null ? `starmap-${String(pos.parent_id)}` : null;
      const systemCode = String(pos.system_code ?? pos.p4k_location?.system_code ?? pos.name ?? DEFAULT_SYSTEM).toUpperCase();
      const assets: Required<ArkAssets> = {
        textures: pos.assets?.textures ?? [],
        models: pos.assets?.models ?? [],
        skybox: pos.assets?.skybox ?? [],
        raw: pos.assets?.raw ?? [],
      };
      return {
        id,
        dbId: pos.id,
        rsiId,
        name: pos.name || pos.system_name || systemCode,
        type,
        systemCode,
        systemName: pos.system_name ?? pos.name ?? systemCode,
        parentId,
        status: pos.status ?? null,
        faction: pos.faction_name ?? null,
        description: pos.description ?? null,
        coordinates: coords(pos.coordinates ?? pos.p4k_location?.coordinates),
        scenePosition: new THREE.Vector3(),
        assets,
        thumbnail: mediaThumbnail(pos),
        starType: pos.star_type ?? null,
        population: toNumber(pos.population ?? pos.aggregated?.population),
        economy: toNumber(pos.economy ?? pos.aggregated?.economy),
        danger: toNumber(pos.danger ?? pos.aggregated?.danger),
        habitableInner: toNumber(pos.habitable_zone_inner),
        habitableOuter: toNumber(pos.habitable_zone_outer),
        jumpPoints: Array.isArray(pos.jump_points) ? pos.jump_points : [],
        aggregated: pos.aggregated ?? null,
        p4kName: pos.p4k_location?.name ?? null,
        p4kPath: pos.p4k_location?.p4k_path ?? null,
        isScannable: Boolean(pos.p4k_location?.is_scannable),
      } satisfies StarmapNode;
    })
    .filter(Boolean) as StarmapNode[];

  const byId = new Map(rawNodes.map((node) => [node.id, node]));
  const systems = rawNodes.filter((node) => node.type === 'system');
  const systemByCode = new Map(systems.map((node) => [node.systemCode, node]));

  const children = new Map<string, StarmapNode[]>();
  for (const node of rawNodes) {
    if (!node.parentId || !byId.has(node.parentId)) {
      // For moons/stations without valid parent: look for a planet in the same system before falling back to system
      const system = systemByCode.get(node.systemCode);
      if (node.type === 'moon' || node.type === 'station') {
        const planets = rawNodes.filter((n) => n.type === 'planet' && n.systemCode === node.systemCode);
        const closestPlanet = planets[0];
        if (closestPlanet) {
          node.parentId = closestPlanet.id;
        } else if (system && system.id !== node.id) {
          node.parentId = system.id;
        }
      } else if (system && system.id !== node.id && node.type !== 'system') {
        node.parentId = system.id;
      }
    }
    if (node.parentId) {
      const list = children.get(node.parentId) ?? [];
      list.push(node);
      children.set(node.parentId, list);
    }
  }

  const galaxyNodes = systems.length ? systems : rawNodes.filter((node) => !node.parentId);
  const coordinateNodes = galaxyNodes.filter((node) => node.coordinates);
  const maxDistance = Math.max(1, ...coordinateNodes.map((node) => node.coordinates?.length() ?? 1));
  for (const [index, node] of galaxyNodes.entries()) {
    if (node.coordinates) {
      node.scenePosition = node.coordinates.clone().multiplyScalar(85 / maxDistance);
    } else {
      node.scenePosition = orbitPosition(node, index, galaxyNodes.length).multiplyScalar(4);
    }
  }

  for (const parent of rawNodes) {
    const childNodes = (children.get(parent.id) ?? []).sort(
      (a, b) =>
        typeRank(a.type) - typeRank(b.type) ||
        (a.rsiId && b.rsiId ? parseInt(a.rsiId) - parseInt(b.rsiId) : a.name.localeCompare(b.name)),
    );
    for (const [index, child] of childNodes.entries()) {
      if (child.type === 'star') child.scenePosition = new THREE.Vector3(0, 0, 0);
      else child.scenePosition = orbitPosition(child, index, childNodes.length);
    }
  }

  const summaries = galaxyNodes
    .map((root) => {
      const descendants = collectDescendants(root, children);
      return {
        root,
        objects: descendants.length,
        planets: descendants.filter((node) => node.type === 'planet').length,
        moons: descendants.filter((node) => node.type === 'moon').length,
        stations: descendants.filter((node) => node.type === 'station').length,
        textured: descendants.filter((node) => node.assets.textures.length + node.assets.skybox.length > 0).length,
      } satisfies SystemSummary;
    })
    .sort((a, b) => b.textured - a.textured || a.root.name.localeCompare(b.root.name));

  return { allNodes: rawNodes, byId, children, systems: galaxyNodes, summaries };
}

function collectDescendants(root: StarmapNode, children: Map<string, StarmapNode[]>) {
  const output: StarmapNode[] = [];
  const stack = [...(children.get(root.id) ?? [])];
  while (stack.length) {
    const node = stack.shift();
    if (!node) continue;
    output.push(node);
    stack.push(...(children.get(node.id) ?? []));
  }
  return output;
}

function nodeSearchText(node: StarmapNode) {
  return [node.name, node.systemCode, node.systemName, node.type, node.faction, node.p4kName].filter(Boolean).join(' ').toLowerCase();
}

function findBestSearchMatch(nodes: StarmapNode[], query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return null;
  const matches = nodes.filter((node) => nodeSearchText(node).includes(q));
  return (
    matches.find((node) => node.name.toLowerCase() === q || node.systemCode.toLowerCase() === q) ??
    matches.find((node) => node.type === 'system') ??
    matches[0] ??
    null
  );
}

function formatNumber(value: number | null) {
  return value == null ? 'N/A' : value.toFixed(1);
}

function assetCount(node: StarmapNode) {
  return node.assets.textures.length + node.assets.models.length + node.assets.skybox.length;
}

function publicAssetLabel(node: StarmapNode) {
  const total = assetCount(node);
  if (!total) return 'No public asset';
  return `${total} public URL${total > 1 ? 's' : ''}`;
}

function objectColor(node: StarmapNode) {
  if (node.type === 'star') {
    const t = (node.starType ?? '').toLowerCase();
    if (t.includes('b') || t.includes('o')) return 0x9bd4ff; // étoile bleue
    if (t.includes('k') || t.includes('m')) return 0xff8844; // étoile orange/rouge
    return 0xffc45a; // G (soleil type) — ambré chaud comme ARK map
  }
  if (node.type === 'system') {
    const faction = (node.faction ?? '').toLowerCase();
    if (faction.includes('uee')) return 0x22d3ee;
    if (faction.includes("xi'an") || faction.includes('xian')) return 0xa78bfa;
    if (faction.includes('banu')) return 0x34d399;
    if (faction.includes('vanduul')) return 0xf87171;
    return styleFor(node.type).color;
  }
  return styleFor(node.type).color;
}

function systemSceneNodes(root: StarmapNode, children: Map<string, StarmapNode[]>, selectedId: string | null) {
  const descendants = collectDescendants(root, children);
  const selected = descendants.find((node) => node.id === selectedId) ?? (root.id === selectedId ? root : null);
  const selectedParentId = selected?.parentId ?? null;
  const selectedChildren = new Set((selected ? (children.get(selected.id) ?? []) : []).map((node) => node.id));
  const selectedSiblings = new Set(
    selectedParentId
      ? (children.get(selectedParentId) ?? []).filter((node) => node.type === selected?.type).map((node) => node.id)
      : [],
  );

  return descendants.filter((node) => {
    if (node.type === 'star' || node.type === 'planet' || node.type === 'jump_point') return true;
    if (node.id === selectedId || node.id === selectedParentId || selectedChildren.has(node.id) || selectedSiblings.has(node.id)) return true;
    return node.type === 'station' && assetCount(node) > 0;
  });
}

function shouldDrawOrbit(node: StarmapNode) {
  return node.type === 'planet' || node.type === 'moon';
}

function shouldDrawLabel(node: StarmapNode, mode: ViewMode, selectedId: string | null) {
  if (node.id === selectedId) return true;
  if (mode === 'galaxy') return node.type === 'system';
  return node.type === 'star' || node.type === 'planet';
}

// ── ARK Starmap 3D model loader ───────────────────────────────────────────────

const RSI_MODEL_BASE = 'https://cdn.robertsspaceindustries.com/static/starmap/models';
const RSI_SRC_BASE = 'https://cdn.robertsspaceindustries.com/static/starmap/sourceimages';

// Module-scope cache: filename → cloneable group (loaded once across re-renders)
const arkModelCache = new Map<string, THREE.Group>();

function rsiProxy(url: string) {
  return `/api/rsi-assets?url=${encodeURIComponent(url)}`;
}

function makeColladaLoader() {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    // Rewrite relative texture paths from inside DAE files
    if (!url.startsWith('http') || url.includes('sourceimages/')) {
      const filename = url.split('/').pop() ?? '';
      return rsiProxy(`${RSI_SRC_BASE}/${filename}`);
    }
    if (url.includes('robertsspaceindustries.com')) return rsiProxy(url);
    return url;
  });
  return new ColladaLoader(manager);
}

function normalizeModelScale(group: THREE.Group, targetSize: number): void {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) group.scale.setScalar(targetSize / maxDim);
  // Center on origin
  const center = new THREE.Vector3();
  box.getCenter(center);
  group.position.sub(center.multiplyScalar(group.scale.x));
}

function loadArkModel(filename: string, targetSize: number): Promise<THREE.Group> {
  if (arkModelCache.has(filename)) {
    return Promise.resolve(arkModelCache.get(filename)!.clone());
  }
  return new Promise((resolve, reject) => {
    const loader = makeColladaLoader();
    loader.load(
      rsiProxy(`${RSI_MODEL_BASE}/${filename}`),
      (collada) => {
        if (!collada) { reject(new Error('Collada load returned null')); return; }
        // Wrap Scene in a Group so we can reuse clone/scale/position API
        const wrapper = new THREE.Group();
        wrapper.add(collada.scene);
        normalizeModelScale(wrapper, targetSize);
        arkModelCache.set(filename, wrapper);
        resolve(wrapper.clone());
      },
      undefined,
      reject,
    );
  });
}

function applyHolographicMaterial(group: THREE.Group, color: number, emissiveIntensity = 0.45): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(color),
        emissiveIntensity,
        metalness: 0.55,
        roughness: 0.35,
        transparent: true,
        opacity: 0.88,
      });
    }
  });
}

// Single-model types; jump_point uses its own multi-component assembly below
function arkSingleModelFile(type: string): string | null {
  switch (type) {
    case 'station':        return 'SpaceStation.dae';
    case 'asteroid_field': return 'AsteroidsFRONT.dae';
    case 'blackhole':      return 'Blackhole.dae';
    default:               return null;
  }
}

// Loads all 4 jump-point DAEs as one group.
// Each child is tagged userData.animRole: 'head' | 'tail' | 'tube' | 'dust'
// JumpHead (58 KB) and JumpTail (125 KB) arrive first; the heavier
// JumpGoTrhu (3.9 MB) and DustGoTrhu (2.6 MB) fill in once ready.
function loadJumpPointAssembly(targetSize: number): Promise<THREE.Group> {
  const CACHE_KEY = '__jump_assembly__';
  if (arkModelCache.has(CACHE_KEY)) {
    const cached = arkModelCache.get(CACHE_KEY)!.clone();
    normalizeModelScale(cached, targetSize);
    return Promise.resolve(cached);
  }

  const parts: { file: string; role: string }[] = [
    { file: 'JumpHead.dae',   role: 'head' },
    { file: 'JumpTail.dae',   role: 'tail' },
    { file: 'JumpGoTrhu.dae', role: 'tube' },
    { file: 'DustGoTrhu.dae', role: 'dust' },
  ];

  return Promise.allSettled(
    parts.map(({ file }) =>
      new Promise<THREE.Group>((resolve, reject) => {
        makeColladaLoader().load(
          rsiProxy(`${RSI_MODEL_BASE}/${file}`),
          (collada) => {
            if (!collada) { reject(new Error('null')); return; }
            const g = new THREE.Group();
            g.add(collada.scene);
            resolve(g);
          },
          undefined,
          reject,
        );
      }),
    ),
  ).then((results) => {
    const assembly = new THREE.Group();
    assembly.userData.isJumpAssembly = true;
    for (let i = 0; i < parts.length; i++) {
      if (results[i].status === 'fulfilled') {
        const part = (results[i] as PromiseFulfilledResult<THREE.Group>).value;
        // Propagate role to every descendant so mesh-level traversal can read it
        part.traverse((child) => { child.userData.animRole = parts[i].role; });
        assembly.add(part);
      }
    }
    // Cache the raw un-normalized assembly; future jump points clone & rescale it
    arkModelCache.set(CACHE_KEY, assembly.clone());
    normalizeModelScale(assembly, targetSize);
    return assembly;
  });
}

type SceneProps = {
  nodes: StarmapNode[];
  children: Map<string, StarmapNode[]>;
  mode: ViewMode;
  root: StarmapNode | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function Scene({ nodes, children, mode, root, selectedId, onSelect }: SceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const bgColor = mode === 'galaxy' ? 0x04060e : 0x060408;
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.FogExp2(bgColor, mode === 'galaxy' ? 0.005 : 0.006);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
    if (mode === 'galaxy') {
      camera.position.set(0, 90, 155);
    } else {
      // Reproduit le point de vue ARK map : camera=46.84,156.82
      // phi=156.82° depuis le pôle Y → caméra SOUS le plan écliptique
      const r = 78;
      const phi = (156.82 * Math.PI) / 180;
      const theta = (46.84 * Math.PI) / 180;
      camera.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    }

    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
      const fallback = document.createElement('div');
      fallback.className = 'absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.16),transparent_34%)]';
      fallback.setAttribute('data-testid', 'starmap-webgl-fallback');
      host.appendChild(fallback);
      return () => {
        host.removeChild(fallback);
      };
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = mode === 'galaxy' ? 28 : 14;
    controls.maxDistance = mode === 'galaxy' ? 360 : 130;
    // Autoriser la vue depuis sous le plan écliptique (comme ARK map)
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI * 0.97;

    const ambient = new THREE.AmbientLight(0xb8eaff, 1.4);
    const key = new THREE.PointLight(0xffffff, 6.0, 400);
    key.position.set(16, 20, 12);
    const fill = new THREE.PointLight(0x3ecfff, 2.2, 350);
    fill.position.set(-20, -8, -18);
    scene.add(ambient, key, fill);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous';
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const nodeByObject = new Map<THREE.Object3D, StarmapNode>();
    const objectByNode = new Map<string, THREE.Object3D>();
    const disposables: THREE.Object3D[] = [];

    const starfield = createStarfield(mode === 'galaxy' ? 3200 : 1400, mode === 'galaxy' ? 280 : 105);
    scene.add(starfield);
    disposables.push(starfield);

    if (mode === 'galaxy') {
      // warm nebula clouds à la ARK map
      const nebula1 = createNebula(1200, 110, 0x7a2800, 0.055); // orange profond
      const nebula2 = createNebula(700,  75, 0xc84010, 0.038); // orange vif
      const nebula3 = createNebula(500,  55, 0x1a5c18, 0.045); // vert émeraude
      const nebula4 = createNebula(400,  40, 0x4a1800, 0.065); // brun sombre
      nebula2.rotation.y = Math.PI * 0.4;
      nebula3.rotation.y = Math.PI * 1.1;
      nebula4.rotation.y = Math.PI * 1.7;
      const grid = createGalaxyGrid(130);
      scene.add(nebula1, nebula2, nebula3, nebula4, grid);
      disposables.push(nebula1, nebula2, nebula3, nebula4, grid);
    } else {
      // vue système : légère teinte ambrée
      const nebula = createNebula(400, 55, 0x7a3000, 0.04);
      scene.add(nebula);
      disposables.push(nebula);
    }

    const visible = mode === 'galaxy' || !root ? nodes.filter((node) => node.type === 'system') : systemSceneNodes(root, children, selectedId);
    const sceneRootPosition = mode === 'system' && root ? root.scenePosition.clone() : new THREE.Vector3();

    // Async model loading — track separately for cleanup
    let sceneDisposed = false;
    const asyncDisposables: THREE.Object3D[] = [];

    for (const node of visible) {
      const localPosition = mode === 'system' ? node.scenePosition.clone() : node.scenePosition.clone();
      if (mode === 'system' && node.id === root?.id) localPosition.set(0, 0, 0);
      const style = styleFor(node.type);
      const radius = node.id === selectedId ? style.radius * 1.18 : style.radius;
      const material = new THREE.MeshStandardMaterial({
        color: objectColor(node),
        roughness: node.type === 'star' ? 0.38 : 0.9,
        metalness: node.type === 'station' ? 0.35 : 0.05,
        emissive: new THREE.Color(objectColor(node)),
        emissiveIntensity: node.type === 'star' || node.type === 'system' ? 0.75 : 0.45,
      });
      const geometry =
        node.type === 'station'
          ? new THREE.OctahedronGeometry(radius, 1)
          : node.type === 'jump_point'
            ? new THREE.OctahedronGeometry(radius * 1.2, 0) // diamant ARK map
            : node.type === 'asteroid_field'
              ? new THREE.IcosahedronGeometry(radius, 1)
              : new THREE.SphereGeometry(radius, 42, 28);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(localPosition);
      mesh.userData.nodeId = node.id;
      scene.add(mesh);
      nodeByObject.set(mesh, node);
      objectByNode.set(node.id, mesh);
      disposables.push(mesh);

      // Load ARK Starmap 3D model async (system view only, not worth it for galaxy dots)
      if (mode === 'system') {
        if (node.type === 'jump_point') {
          // All 4 components assembled; lighter files (Head, Tail) arrive first via Promise.allSettled
          loadJumpPointAssembly(radius * 1.8)
            .then((group) => {
              if (sceneDisposed) { disposeObject(group); return; }
              group.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  const role = child.userData.animRole as string;
                  const isHead = role === 'head';
                  const isTube = role === 'tube';
                  const isDust = role === 'dust';
                  child.material = new THREE.MeshStandardMaterial({
                    color:             isHead ? 0x22d3ee : isTube ? 0x0ea5e9 : isDust ? 0x7dd3fc : 0x3b82f6,
                    emissive:          new THREE.Color(isHead ? 0x22d3ee : isTube ? 0x0ea5e9 : isDust ? 0x7dd3fc : 0x3b82f6),
                    emissiveIntensity: isHead ? 0.80 : isTube ? 0.55 : isDust ? 0.35 : 0.45,
                    metalness: 0.45,
                    roughness: 0.35,
                    transparent: true,
                    opacity: isHead ? 0.92 : isTube ? 0.60 : isDust ? 0.50 : 0.70,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                  });
                  nodeByObject.set(child, node);
                }
              });
              group.position.copy(localPosition);
              scene.add(group);
              objectByNode.set(node.id, group);
              scene.remove(mesh);
              nodeByObject.delete(mesh);
              asyncDisposables.push(group);
            })
            .catch(() => undefined);
        } else {
          const modelFile = arkSingleModelFile(node.type);
          if (modelFile) {
            const targetSize = radius * (node.type === 'station' ? 1.6 : 2.0);
            loadArkModel(modelFile, targetSize)
              .then((group) => {
                if (sceneDisposed) { disposeObject(group); return; }
                applyHolographicMaterial(group, objectColor(node), 0.4);
                group.position.copy(localPosition);
                scene.add(group);
                group.traverse((child) => { if (child instanceof THREE.Mesh) nodeByObject.set(child, node); });
                objectByNode.set(node.id, group);
                scene.remove(mesh);
                nodeByObject.delete(mesh);
                asyncDisposables.push(group);
              })
              .catch(() => undefined);
          }
        }
      }

      const textureUrl = assetTexture(node.assets, node.thumbnail);
      const webglUrl = webglTextureUrl(textureUrl);
      if (webglUrl && node.type !== 'jump_point' && node.type !== 'station') {
        textureLoader.load(
          webglUrl,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            material.map = texture;
            material.color.set(0xffffff);
            material.emissiveIntensity = node.type === 'star' ? 0.42 : 0.12;
            material.needsUpdate = true;
          },
          undefined,
          () => undefined,
        );
      }

      if (node.type === 'jump_point') {
        // petit anneau cyan autour du diamant, comme l'ARK map
        const ring = createFlatRing(radius * 2.2, 0x22d3ee, 0.45);
        ring.position.copy(mesh.position);
        ring.rotation.x = Math.PI * 0.3;
        scene.add(ring);
        disposables.push(ring);
      }

      if (node.type === 'star' || node.type === 'system' || node.type === 'planet' || selectedId === node.id) {
        const baseOpacity = node.type === 'star' || node.type === 'system' ? 0.42 : 0.22;
        const halo = createHalo(
          radius * (selectedId === node.id ? 3.6 : node.type === 'star' ? 3.2 : 2.2),
          objectColor(node),
          selectedId === node.id ? 0.6 : baseOpacity,
        );
        halo.position.copy(mesh.position);
        scene.add(halo);
        disposables.push(halo);
      }

      if (mode === 'system' && root && node.parentId && shouldDrawOrbit(node)) {
        const parentObject = objectByNode.get(node.parentId);
        if (parentObject && node.type !== 'star') {
          const orbit = createOrbitLine(parentObject.position, mesh.position, objectColor(node));
          scene.add(orbit);
          disposables.push(orbit);
        }
      }

      if (mode === 'galaxy' && node.jumpPoints.length > 0) {
        for (const jump of node.jumpPoints) {
          const target = nodes.find((candidate) => candidate.systemCode === jump.exitSystemCode);
          if (!target || target.id <= node.id) continue;
          const line = createRouteLine(node.scenePosition, target.scenePosition, 0x7dd3fc);
          scene.add(line);
          disposables.push(line);
        }
      }

      if (shouldDrawLabel(node, mode, selectedId)) {
        const label = createLabel(node.name, selectedId === node.id ? '#f0fdff' : '#9bd7eb');
        label.position.copy(mesh.position).add(new THREE.Vector3(0, radius + 0.7, 0));
        label.scale.setScalar(mode === 'galaxy' ? 4.5 : selectedId === node.id ? 1.75 : 1.18);
        scene.add(label);
        disposables.push(label);
      }
    }

    if (mode === 'system' && root) {
      // Disque écliptique translucide visible depuis dessous (ARK map style)
      const diskGeo = new THREE.CircleGeometry(58, 128);
      const diskMat = new THREE.MeshBasicMaterial({ color: 0x0a3a20, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
      const disk = new THREE.Mesh(diskGeo, diskMat);
      disk.rotation.x = Math.PI / 2;
      scene.add(disk);
      disposables.push(disk);

      const inner = root.habitableInner;
      const outer = root.habitableOuter;
      if (inner != null || outer != null) {
        for (const radius of [inner, outer].filter((value): value is number => value != null)) {
          const line = createFlatRing(Math.max(4, radius * 2.8), 0x22c55e, 0.22);
          scene.add(line);
          disposables.push(line);
        }
      }
      controls.target.copy(new THREE.Vector3(0, 0, 0));
    } else {
      controls.target.copy(sceneRootPosition);
    }

    const resize = () => {
      const rect = host.getBoundingClientRect();
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
    };

    const click = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...nodeByObject.keys()], false)[0];
      if (!hit) return;
      const node = nodeByObject.get(hit.object);
      if (node) onSelectRef.current(node.id);
    };

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      for (const [id, object] of objectByNode) {
        const node = nodes.find((candidate) => candidate.id === id);
        if (!node) continue;
        if (node.type === 'star') object.rotation.y += 0.0018;
        else if (node.type === 'planet') object.rotation.y += 0.0028;
        else if (node.type === 'moon') object.rotation.y += 0.006;
        else if (node.type === 'jump_point') {
          if (object.userData.isJumpAssembly) {
            // Animate each component at its own speed/axis
            object.children.forEach((part) => {
              const role = part.userData.animRole as string;
              if (role === 'tube') part.rotation.y += 0.022;                              // tunnel qui tourne vite
              else if (role === 'head') part.rotation.z += 0.005;                         // bouche, lente
              else if (role === 'tail') { part.rotation.y += 0.01; part.rotation.z += 0.004; } // queue spirale
              else if (role === 'dust') { part.rotation.y += 0.018; part.rotation.x += 0.006; } // poussière
            });
          } else {
            // Placeholder en attente de chargement
            object.rotation.z += 0.012;
            object.rotation.x += 0.004;
          }
        }
        else if (node.type === 'asteroid_field') object.rotation.y += 0.003;
      }
      controls.update();
      renderer.render(scene, camera);
    };

    resize();
    animate();
    window.addEventListener('resize', resize);
    renderer.domElement.addEventListener('click', click);

    return () => {
      sceneDisposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('click', click);
      controls.dispose();
      for (const object of disposables) disposeObject(object);
      for (const object of asyncDisposables) disposeObject(object);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [nodes, children, mode, root, selectedId]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

function createStarfield(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const starColors = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xb7edff),
    new THREE.Color(0xffe8c0),
    new THREE.Color(0xc0d8ff),
    new THREE.Color(0xffd0d0),
  ];
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const dist = radius * (0.3 + Math.random() * 0.7);
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * dist;
    positions[i * 3 + 1] = Math.cos(phi) * dist;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * dist;
    const c = starColors[Math.floor(Math.random() * starColors.length)];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, opacity: 0.88, depthWrite: false, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}

function createNebula(count: number, spreadRadius: number, color: number, opacity: number) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = spreadRadius * Math.sqrt(Math.random());
    positions[i * 3] = Math.cos(theta) * r * (0.8 + Math.random() * 0.4);
    positions[i * 3 + 1] = (Math.random() - 0.5) * spreadRadius * 0.18;
    positions[i * 3 + 2] = Math.sin(theta) * r * (0.8 + Math.random() * 0.4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color, size: 1.1, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  return new THREE.Points(geo, mat);
}

function createGalaxyGrid(size: number) {
  const group = new THREE.Group();
  const rings = 8;
  const spokes = 12;
  const mat = new THREE.LineBasicMaterial({ color: 0x0d4a6e, transparent: true, opacity: 0.12 });
  for (let i = 1; i <= rings; i++) {
    const r = (size / rings) * i;
    const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2);
    const pts = curve.getPoints(80).map((p) => new THREE.Vector3(p.x, 0, p.y));
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  for (let i = 0; i < spokes; i++) {
    const angle = (Math.PI * 2 * i) / spokes;
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(angle) * size, 0, Math.sin(angle) * size)];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  return group;
}

function createHalo(radius: number, color: number, opacity: number) {
  const material = new THREE.SpriteMaterial({
    map: createGlowTexture(color),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(radius, radius, 1);
  return sprite;
}

function createGlowTexture(color: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, hex);
    gradient.addColorStop(0.28, `${hex}cc`);
    gradient.addColorStop(1, `${hex}00`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLabel(text: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '700 72px "Orbitron", "Rajdhani", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // outer glow pass
    ctx.shadowColor = 'rgba(34,211,238,0.95)';
    ctx.shadowBlur = 32;
    ctx.fillStyle = color;
    ctx.fillText(text.toUpperCase(), 512, 96, 980);
    // inner sharpen pass
    ctx.shadowBlur = 8;
    ctx.fillText(text.toUpperCase(), 512, 96, 980);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
}

function createOrbitLine(center: THREE.Vector3, point: THREE.Vector3, color: number) {
  const radius = center.distanceTo(point);
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
  const points = curve.getPoints(200).map((p) => new THREE.Vector3(center.x + p.x, center.y, center.z + p.y));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending }));
}

function createFlatRing(radius: number, color: number, opacity: number) {
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
  const points = curve.getPoints(180).map((p) => new THREE.Vector3(p.x, 0, p.y));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

function createRouteLine(from: THREE.Vector3, to: THREE.Vector3, color: number) {
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, from.distanceTo(to) * 0.08, 0));
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(80));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }));
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else if (material) {
      material.dispose();
    }
  });
}

function SystemButton({ summary, active, onClick }: { summary: SystemSummary; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid grid-cols-[1fr_auto] gap-2 border px-3 py-2 text-left transition-colors ${
        active ? 'border-cyan-500/70 bg-cyan-950/35 text-cyan-100' : 'border-slate-800/80 bg-slate-950/45 text-slate-400 hover:border-cyan-900 hover:text-slate-100'
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate font-orbitron text-xs uppercase tracking-wider">{summary.root.name}</span>
        <span className="mt-0.5 block font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
          {summary.objects} objects / {summary.textured} textured
        </span>
      </span>
      <span className="font-mono-sc text-[10px] text-cyan-600">{summary.root.systemCode}</span>
    </button>
  );
}

function ObjectRow({ node, active, onClick }: { node: StarmapNode; active: boolean; onClick: () => void }) {
  const style = styleFor(node.type);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 border px-2 py-2 text-left transition-colors ${
        active ? 'border-cyan-500/70 bg-cyan-950/30' : 'border-slate-900 bg-slate-950/40 hover:border-cyan-900/70'
      }`}
    >
      <span className={style.glow}>{style.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-rajdhani text-sm font-semibold text-slate-200">{node.name}</span>
        <span className="block truncate font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
          {style.label} / {publicAssetLabel(node)}
        </span>
      </span>
      {assetTexture(node.assets, node.thumbnail) && <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />}
    </button>
  );
}

function AssetPreview({ node }: { node: StarmapNode }) {
  const urls = [...node.assets.textures, ...node.assets.skybox].map(sourceImage).filter((url): url is string => Boolean(url && usableTexture(url))).slice(0, 6);
  if (!urls.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {urls.map((url) => (
        <img key={url} src={url} alt="" className="aspect-square w-full border border-slate-800 object-cover" loading="lazy" />
      ))}
    </div>
  );
}

export default function UniverseExplorerPage() {
  const [mode, setMode] = useState<ViewMode>('system');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['starmap-positions'],
    queryFn: () => api.starmap.positions() as Promise<RsiStarmapPosition[]>,
  });

  const nodesModel = useMemo(() => buildNodes(data?.length ? data : FALLBACK_POSITIONS), [data]);
  const selected = selectedId ? nodesModel.byId.get(selectedId) : null;
  const root =
    mode === 'system'
      ? selected?.type === 'system'
        ? selected
        : nodesModel.systems.find((node) => node.systemCode === selected?.systemCode) ?? nodesModel.summaries[0]?.root ?? null
      : null;

  useEffect(() => {
    if (selectedId || !nodesModel.summaries.length) return;
    const defaultRoot = nodesModel.summaries.find((summary) => summary.root.systemCode === DEFAULT_SYSTEM)?.root ?? nodesModel.summaries[0].root;
    setSelectedId(defaultRoot.id);
  }, [nodesModel.summaries, selectedId]);

  const selectedNode = selected ?? nodesModel.summaries[0]?.root ?? null;
  const normalizedSearch = search.trim().toLowerCase();
  const searchMatch = useMemo(() => findBestSearchMatch(nodesModel.allNodes, search), [nodesModel.allNodes, search]);

  useEffect(() => {
    if (!searchMatch || selectedId === searchMatch.id || nodeSearchText(selected ?? searchMatch).includes(normalizedSearch)) return;
    setSelectedId(searchMatch.id);
    setMode('system');
  }, [normalizedSearch, searchMatch, selected, selectedId]);

  const filteredSummaries = useMemo(() => {
    if (!normalizedSearch) return nodesModel.summaries;
    return nodesModel.summaries.filter((summary) => {
      if (nodeSearchText(summary.root).includes(normalizedSearch)) return true;
      return collectDescendants(summary.root, nodesModel.children).some((node) => nodeSearchText(node).includes(normalizedSearch));
    });
  }, [nodesModel.children, nodesModel.summaries, normalizedSearch]);

  const visibleObjects = useMemo(() => {
    const base = normalizedSearch ? nodesModel.allNodes : mode === 'system' && root ? [root, ...collectDescendants(root, nodesModel.children)] : nodesModel.allNodes;
    return base
      .filter((node) => typeFilter === 'all' || node.type === typeFilter)
      .filter((node) => !normalizedSearch || nodeSearchText(node).includes(normalizedSearch))
      .sort((a, b) => typeRank(a.type) - typeRank(b.type) || a.name.localeCompare(b.name))
      .slice(0, 220);
  }, [mode, nodesModel.allNodes, nodesModel.children, normalizedSearch, root, typeFilter]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of nodesModel.allNodes) map.set(node.type, (map.get(node.type) ?? 0) + 1);
    return map;
  }, [nodesModel.allNodes]);

  const selectSystem = useCallback((node: StarmapNode) => {
    setSelectedId(node.id);
    setMode('system');
  }, []);

  const submitSearch = useCallback(() => {
    const match = findBestSearchMatch(nodesModel.allNodes, search);
    if (!match) return;
    setSelectedId(match.id);
    setMode('system');
  }, [nodesModel.allNodes, search]);

  return (
    <div className="flex h-[calc(100vh-64px)] min-h-[720px] flex-col overflow-hidden bg-[#02050a] text-slate-200">
      <header className="shrink-0 border-b border-cyan-950/70 bg-[#030912]/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center border border-cyan-800/70 bg-cyan-950/25 text-cyan-300">
                <Layers3 size={16} />
              </span>
              <h1 className="font-orbitron text-lg font-bold uppercase tracking-[0.22em] text-cyan-100">Starvis Starmap</h1>
            </div>
            {error && !data?.length && (
              <p className="mt-1 font-mono-sc text-[9px] uppercase tracking-widest text-amber-500">
                API unavailable / fallback local map
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex border border-slate-800 bg-slate-950/65 p-1">
              {(['galaxy', 'system'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className={`px-3 py-1.5 font-mono-sc text-[10px] uppercase tracking-widest transition-colors ${
                    mode === item ? 'bg-cyan-800/70 text-cyan-50' : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => selectedNode && selectSystem(selectedNode)}
              className="inline-flex items-center gap-2 border border-cyan-800/60 bg-cyan-950/20 px-3 py-2 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-300 hover:border-cyan-500/70"
            >
              <Focus size={12} />
              Focus
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(420px,1fr)_340px]">
        <aside className="order-2 z-20 flex min-h-0 flex-col border-b border-cyan-900/70 bg-[#06101d]/96 p-3 shadow-[0_0_30px_rgba(0,0,0,0.45)] backdrop-blur lg:order-none lg:border-b-0 lg:border-r">
          <form
            className="relative mb-3"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search system, planet, moon..."
              className="sci-input w-full border-cyan-800/70 bg-slate-950/90 pl-9 pr-9 text-slate-50 placeholder:text-slate-500"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
                <X size={14} />
              </button>
            )}
          </form>

          <div className="mb-3 grid grid-cols-3 gap-2">
            <HudMetric icon={<Sparkles size={11} />} label="Systems" value={nodesModel.systems.length.toLocaleString('en-US')} />
            <HudMetric icon={<Globe2 size={11} />} label="Objects" value={nodesModel.allNodes.length.toLocaleString('en-US')} />
            <HudMetric icon={<Database size={11} />} label="Assets" value={nodesModel.allNodes.filter((node) => assetCount(node) > 0).length.toLocaleString('en-US')} />
          </div>

          <div className="mb-3 min-h-0 border-b border-slate-900 pb-3">
            <p className="mb-2 font-orbitron text-[10px] uppercase tracking-widest text-slate-400">ARK systems</p>
            <div className="grid max-h-48 gap-1 overflow-y-auto pr-1">
              {filteredSummaries.map((summary) => (
                <SystemButton
                  key={summary.root.id}
                  summary={summary}
                  active={root?.id === summary.root.id || selectedNode?.id === summary.root.id}
                  onClick={() => selectSystem(summary.root)}
                />
              ))}
              {!filteredSummaries.length && <p className="px-2 py-4 text-center font-mono-sc text-[10px] uppercase tracking-widest text-slate-500">No system match</p>}
            </div>
          </div>

          <div className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-900 pb-3 lg:flex-wrap">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`shrink-0 border px-2 py-1 font-mono-sc text-[10px] uppercase ${typeFilter === 'all' ? 'border-cyan-600 bg-cyan-950/40 text-cyan-200' : 'border-slate-800 text-slate-600 hover:text-slate-300'}`}
            >
              All
            </button>
            {TYPE_ORDER.filter((type) => counts.has(type)).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={`shrink-0 border px-2 py-1 font-mono-sc text-[10px] uppercase ${typeFilter === type ? 'border-cyan-600 bg-cyan-950/40 text-cyan-200' : 'border-slate-800 text-slate-600 hover:text-slate-300'}`}
              >
                {styleFor(type).label} {counts.get(type)}
              </button>
            ))}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <p className="font-orbitron text-[10px] uppercase tracking-widest text-slate-400">
              {normalizedSearch ? 'Search results' : mode === 'system' && root ? root.name : 'Objects'}
            </p>
            <span className="font-mono-sc text-[10px] text-cyan-300">{visibleObjects.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1">
              {visibleObjects.map((node) => (
                <ObjectRow key={node.id} node={node} active={selectedNode?.id === node.id} onClick={() => setSelectedId(node.id)} />
              ))}
              {!visibleObjects.length && <p className="px-2 py-8 text-center font-mono-sc text-[10px] uppercase tracking-widest text-slate-500">No object match</p>}
            </div>
          </div>
        </aside>

        <main className="relative order-1 min-h-[460px] overflow-hidden bg-black lg:order-none">
          <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_45%,rgba(8,145,178,0.10),transparent_36%)]" />
          <div className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-center justify-between border border-cyan-800/70 bg-slate-950/70 px-3 py-2 backdrop-blur">
            <span className="flex items-center gap-2 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-400">
              <Maximize2 size={12} />
              {mode === 'galaxy' ? 'Galaxy / jump network' : `${root?.name ?? 'System'} / orbital view`}
            </span>
            <span className="hidden font-mono-sc text-[10px] uppercase tracking-widest text-slate-400 md:block">Drag rotate / scroll zoom / click object</span>
          </div>
          <Scene nodes={nodesModel.allNodes} children={nodesModel.children} mode={mode} root={root} selectedId={selectedNode?.id ?? null} onSelect={setSelectedId} />
          {isLoading && (
            <div className="pointer-events-none absolute right-4 top-16 z-20 inline-flex items-center gap-2 border border-cyan-900/60 bg-slate-950/80 px-3 py-2 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-400 backdrop-blur">
              <Loader2 className="animate-spin" size={12} />
              Syncing map data
            </div>
          )}
          <div className="pointer-events-none absolute bottom-4 left-4 z-20 grid grid-cols-2 gap-2 md:grid-cols-5">
            {['system', 'star', 'planet', 'moon', 'jump_point'].map((type) => (
              <div key={type} className="border border-slate-800 bg-slate-950/75 px-2 py-1.5 backdrop-blur">
                <span className={`flex items-center gap-1 font-mono-sc text-[9px] uppercase tracking-widest ${styleFor(type).glow}`}>
                  {styleFor(type).icon}
                  {styleFor(type).label}
                </span>
              </div>
            ))}
          </div>
        </main>

        <aside className="order-3 z-20 flex min-h-0 flex-col overflow-y-auto border-t border-cyan-900/70 bg-[#06101d]/96 p-4 shadow-[0_0_30px_rgba(0,0,0,0.45)] backdrop-blur lg:order-none lg:border-l lg:border-t-0">
          {selectedNode ? (
            <>
              {(assetTexture(selectedNode.assets, selectedNode.thumbnail) ?? selectedNode.thumbnail) && (
                <div className="-mx-4 -mt-4 mb-4 h-40 shrink-0 border-b border-cyan-950/70">
                  <img src={(assetTexture(selectedNode.assets, selectedNode.thumbnail) ?? selectedNode.thumbnail) as string} alt={selectedNode.name} className="h-full w-full object-cover" />
                </div>
              )}

              <div className="mb-4">
                <span className={`inline-flex items-center gap-1 border border-slate-700 bg-slate-950/70 px-2 py-1 font-mono-sc text-[10px] uppercase tracking-widest ${styleFor(selectedNode.type).glow}`}>
                  {styleFor(selectedNode.type).icon}
                  {styleFor(selectedNode.type).label}
                </span>
                <h2 className="mt-3 font-orbitron text-2xl font-bold uppercase tracking-wider text-slate-100">{selectedNode.name}</h2>
                <p className="mt-1 font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
                  {selectedNode.systemName} / {selectedNode.systemCode}
                </p>
              </div>

              {selectedNode.description && <p className="mb-4 max-h-32 overflow-y-auto text-sm leading-relaxed text-slate-400">{selectedNode.description}</p>}

              <div className="mb-4 grid grid-cols-3 gap-2">
                <InfoTile icon={<Globe2 size={12} />} label="Textures" value={selectedNode.assets.textures.length} />
                <InfoTile icon={<Aperture size={12} />} label="Models" value={selectedNode.assets.models.length} />
                <InfoTile icon={<Zap size={12} />} label="Skybox" value={selectedNode.assets.skybox.length} />
              </div>

              <div className="sci-panel mb-4 p-3">
                <StatBar icon={<Activity size={10} />} label="Population" value={selectedNode.population} color="#22d3ee" />
                <StatBar icon={<Sparkles size={10} />} label="Economy" value={selectedNode.economy} color="#34d399" />
                <StatBar icon={<ShieldAlert size={10} />} label="Danger" value={selectedNode.danger} color="#f87171" />
              </div>

              <div className="sci-panel mb-4 p-3">
                <DetailRow label="RSI id" value={selectedNode.rsiId} />
                <DetailRow label="Status" value={selectedNode.status} />
                <DetailRow label="Faction" value={selectedNode.faction} />
                <DetailRow label="Star type" value={selectedNode.starType} />
                <DetailRow
                  label="Habitable zone"
                  value={
                    selectedNode.habitableInner != null || selectedNode.habitableOuter != null
                      ? `${formatNumber(selectedNode.habitableInner)} - ${formatNumber(selectedNode.habitableOuter)}`
                      : null
                  }
                />
                <DetailRow label="P4K link" value={selectedNode.p4kName ?? selectedNode.p4kPath} />
                <DetailRow label="Scannable" value={selectedNode.isScannable ? 'Yes' : 'No'} />
              </div>

              <AssetPreview node={selectedNode} />

              <div className="mt-4 space-y-2">
                {(nodesModel.children.get(selectedNode.id) ?? []).slice(0, 12).map((child) => (
                  <ObjectRow key={child.id} node={child} active={false} onClick={() => setSelectedId(child.id)} />
                ))}
              </div>

              {selectedNode.type !== 'system' && (
                <button
                  type="button"
                  onClick={() => selectSystem(nodesModel.systems.find((node) => node.systemCode === selectedNode.systemCode) ?? selectedNode)}
                  className="mt-4 inline-flex items-center justify-center gap-2 border border-cyan-800/60 bg-cyan-950/25 px-3 py-2 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-300 hover:border-cyan-500"
                >
                  <ChevronLeft size={12} />
                  System view
                </button>
              )}
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-slate-600">No object selected</div>
          )}
        </aside>
      </div>
    </div>
  );
}
