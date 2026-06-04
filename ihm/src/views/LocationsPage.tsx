'use client';

import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Crosshair, Globe2, Loader2, MapPin, Search, Sparkles, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ErrorState } from '@/components/ui/ErrorState';
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
};

type ViewMode = 'galaxy' | 'system';

const FALLBACK_POSITIONS: RsiStarmapPosition[] = [
  { id: 1, rsi_id: 'stanton', name: 'Stanton', type: 'system', system_code: 'STAN', coordinates: { x: 0, y: 0, z: 0 } },
  { id: 2, rsi_id: 'pyro', name: 'Pyro', type: 'system', system_code: 'PYRO', coordinates: { x: 42, y: 0, z: -36 } },
  { id: 3, rsi_id: 'terra', name: 'Terra', type: 'system', system_code: 'TERR', coordinates: { x: 78, y: 0, z: 24 } },
  { id: 4, rsi_id: 'sol', name: 'Sol', type: 'system', system_code: 'SOL', coordinates: { x: -82, y: 0, z: -18 } },
  { id: 5, rsi_id: 'microtech', name: 'microTech', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: 18, y: 0, z: -12 } },
  { id: 6, rsi_id: 'hurston', name: 'Hurston', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: 10, y: 0, z: 24 } },
  { id: 7, rsi_id: 'crusader', name: 'Crusader', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: -22, y: 0, z: 15 } },
  { id: 8, rsi_id: 'arccorp', name: 'ArcCorp', type: 'planet', system_code: 'STAN', parent_id: 1, coordinates: { x: -12, y: 0, z: -21 } },
  { id: 9, rsi_id: 'stanton-pyro', name: 'Stanton - Pyro', type: 'jump_point', system_code: 'STAN', parent_id: 1, coordinates: { x: 34, y: 0, z: -33 } },
];

const TYPE_ORDER = ['system', 'star', 'planet', 'moon', 'station', 'landing_zone', 'rest_stop', 'outpost', 'jump_point', 'comm_array'];
const MAP_TYPES = new Set(TYPE_ORDER);

const TYPE_STYLE: Record<string, { label: string; color: number; radius: number; icon: React.ReactNode }> = {
  system: { label: 'System', color: 0x39e7ff, radius: 2.6, icon: <Sparkles size={12} /> },
  star: { label: 'Star', color: 0xffcc66, radius: 3.1, icon: <Sparkles size={12} /> },
  planet: { label: 'Planet', color: 0x2dd4bf, radius: 1.45, icon: <Globe2 size={12} /> },
  moon: { label: 'Moon', color: 0x94a3b8, radius: 0.78, icon: <Globe2 size={11} /> },
  station: { label: 'Station', color: 0xa78bfa, radius: 0.72, icon: <MapPin size={11} /> },
  landing_zone: { label: 'Landing zone', color: 0x38bdf8, radius: 0.66, icon: <MapPin size={11} /> },
  rest_stop: { label: 'Rest stop', color: 0xf59e0b, radius: 0.66, icon: <MapPin size={11} /> },
  outpost: { label: 'Outpost', color: 0x64748b, radius: 0.48, icon: <MapPin size={10} /> },
  jump_point: { label: 'Jump point', color: 0xc084fc, radius: 0.86, icon: <Zap size={11} /> },
  comm_array: { label: 'Comm array', color: 0x22d3ee, radius: 0.52, icon: <Crosshair size={10} /> },
};

function normalizeType(type: string) {
  return type
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase()
    .replace(/^star_system$/, 'system');
}

