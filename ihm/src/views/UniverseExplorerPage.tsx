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
  system: { label: 'System', color: 0x39e7ff, radius: 1.7, icon: <Sparkles size={12} />, glow: 'text-cyan-300' },
  star: { label: 'Star', color: 0xffc766, radius: 1.3, icon: <Star size={12} />, glow: 'text-amber-300' },
  planet: { label: 'Planet', color: 0x38bdf8, radius: 1.05, icon: <Globe2 size={12} />, glow: 'text-sky-300' },
  moon: { label: 'Moon', color: 0x94a3b8, radius: 0.48, icon: <CircleDot size={12} />, glow: 'text-slate-300' },
  station: { label: 'Station', color: 0xa78bfa, radius: 0.42, icon: <Building2 size={12} />, glow: 'text-violet-300' },
  asteroid_field: { label: 'Asteroids', color: 0x64748b, radius: 0.5, icon: <Aperture size={12} />, glow: 'text-slate-300' },
  jump_point: { label: 'Jump', color: 0xc084fc, radius: 0.58, icon: <Route size={12} />, glow: 'text-purple-300' },
  blackhole: { label: 'Blackhole', color: 0xf472b6, radius: 1.1, icon: <Orbit size={12} />, glow: 'text-pink-300' },
  poi: { label: 'POI', color: 0x22d3ee, radius: 0.36, icon: <MapPin size={12} />, glow: 'text-cyan-300' },
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
    type === 'planet' ? 7.5 + siblingIndex * 3.5 : type === 'moon' ? 1.35 + siblingIndex * 0.72 : type === 'jump_point' ? 30 : 11 + siblingIndex * 1.6;
  const angle = siblingCount > 0 ? (Math.PI * 2 * siblingIndex) / siblingCount + hash01(node.id) * 0.45 : hash01(node.id) * Math.PI * 2;
  const y = type === 'jump_point' ? (hash01(`${node.id}:y`) - 0.5) * 5 : (hash01(`${node.id}:inclination`) - 0.5) * 0.55;
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
      const system = systemByCode.get(node.systemCode);
      if (system && system.id !== node.id && node.type !== 'system') node.parentId = system.id;
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
    const childNodes = (children.get(parent.id) ?? []).sort((a, b) => typeRank(a.type) - typeRank(b.type) || a.name.localeCompare(b.name));
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
  if (node.type !== 'system' && node.type !== 'star') return styleFor(node.type).color;
  const faction = (node.faction ?? '').toLowerCase();
  if (faction.includes('uee')) return 0x22d3ee;
  if (faction.includes("xi'an") || faction.includes('xian')) return 0xa78bfa;
  if (faction.includes('banu')) return 0x34d399;
  if (faction.includes('vanduul')) return 0xf87171;
  return styleFor(node.type).color;
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
    scene.background = new THREE.Color(0x030914);
    scene.fog = new THREE.FogExp2(0x030914, mode === 'galaxy' ? 0.006 : 0.016);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
    camera.position.set(mode === 'galaxy' ? 0 : 0, mode === 'galaxy' ? 95 : 26, mode === 'galaxy' ? 150 : 34);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = mode === 'galaxy' ? 28 : 8;
    controls.maxDistance = mode === 'galaxy' ? 360 : 90;

    const ambient = new THREE.AmbientLight(0xb8eaff, 0.58);
    const key = new THREE.PointLight(0xbdf2ff, 3.1, 280);
    key.position.set(16, 20, 12);
    scene.add(ambient, key);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous';
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const nodeByObject = new Map<THREE.Object3D, StarmapNode>();
    const objectByNode = new Map<string, THREE.Object3D>();
    const disposables: THREE.Object3D[] = [];

    const starfield = createStarfield(mode === 'galaxy' ? 1600 : 900, mode === 'galaxy' ? 260 : 95);
    scene.add(starfield);
    disposables.push(starfield);

    const visible = mode === 'galaxy' || !root ? nodes.filter((node) => node.type === 'system') : [root, ...collectDescendants(root, children)];
    const sceneRootPosition = mode === 'system' && root ? root.scenePosition.clone() : new THREE.Vector3();

    for (const node of visible) {
      const localPosition = mode === 'system' ? node.scenePosition.clone() : node.scenePosition.clone();
      if (mode === 'system' && node.id === root?.id) localPosition.set(0, 0, 0);
      const style = styleFor(node.type);
      const radius = node.type === 'system' ? 1.45 : style.radius;
      const material = new THREE.MeshStandardMaterial({
        color: objectColor(node),
        roughness: node.type === 'star' ? 0.38 : 0.9,
        metalness: node.type === 'station' ? 0.35 : 0.05,
        emissive: new THREE.Color(objectColor(node)),
        emissiveIntensity: node.type === 'star' || node.type === 'system' ? 0.44 : 0.14,
      });
      const geometry =
        node.type === 'station'
          ? new THREE.OctahedronGeometry(radius, 1)
          : node.type === 'jump_point'
            ? new THREE.TorusGeometry(radius * 0.9, radius * 0.08, 12, 48)
            : new THREE.SphereGeometry(radius, 42, 28);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(localPosition);
      mesh.userData.nodeId = node.id;
      scene.add(mesh);
      nodeByObject.set(mesh, node);
      objectByNode.set(node.id, mesh);
      disposables.push(mesh);

      const textureUrl = assetTexture(node.assets, node.thumbnail);
      const webglUrl = webglTextureUrl(textureUrl);
      if (webglUrl && node.type !== 'jump_point' && node.type !== 'station') {
        textureLoader.load(
          webglUrl,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            material.map = texture;
            material.color.set(0xffffff);
            material.emissiveIntensity = node.type === 'star' ? 0.24 : 0.02;
            material.needsUpdate = true;
          },
          undefined,
          () => undefined,
        );
      }

      if (node.type === 'star' || node.type === 'system' || selectedId === node.id) {
        const halo = createHalo(radius * (selectedId === node.id ? 3.2 : 2.4), objectColor(node), selectedId === node.id ? 0.44 : 0.24);
        halo.position.copy(mesh.position);
        scene.add(halo);
        disposables.push(halo);
      }

      if (mode === 'system' && root && node.parentId) {
        const parentObject = objectByNode.get(node.parentId);
        if (parentObject && node.type !== 'star') {
          const orbit = createOrbitLine(parentObject.position, mesh.position, objectColor(node), selectedId === node.id ? 0.58 : 0.28);
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

      const label = createLabel(node.name, selectedId === node.id ? '#f0fdff' : '#b7e7f6');
      label.position.copy(mesh.position).add(new THREE.Vector3(0, radius + 0.55, 0));
      label.scale.setScalar(mode === 'galaxy' ? 4.5 : 1.3);
      scene.add(label);
      disposables.push(label);
    }

    if (mode === 'system' && root) {
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
        if (node?.type === 'planet' || node?.type === 'moon' || node?.type === 'star') object.rotation.y += node.type === 'moon' ? 0.006 : 0.0025;
      }
      controls.update();
      renderer.render(scene, camera);
    };

    resize();
    animate();
    window.addEventListener('resize', resize);
    renderer.domElement.addEventListener('click', click);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('click', click);
      controls.dispose();
      for (const object of disposables) disposeObject(object);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [nodes, children, mode, root, selectedId]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