function typeStyle(type: string) {
  return TYPE_STYLE[normalizeType(type)] ?? { label: normalizeType(type).replace(/_/g, ' '), color: 0x64748b, radius: 0.42, icon: <MapPin size={10} /> };
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function coords(loc: LocationWithMap) {
  const c = loc.coordinates ?? loc.rsi_starmap?.coordinates;
  if (!c) return null;
  const x = toNumber(c.x);
  const z = toNumber(c.z);
  if (x == null || z == null) return null;
  return new THREE.Vector3(x, toNumber(c.y) ?? 0, z);
}

function systemCode(loc: LocationWithMap) {
  return (loc.system_code ?? loc.rsi_starmap?.system_code ?? loc.rsi_starmap?.system_name ?? loc.uuid.slice(0, 4)).toUpperCase();
}

function posToLocation(pos: RsiStarmapPosition): LocationWithMap {
  return {
    uuid: `starmap-${pos.id}`,
    class_name: pos.rsi_id ? `RSI_${pos.rsi_id}` : `RSI_${pos.id}`,
    name: pos.name,
    type: normalizeType(pos.type),
    system_code: pos.system_code ?? null,
    parent_uuid: pos.parent_id != null ? `starmap-${pos.parent_id}` : null,
    parent_id: pos.parent_id ?? null,
    loc_key: null,
    description: null,
    is_scannable: false,
    hide_in_starmap: false,
    coordinates: pos.coordinates ?? null,
    rsi_starmap_location_id: pos.id,
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

function mergeLocation(mapLoc: LocationWithMap, gameLoc: LocationWithMap): LocationWithMap {
  return {
    ...mapLoc,
    ...gameLoc,
    uuid: mapLoc.uuid,
    name: mapLoc.name || gameLoc.name,
    type: normalizeType(mapLoc.type || gameLoc.type),
    parent_uuid: gameLoc.parent_uuid ?? mapLoc.parent_uuid ?? null,
    parent_id: mapLoc.parent_id ?? gameLoc.parent_id ?? null,
    system_code: gameLoc.system_code ?? mapLoc.system_code ?? null,
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
    combined.set(matched?.uuid ?? normalized.uuid, matched ? mergeLocation(matched, normalized) : normalized);
  }

  return [...combined.values()];
}

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
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

  const roots = visible.filter((loc) => loc.type === 'system' || (loc.type === 'star' && !loc.parent_uuid && loc.parent_id == null));
  const rootByCode = new Map(roots.map((loc) => [systemCode(loc), loc]));
  const parentIdFor = (loc: LocationWithMap) => {
    if (loc.parent_uuid && visible.some((candidate) => candidate.uuid === loc.parent_uuid)) return loc.parent_uuid;
    const root = rootByCode.get(systemCode(loc));
    return root && root.uuid !== loc.uuid ? root.uuid : null;
  };

  const rootCoords = roots.map((loc) => coords(loc)).filter(Boolean) as THREE.Vector3[];
  const bounds = rootCoords.length > 1 ? new THREE.Box3().setFromPoints(rootCoords) : null;
  const center = bounds?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
  const size = bounds?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
  const scale = 120 / Math.max(size.x, size.z, 1);
  const normalizedRootPosition = (loc: LocationWithMap, index: number) => {
    const c = coords(loc);
    if (c && bounds) return c.clone().sub(center).multiplyScalar(scale);
    const a = (index / Math.max(roots.length, 1)) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * 48, (hash(`${loc.uuid}:y`) - 0.5) * 8, Math.sin(a) * 48);
  };

  const nodes = new Map<string, MapNode>();
  roots.forEach((loc, index) => {
    const style = typeStyle(loc.type);
    nodes.set(loc.uuid, {
      id: loc.uuid,
      loc,
      parentId: null,
      systemCode: systemCode(loc),
      position: normalizedRootPosition(loc, index),
      radius: style.radius,
      color: style.color,
      label: loc.name,
      shopCount: loc.loc_key ? shopsByLocKey.get(loc.loc_key) ?? 0 : 0,
    });
  });

  const children = visible
    .filter((loc) => !nodes.has(loc.uuid))
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name));

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
    const position = base.clone().add(new THREE.Vector3(Math.cos(angle) * distance, (hash(`${loc.uuid}:height`) - 0.5) * 3, Math.sin(angle) * distance));
    nodes.set(loc.uuid, {
      id: loc.uuid,
      loc,
      parentId,
      systemCode: systemCode(loc),
      position,
      radius: style.radius,
      color: style.color,
      label: loc.name,
      shopCount: loc.loc_key ? shopsByLocKey.get(loc.loc_key) ?? 0 : 0,
    });
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

function Scene({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: MapNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    selectedRef.current = selectedId;
    onSelectRef.current = onSelect;
  }, [selectedId, onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || nodes.length === 0) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020711);
    scene.fog = new THREE.FogExp2(0x020711, 0.0026);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }
    renderer.setPixelRatio(getThreePixelRatio());
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.1, 1200);
    camera.position.set(0, 92, 108);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 16;
    controls.maxDistance = 260;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.minPolarAngle = Math.PI * 0.08;
    controls.target.set(0, 0, 0);

    const visibility = createVisibilityTracker(container);
    scene.add(new THREE.AmbientLight(0x3b8aa0, 0.7));
    const light = new THREE.DirectionalLight(0xbdf8ff, 2.2);
    light.position.set(80, 120, 40);
    scene.add(light);

    const starCount = 1700;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starPositions.length; i += 3) {
      const r = 160 + hash(`star-r-${i}`) * 520;
      const a = hash(`star-a-${i}`) * Math.PI * 2;
      starPositions[i] = Math.cos(a) * r;
      starPositions[i + 1] = (hash(`star-y-${i}`) - 0.5) * 260;
      starPositions[i + 2] = Math.sin(a) * r;
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPositions, 3)),
      new THREE.PointsMaterial({ color: 0xb7ecff, size: 0.55, transparent: true, opacity: 0.62, depthWrite: false }),
    );
    scene.add(stars);

    const group = new THREE.Group();
    scene.add(group);

    const grid = new THREE.GridHelper(260, 26, 0x155e75, 0x082f49);
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.18;
    grid.position.y = -8;
    group.add(grid);

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
      new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.32 }),
    );
    group.add(links);

    const meshes = new Map<string, THREE.Mesh>();
    const labels: THREE.Sprite[] = [];

    function labelSprite(text: string, color: string) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.font = '700 28px Rajdhani, Arial';
      ctx.textAlign = 'center';
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
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
        type === 'station' || type === 'rest_stop' ? new THREE.OctahedronGeometry(node.radius * 1.25, 1) :
        type === 'outpost' || type === 'landing_zone' ? new THREE.BoxGeometry(node.radius * 1.5, node.radius * 0.65, node.radius * 1.5) :
        type === 'jump_point' ? new THREE.TorusGeometry(node.radius * 1.6, node.radius * 0.1, 8, 42) :
        new THREE.SphereGeometry(node.radius, type === 'system' || type === 'star' ? 32 : 24, type === 'system' || type === 'star' ? 16 : 12);
      const material = new THREE.MeshPhongMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: type === 'star' ? 0.8 : type === 'system' ? 0.45 : 0.22,
        shininess: 70,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(node.position);
      mesh.userData.nodeId = node.id;
      group.add(mesh);
      meshes.set(node.id, mesh);

      if (type === 'system' || type === 'star' || type === 'planet') {
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
              Array.from({ length: 96 }, (_, i) => {
                const a = (i / 96) * Math.PI * 2;
                const d = parent.position.distanceTo(node.position);
                return new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d).add(parent.position);
              }),
            ),
            new THREE.LineBasicMaterial({ color: 0x164e63, transparent: true, opacity: type === 'planet' ? 0.28 : 0.14 }),
          );
          group.add(orbit);
        }
      }
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerUp = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...meshes.values()], false)[0]?.object.userData.nodeId as string | undefined;
      if (hit) onSelectRef.current(hit);
    };
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    let frame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visibility.isVisible()) return;
      const t = clock.getElapsedTime();
      for (const [id, mesh] of meshes) {
        const selected = selectedRef.current === id;
        const material = mesh.material as THREE.MeshPhongMaterial;
        mesh.rotation.y += 0.0018;
        mesh.scale.setScalar(selected ? 1.34 + Math.sin(t * 5) * 0.04 : 1);
        material.emissiveIntensity = selected ? 1.1 : normalizeType(byId.get(id)?.loc.type ?? '') === 'system' ? 0.45 : 0.22;
      }
      labels.forEach((label) => label.quaternion.copy(camera.quaternion));
      const selected = selectedRef.current ? byId.get(selectedRef.current) : null;
      if (selected) controls.target.lerp(selected.position, 0.04);
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
      controls.dispose();
      disposeObject3D(scene);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [nodes]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800/60 py-2">
      <span className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">{label}</span>
      <span className="text-right text-sm text-slate-300">{value}</span>
    </div>
  );
}