function createStarfield(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const distance = radius * (0.35 + Math.random() * 0.65);
    positions[index * 3] = Math.sin(phi) * Math.cos(theta) * distance;
    positions[index * 3 + 1] = Math.cos(phi) * distance;
    positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * distance;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xb7edff, size: 0.13, transparent: true, opacity: 0.82, depthWrite: false });
  return new THREE.Points(geometry, material);
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
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.font = '600 34px Rajdhani, Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(34, 211, 238, 0.75)';
    context.shadowBlur = 12;
    context.fillStyle = color;
    context.fillText(text.toUpperCase(), 256, 64, 480);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
}

function createOrbitLine(center: THREE.Vector3, point: THREE.Vector3, color: number, opacity: number) {
  const radius = center.distanceTo(point);
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
  const points = curve.getPoints(160).map((p) => new THREE.Vector3(center.x + p.x, center.y, center.z + p.y));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: Math.min(0.78, opacity + 0.12) }));
}

function createFlatRing(radius: number, color: number, opacity: number) {
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
  const points = curve.getPoints(180).map((p) => new THREE.Vector3(p.x, 0, p.y));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

function createRouteLine(from: THREE.Vector3, to: THREE.Vector3, color: number) {
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, from.distanceTo(to) * 0.12, 0));
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(64));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.42 }));
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
            <p className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
              Legal public RSI asset URLs / custom Starvis navigation / game data overlay
            </p>
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
          {isLoading ? (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="animate-spin text-cyan-300" size={34} />
            </div>
          ) : (
            <Scene nodes={nodesModel.allNodes} children={nodesModel.children} mode={mode} root={root} selectedId={selectedNode?.id ?? null} onSelect={setSelectedId} />
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