export default function LocationsPage() {
  const { env } = useEnv();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('galaxy');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');

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

  const allLocations = useMemo(
    () => combineLocations(starmapPositions?.length ? starmapPositions : FALLBACK_POSITIONS, gameLocations ?? []),
    [gameLocations, starmapPositions],
  );
  const allNodes = useMemo(() => buildNodes(allLocations, shopsData?.data ?? []), [allLocations, shopsData]);
  const roots = useMemo(() => allNodes.filter((node) => !node.parentId), [allNodes]);
  const selectedNode = useMemo(() => allNodes.find((node) => node.id === selectedId) ?? allNodes[0] ?? null, [allNodes, selectedId]);
  const currentRoot = useMemo(() => {
    if (!selectedNode) return roots[0] ?? null;
    let cursor: MapNode | null = selectedNode;
    while (cursor?.parentId) cursor = allNodes.find((node) => node.id === cursor?.parentId) ?? cursor;
    return cursor;
  }, [allNodes, roots, selectedNode]);
  const systemIds = useMemo(() => (viewMode === 'system' && currentRoot ? descendants(allNodes, currentRoot.id) : null), [allNodes, currentRoot, viewMode]);

  const query = search.trim().toLowerCase();
  const visibleNodes = useMemo(() => {
    return allNodes.filter((node) => {
      const inMode = !systemIds || systemIds.has(node.id);
      const typeMatch = typeFilter === 'all' || normalizeType(node.loc.type) === typeFilter;
      const textMatch =
        !query ||
        node.label.toLowerCase().includes(query) ||
        node.systemCode.toLowerCase().includes(query) ||
        (node.loc.class_name ?? '').toLowerCase().includes(query);
      return inMode && typeMatch && textMatch;
    });
  }, [allNodes, query, systemIds, typeFilter]);

  const countsByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of allNodes) counts.set(normalizeType(node.loc.type), (counts.get(normalizeType(node.loc.type)) ?? 0) + 1);
    return counts;
  }, [allNodes]);

  useEffect(() => {
    if (!selectedId && allNodes[0]) setSelectedId(allNodes[0].id);
  }, [allNodes, selectedId]);

  const loading = (loadingStarmap || loadingLocations) && allNodes.length === 0;
  if (starmapError && allNodes.length === 0) return <ErrorState error={starmapError as Error} />;

  return (
    <div className="-m-3 flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-[#020711] sm:-m-6">
      <div className="flex items-center justify-between gap-3 border-b border-cyan-950/70 bg-slate-950/80 px-4 py-3 backdrop-blur md:px-6">
        <div>
          <h1 className="font-orbitron text-lg font-bold uppercase tracking-widest text-cyan-300">Starvis Starmap</h1>
          <p className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
            {allNodes.length.toLocaleString('en-US')} mapped objects - RSI + P4K correlated
          </p>
        </div>
        <div className="hidden items-center gap-1 rounded-sm border border-cyan-900/50 bg-cyan-950/20 p-1 md:flex">
          {(['galaxy', 'system'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-sm px-3 py-1.5 font-orbitron text-[10px] uppercase tracking-wider transition-colors ${
                viewMode === mode ? 'bg-cyan-900/70 text-cyan-200' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr_320px]">
        <aside className="z-20 flex min-h-0 flex-col border-b border-cyan-950/60 bg-slate-950/75 p-3 backdrop-blur lg:border-b-0 lg:border-r">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search location..."
              className="sci-input w-full pl-9 pr-9"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="mb-3 flex gap-1 overflow-x-auto pb-1 lg:flex-wrap">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`shrink-0 rounded-sm border px-2 py-1 font-mono-sc text-[10px] uppercase ${typeFilter === 'all' ? 'border-cyan-700 text-cyan-300' : 'border-slate-800 text-slate-600'}`}
            >
              All
            </button>
            {TYPE_ORDER.filter((type) => countsByType.has(type)).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={`shrink-0 rounded-sm border px-2 py-1 font-mono-sc text-[10px] uppercase ${typeFilter === type ? 'border-cyan-700 text-cyan-300' : 'border-slate-800 text-slate-600 hover:text-slate-300'}`}
              >
                {typeStyle(type).label} {countsByType.get(type)}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {visibleNodes.slice(0, 140).map((node) => {
              const active = selectedNode?.id === node.id;
              const style = typeStyle(node.loc.type);
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  className={`mb-1 flex w-full items-center gap-2 rounded-sm border px-2 py-2 text-left transition-colors ${
                    active ? 'border-cyan-700/70 bg-cyan-950/45 text-cyan-200' : 'border-slate-900 bg-slate-950/45 text-slate-400 hover:border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span className="shrink-0 text-cyan-500">{style.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-rajdhani text-sm font-semibold">{node.label}</span>
                    <span className="font-mono-sc text-[9px] uppercase tracking-wider text-slate-600">{style.label} - {node.systemCode}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="relative min-h-[420px] overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_30%,rgba(21,94,117,0.22),transparent_28%),radial-gradient(circle_at_70%_60%,rgba(168,85,247,0.12),transparent_24%)]" />
          {loading ? (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="animate-spin text-cyan-400" size={32} />
            </div>
          ) : (
            <Scene nodes={visibleNodes.length ? visibleNodes : allNodes} selectedId={selectedNode?.id ?? null} onSelect={setSelectedId} />
          )}
          <div className="pointer-events-none absolute bottom-3 left-4 rounded-sm border border-slate-800/80 bg-slate-950/70 px-3 py-2 font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
            Drag rotate - Scroll zoom - Click object
          </div>
        </main>

        <AnimatePresence mode="wait">
          {selectedNode && (
            <motion.aside
              key={selectedNode.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="z-20 border-t border-cyan-950/60 bg-slate-950/80 p-4 backdrop-blur lg:border-l lg:border-t-0"
            >
              <div className="mb-4">
                <p className="font-mono-sc text-[10px] uppercase tracking-widest text-cyan-600">{selectedNode.systemCode}</p>
                <h2 className="mt-1 font-orbitron text-xl font-bold uppercase tracking-wider text-slate-100">{selectedNode.label}</h2>
                <p className="mt-1 text-xs text-slate-600">{typeStyle(selectedNode.loc.type).label}</p>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <Metric label="X" value={selectedNode.position.x.toFixed(1)} />
                <Metric label="Y" value={selectedNode.position.y.toFixed(1)} />
                <Metric label="Z" value={selectedNode.position.z.toFixed(1)} />
              </div>

              <div className="sci-panel p-3">
                <DetailRow label="Class" value={selectedNode.loc.class_name} />
                <DetailRow label="RSI status" value={selectedNode.loc.rsi_starmap?.status} />
                <DetailRow label="Faction" value={selectedNode.loc.rsi_starmap?.faction_name} />
                <DetailRow label="Scannable" value={selectedNode.loc.is_scannable ? 'Yes' : 'No'} />
                <DetailRow label="Shops" value={selectedNode.shopCount || null} />
                <DetailRow label="Population" value={selectedNode.loc.aggregated?.population} />
                <DetailRow label="Danger" value={selectedNode.loc.aggregated?.danger} />
                <DetailRow label="Economy" value={selectedNode.loc.aggregated?.economy} />
              </div>

              {selectedNode.loc.description && (
                <p className="mt-4 text-sm leading-relaxed text-slate-400">{selectedNode.loc.description}</p>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-slate-800 bg-slate-950/70 px-2 py-2">
      <p className="font-mono-sc text-[9px] uppercase text-slate-600">{label}</p>
      <p className="font-orbitron text-sm text-cyan-300">{value}</p>
    </div>
  );
}
