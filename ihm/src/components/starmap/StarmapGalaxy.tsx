'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Compass, Eye, EyeOff, Globe2, Layers, Loader2, MapPin, Orbit, Route, Satellite, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { createVisibilityTracker, disposeObject3D, getThreePixelRatio } from '@/lib/three-performance';
import { api } from '@/services/api';
import type { StarmapPosition } from '@/types/api';

interface FactionStyle {
  key: string;
  label: string;
  color: number;
  css: string;
}

interface SceneNode {
  object: StarmapPosition;
  position: THREE.Vector3;
  radius: number;
  css: string;
  color: number;
  surface?: boolean;
  visible?: boolean;
  label?: boolean;
}

interface OrbitRing {
  center: THREE.Vector3;
  radius: number;
  color: number;
  opacity: number;
  tiltAxis: THREE.Vector3;
  tiltAngle: number;
}

interface SceneModel {
  nodes: SceneNode[];
  rings: OrbitRing[];
  jumpLines: Array<{ from: THREE.Vector3; to: THREE.Vector3 }>;
  camera: THREE.Vector3;
  target: THREE.Vector3;
  radius: number;
}

type StarmapLevel = 'galaxy' | 'system' | 'body';
type StarmapPositionsResponse = StarmapPosition[] | { data?: unknown };

const FACTIONS: FactionStyle[] = [
  { key: 'uee', label: 'UEE', color: 0x38bdf8, css: '#38bdf8' },
  { key: 'banu', label: 'Banu', color: 0xf59e0b, css: '#f59e0b' },
  { key: 'xian', label: "Xi'an", color: 0x34d399, css: '#34d399' },
  { key: 'vanduul', label: 'Vanduul', color: 0xef4444, css: '#ef4444' },
  { key: 'tevarin', label: 'Tevarin', color: 0xa855f7, css: '#a855f7' },
  { key: 'unclaimed', label: 'Unclaimed', color: 0x94a3b8, css: '#94a3b8' },
];

const TYPE_STYLE: Record<string, { color: number; css: string; size: number; label: string }> = {
  system: { color: 0x38bdf8, css: '#38bdf8', size: 2.1, label: 'System' },
  star: { color: 0xfacc15, css: '#facc15', size: 2.9, label: 'Star' },
  planet: { color: 0x60a5fa, css: '#60a5fa', size: 1.7, label: 'Planet' },
  dwarfplanet: { color: 0x93c5fd, css: '#93c5fd', size: 1.35, label: 'Dwarf planet' },
  moon: { color: 0xcbd5e1, css: '#cbd5e1', size: 0.82, label: 'Moon' },
  satellite: { color: 0xcbd5e1, css: '#cbd5e1', size: 0.78, label: 'Moon' },
  station: { color: 0xa78bfa, css: '#a78bfa', size: 0.92, label: 'Station' },
  reststop: { color: 0xa78bfa, css: '#a78bfa', size: 0.92, label: 'Station' },
  landingzone: { color: 0x34d399, css: '#34d399', size: 0.58, label: 'Landing zone' },
  landing_zone: { color: 0x34d399, css: '#34d399', size: 0.58, label: 'Landing zone' },
  asteroid: { color: 0xf97316, css: '#f97316', size: 0.68, label: 'Asteroid' },
  asteroidbelt: { color: 0xf97316, css: '#f97316', size: 0.68, label: 'Asteroid belt' },
  jumppoint: { color: 0x22d3ee, css: '#22d3ee', size: 0.9, label: 'Jump point' },
  jump_point: { color: 0x22d3ee, css: '#22d3ee', size: 0.9, label: 'Jump point' },
};

const TYPE_ORDER = new Map<string, number>([
  ['star', 0],
  ['system', 0],
  ['planet', 1],
  ['dwarfplanet', 1],
  ['moon', 2],
  ['satellite', 2],
  ['station', 3],
  ['reststop', 3],
  ['landingzone', 4],
  ['asteroid', 5],
  ['asteroidbelt', 5],
  ['jumppoint', 6],
]);

const IMAGE_EXT = /\.(png|jpe?g|webp|avif)(\?|$)/i;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SYSTEM_SCENE_RADIUS = 170;
const BODY_SCENE_RADIUS = 64;
const ORBITABLE_TYPES = new Set(['planet', 'dwarfplanet', 'moon', 'satellite']);

function typeKey(type: string | null | undefined) {
  return String(type ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function objectStyle(type: string | null | undefined) {
  const key = typeKey(type);
  if (key.includes('landing')) return TYPE_STYLE.landingzone;
  if (key.includes('jump')) return TYPE_STYLE.jumppoint;
  if (key.includes('station')) return TYPE_STYLE.station;
  if (key.includes('reststop')) return TYPE_STYLE.reststop;
  if (key.includes('asteroid')) return TYPE_STYLE.asteroid;
  return TYPE_STYLE[key] ?? { color: 0x94a3b8, css: '#94a3b8', size: 0.7, label: type ?? 'Object' };
}

// Toggleable map layers, echoing the official ARK Starmap filter rail.
interface MapLayer {
  key: string;
  label: string;
  css: string;
}

const MAP_LAYERS: MapLayer[] = [
  { key: 'planet', label: 'Planets', css: '#60a5fa' },
  { key: 'moon', label: 'Moons', css: '#cbd5e1' },
  { key: 'station', label: 'Stations', css: '#a78bfa' },
  { key: 'landing', label: 'Landing zones', css: '#34d399' },
  { key: 'asteroid', label: 'Asteroid fields', css: '#f97316' },
  { key: 'jump', label: 'Jump points', css: '#22d3ee' },
];

// Map an object type to a toggleable layer key (stars/systems are never hidden).
function layerKeyOf(type: string | null | undefined): string | null {
  const key = typeKey(type);
  if (key.includes('jump')) return 'jump';
  if (key.includes('landing')) return 'landing';
  if (key.includes('station') || key.includes('reststop')) return 'station';
  if (key.includes('asteroid')) return 'asteroid';
  if (key === 'moon' || key === 'satellite') return 'moon';
  if (key === 'planet' || key === 'dwarfplanet') return 'planet';
  return null;
}

function proxiedAssetUrl(url: string | null | undefined) {
  if (!url) return null;
  const normalized = url.startsWith('//') ? `https:${url}` : url;
  if (!/^https?:\/\//i.test(normalized)) return normalized;
  return `/api/rsi-assets?url=${encodeURIComponent(normalized)}`;
}

// Shareable camera state in the URL (?camera=azimuth,polar,distance), like the
// official ARK Starmap's deep-linkable camera.
interface CameraParam {
  az: number;
  polar: number;
  dist: number;
}

function readCameraParam(): CameraParam | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('camera');
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return { az: parts[0], polar: parts[1], dist: parts[2] };
}

function writeCameraParam(param: CameraParam) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('camera', `${param.az.toFixed(2)},${param.polar.toFixed(2)},${param.dist.toFixed(1)}`);
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

// Real RSI ARK Starmap sun surface textures (sourceimages/suns/NN_Texture.jpg, 01..09).
const SUN_TEXTURE_BASE = 'https://cdn.robertsspaceindustries.com/static/starmap/sourceimages/suns';
const SUN_TEXTURE_COUNT = 9;

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Deterministically map a star to one of the official RSI sun textures, biased by
// spectral class so hotter/cooler stars get visually distinct surfaces.
function sunTextureUrl(object: StarmapPosition): string | null {
  const spectral = String(object.star_type ?? '').trim().toUpperCase()[0] ?? '';
  const spectralBias: Record<string, number> = { O: 7, B: 6, A: 5, F: 4, G: 3, K: 2, M: 1 };
  const seed = hashString(`${object.rsi_id ?? object.id}:${object.name}`);
  const index = spectralBias[spectral] ?? (seed % SUN_TEXTURE_COUNT) + 1;
  const clamped = Math.max(1, Math.min(SUN_TEXTURE_COUNT, index));
  return proxiedAssetUrl(`${SUN_TEXTURE_BASE}/${String(clamped).padStart(2, '0')}_Texture.jpg`);
}

function isImageUrl(value: string) {
  return IMAGE_EXT.test(value) || value.includes('/media/') || value.includes('/starmap/');
}

function findImageUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return isImageUrl(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['texture', 'thumbnail', 'image', 'url', 'source', 'src', 'medium', 'large']) {
      const found = findImageUrl(record[key]);
      if (found) return found;
    }
    for (const child of Object.values(record)) {
      const found = findImageUrl(child);
      if (found) return found;
    }
  }
  return null;
}

function starmapImage(object: StarmapPosition) {
  return (
    proxiedAssetUrl(object.thumbnail) ??
    proxiedAssetUrl(findImageUrl(object.assets)) ??
    proxiedAssetUrl(findImageUrl(object.thumbnail_data))
  );
}

function findAssetTextureUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return findImageUrl(value);
  const record = value as Record<string, unknown>;
  const texture = findImageUrl(record.textures) ?? findImageUrl(record.texture) ?? findImageUrl(record.raw);
  return texture ?? findImageUrl(value);
}

function starmapTexture(object: StarmapPosition) {
  return (
    proxiedAssetUrl(findAssetTextureUrl(object.assets)) ??
    proxiedAssetUrl(findImageUrl(object.thumbnail_data)) ??
    proxiedAssetUrl(object.thumbnail)
  );
}

function coordinateOf(object: StarmapPosition): THREE.Vector3 | null {
  const anyObject = object as StarmapPosition & { position_x?: number; position_y?: number; position_z?: number };
  const coordinates = object.coordinates ?? (
    Number.isFinite(anyObject.position_x)
      ? { x: Number(anyObject.position_x), y: Number(anyObject.position_y ?? 0), z: Number(anyObject.position_z ?? 0) }
      : null
  );
  if (!coordinates || !Number.isFinite(coordinates.x)) return null;
  return new THREE.Vector3(Number(coordinates.x), Number(coordinates.y ?? 0), Number(coordinates.z ?? 0));
}

function objectId(object: StarmapPosition) {
  return String(object.rsi_id ?? object.id);
}

function hasSameId(a: string | number | null | undefined, b: string | number | null | undefined) {
  if (a == null || b == null) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function isSystemObject(object: StarmapPosition) {
  const key = typeKey(object.type);
  return key === 'system' || (key === 'star' && !object.parent_id && object.parent_db_id == null);
}

function isPlanetLike(object: StarmapPosition) {
  const key = typeKey(object.type);
  return key === 'planet' || key === 'dwarfplanet';
}

function isMoonLike(object: StarmapPosition) {
  const key = typeKey(object.type);
  return key === 'moon' || key === 'satellite';
}

function isLandingZone(object: StarmapPosition) {
  return typeKey(object.type).includes('landing');
}

function sortObjects(a: StarmapPosition, b: StarmapPosition) {
  const orderA = TYPE_ORDER.get(typeKey(a.type)) ?? 20;
  const orderB = TYPE_ORDER.get(typeKey(b.type)) ?? 20;
  return orderA === orderB ? a.name.localeCompare(b.name) : orderA - orderB;
}

function factionStyle(faction: string | null): FactionStyle {
  const f = (faction ?? '').toLowerCase();
  if (f.includes('uee') || f.includes('united empire') || f.includes('earth')) return FACTIONS[0];
  if (f.includes('banu')) return FACTIONS[1];
  if (f.includes('xi') || f.includes('xian')) return FACTIONS[2];
  if (f.includes('vanduul')) return FACTIONS[3];
  if (f.includes('tevarin')) return FACTIONS[4];
  return FACTIONS[5];
}

function sameSystem(object: StarmapPosition, system: StarmapPosition) {
  if (object.id === system.id) return true;
  if (object.system_code && system.system_code && object.system_code === system.system_code) return true;
  if (object.system_name && system.system_name && object.system_name === system.system_name) return true;
  if (object.system_name && object.system_name === system.name) return true;
  return false;
}

function parentMatches(child: StarmapPosition, parent: StarmapPosition) {
  return (
    child.parent_db_id === parent.id ||
    hasSameId(child.parent_id, parent.rsi_id) ||
    hasSameId(child.parent_id, parent.id)
  );
}

function childrenOf(parent: StarmapPosition, objects: StarmapPosition[]) {
  return objects.filter((object) => object.id !== parent.id && parentMatches(object, parent)).sort(sortObjects);
}

function hasChildren(parent: StarmapPosition, objects: StarmapPosition[]) {
  return childrenOf(parent, objects).length > 0;
}

function directSystemChild(object: StarmapPosition, system: StarmapPosition, peers: StarmapPosition[]) {
  if (parentMatches(object, system)) return true;
  if (!object.parent_id && object.parent_db_id == null) return true;
  return !peers.some((candidate) => candidate.id !== object.id && parentMatches(object, candidate));
}

function systemObjects(system: StarmapPosition, objects: StarmapPosition[]) {
  return objects.filter((object) => object.id !== system.id && sameSystem(object, system) && !isSystemObject(object)).sort(sortObjects);
}

function systemChildren(system: StarmapPosition, objects: StarmapPosition[]) {
  const peers = systemObjects(system, objects);
  return peers.filter((object) => directSystemChild(object, system, peers)).sort(sortObjects);
}

function jumpPointTargets(system: StarmapPosition): string[] {
  const raw = system.jump_points;
  let parsed = raw;
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = null;
    }
  }
  const values = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? Object.values(parsed as Record<string, unknown>) : [];
  return values
    .flatMap((value) => {
      if (typeof value === 'string') return [value];
      if (!value || typeof value !== 'object') return [];
      const row = value as Record<string, unknown>;
      return [row.destination, row.destination_name, row.system, row.system_name, row.name, row.code]
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    })
    .map((value) => value.toLowerCase());
}

function normSys(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

// Build a system jump-network from jump-point objects, whose names encode an
// "Origin - Destination" pair (e.g. "Odin - Kellog"). Keyed by lowercased name.
function buildJumpGraph(objects: StarmapPosition[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!a || !b || a === b) return;
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a)?.add(b);
    graph.get(b)?.add(a);
  };
  for (const obj of objects) {
    if (!typeKey(obj.type).includes('jump')) continue;
    const origin = normSys(obj.system_name) || normSys(obj.system_code);
    const parts = String(obj.name ?? '')
      .split(/\s[-–—]\s/)
      .map(normSys)
      .filter(Boolean);
    if (parts.length < 2) continue;
    const dest = parts.find((part) => part !== origin) ?? parts[1];
    link(origin, dest);
  }
  return graph;
}

// Breadth-first shortest jump path between two system keys.
function findJumpRoute(graph: Map<string, Set<string>>, from: string, to: string): string[] | null {
  if (from === to) return [from];
  if (!graph.has(from) || !graph.has(to)) return null;
  const queue: string[] = [from];
  const prev = new Map<string, string | null>([[from, null]]);
  while (queue.length) {
    const node = queue.shift() as string;
    if (node === to) break;
    for (const next of graph.get(node) ?? []) {
      if (!prev.has(next)) {
        prev.set(next, node);
        queue.push(next);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: string[] = [];
  let cursor: string | null = to;
  while (cursor) {
    path.unshift(cursor);
    cursor = prev.get(cursor) ?? null;
  }
  return path;
}

function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Soft radial flare texture used for star lens flares.
function makeFlareTexture(inner: string, outer: string): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.2, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Procedural deep-space nebula painted onto an inward-facing background sphere,
// echoing the official ARK Starmap's coloured galactic haze. DDS skyboxes that the
// real renderer uses are no longer publicly served, so we approximate them.
function makeNebulaTexture(level: StarmapLevel): THREE.CanvasTexture {
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#03050d';
    ctx.fillRect(0, 0, w, h);

    const clouds: Array<{ hue: number; alpha: number }> = level === 'galaxy'
      ? [
          { hue: 205, alpha: 0.22 },
          { hue: 230, alpha: 0.18 },
          { hue: 275, alpha: 0.14 },
          { hue: 190, alpha: 0.12 },
          { hue: 320, alpha: 0.08 },
        ]
      : [
          { hue: 210, alpha: 0.14 },
          { hue: 245, alpha: 0.1 },
          { hue: 190, alpha: 0.08 },
        ];

    let seed = 99173;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (const cloud of clouds) {
      const blobs = 22;
      for (let i = 0; i < blobs; i += 1) {
        const cx = rand() * w;
        const cy = h * (0.25 + rand() * 0.5);
        const radius = 120 + rand() * 420;
        const light = 38 + rand() * 22;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `hsla(${cloud.hue}, 70%, ${light}%, ${cloud.alpha})`);
        grad.addColorStop(1, 'hsla(0,0%,0%,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sprinkle faint distant stars directly into the backdrop for depth.
    for (let i = 0; i < 1400; i += 1) {
      const x = rand() * w;
      const y = rand() * h;
      const a = 0.25 + rand() * 0.6;
      const s = rand() < 0.96 ? 1 : 2;
      ctx.fillStyle = `rgba(${200 + Math.floor(rand() * 55)},${210 + Math.floor(rand() * 45)},255,${a})`;
      ctx.fillRect(x, y, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeProceduralBodyTexture(object: StarmapPosition, color: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(color);
  const key = typeKey(object.type);
  const center = size / 2;

  if (ctx) {
    const dark = base.clone().multiplyScalar(key.includes('asteroid') ? 0.42 : 0.58).getStyle();
    const light = base.clone().lerp(new THREE.Color(0xffffff), key === 'star' ? 0.42 : 0.28).getStyle();
    const grad = ctx.createRadialGradient(center * 0.68, center * 0.58, 12, center, center, center);
    grad.addColorStop(0, light);
    grad.addColorStop(0.58, base.getStyle());
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const seed = object.id * 9973;
    ctx.globalAlpha = key === 'star' ? 0.18 : 0.28;
    for (let i = 0; i < 34; i += 1) {
      const y = (i / 34) * size + Math.sin(seed + i * 1.7) * 7;
      const bandHeight = 2 + ((seed + i * 13) % 9);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(2,6,23,0.34)';
      ctx.fillRect(0, y, size, bandHeight);
    }

    if (key.includes('asteroid')) {
      ctx.globalAlpha = 0.42;
      for (let i = 0; i < 40; i += 1) {
        const x = (Math.sin(seed + i * 4.1) * 0.5 + 0.5) * size;
        const y = (Math.cos(seed + i * 2.3) * 0.5 + 0.5) * size;
        ctx.fillStyle = 'rgba(2,6,23,0.45)';
        ctx.beginPath();
        ctx.arc(x, y, 2 + (i % 5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeLabelSprite(text: string, css: string, worldHeight: number): THREE.Sprite {
  const padding = 8;
  const label = text.length > 28 ? `${text.slice(0, 25)}...` : text;
  const font = '700 26px "Rajdhani", system-ui, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  if (measure) measure.font = font;
  const textWidth = measure ? measure.measureText(label).width : label.length * 14;
  const w = Math.ceil(textWidth + padding * 2);
  const h = 40;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(2,6,23,0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = css;
    ctx.fillText(label, padding, h / 2 + 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((w / h) * worldHeight, worldHeight, 1);
  return sprite;
}

function makeCircle(
  radius: number,
  color: number,
  opacity: number,
  center: THREE.Vector3,
  tiltAxis?: THREE.Vector3,
  tiltAngle?: number,
) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.position.copy(center);
  if (tiltAxis && tiltAngle) line.setRotationFromAxisAngle(tiltAxis.clone().normalize(), tiltAngle);
  return line;
}

function radialPosition(center: THREE.Vector3, radius: number, index: number, y = 0) {
  const angle = index * GOLDEN_ANGLE;
  return new THREE.Vector3(center.x + Math.cos(angle) * radius, center.y + y, center.z + Math.sin(angle) * radius);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shouldDrawOrbit(object: StarmapPosition, level: 'system' | 'body', depth: number) {
  const key = typeKey(object.type);
  if (!ORBITABLE_TYPES.has(key)) return false;
  if (level === 'body') return depth <= 1;
  return depth <= 2;
}

// Derive an orbit ring that actually passes through the body: a circle of radius
// |offset| tilted out of the horizontal plane by the body's own elevation, so
// inclined orbits read as the official map's tilted ellipses (bodies stay put).
function orbitGeometry(parentPosition: THREE.Vector3, bodyPosition: THREE.Vector3) {
  const offset = bodyPosition.clone().sub(parentPosition);
  const radius = offset.length();
  const horizontal = Math.hypot(offset.x, offset.z);
  if (horizontal < 0.0001) {
    return { radius, tiltAxis: new THREE.Vector3(1, 0, 0), tiltAngle: 0 };
  }
  const tiltAxis = new THREE.Vector3(-offset.z, 0, offset.x);
  const tiltAngle = Math.atan2(offset.y, horizontal);
  return { radius, tiltAxis, tiltAngle };
}

function modelRadius(nodes: SceneNode[]) {
  return Math.max(24, ...nodes.filter((node) => node.visible !== false).map((node) => node.position.length() + node.radius * 6));
}

function cameraFor(level: StarmapLevel, radius: number) {
  if (level === 'galaxy') return new THREE.Vector3(120, 90, 200);
  if (level === 'system') return new THREE.Vector3(0, radius * 0.62, radius * 1.18);
  return new THREE.Vector3(0, radius * 0.78, radius * 1.35);
}

function scaledCoordinates(
  root: StarmapPosition,
  objects: StarmapPosition[],
  targetRadius: number,
) {
  const rootCoordinate = coordinateOf(root) ?? new THREE.Vector3(0, 0, 0);
  const rawPositions = new Map<number, THREE.Vector3>();
  let maxDistance = 0;

  for (const object of objects) {
    const coordinate = coordinateOf(object);
    if (!coordinate) continue;
    const relative = coordinate.sub(rootCoordinate);
    rawPositions.set(object.id, relative);
    maxDistance = Math.max(maxDistance, relative.length());
  }

  const scale = maxDistance > 0 ? clamp(targetRadius / maxDistance, 0.04, 42) : 1;
  const scenePositions = new Map<number, THREE.Vector3>();
  rawPositions.forEach((position, id) => {
    const distance = position.length();
    if (distance <= 0.0001) {
      scenePositions.set(id, new THREE.Vector3(0, 0, 0));
      return;
    }

    const easedDistance = Math.pow(distance / maxDistance, 0.74) * targetRadius;
    scenePositions.set(id, position.clone().normalize().multiplyScalar(easedDistance).setY(position.y * scale * 0.42));
  });

  return { scenePositions, scale };
}

function nodeLabelEnabled(object: StarmapPosition, level: 'system' | 'body', depth: number) {
  const key = typeKey(object.type);
  if (depth === 0) return true;
  if (level === 'body') return depth <= 1 && ORBITABLE_TYPES.has(key);
  return depth <= 1 && ['star', 'planet', 'dwarfplanet', 'jumppoint', 'jump_point'].includes(key);
}

function buildGalaxyModel(objects: StarmapPosition[]): SceneModel {
  const systems = objects.filter((object) => isSystemObject(object)).sort((a, b) => a.name.localeCompare(b.name));
  const rawCenter = new THREE.Vector3();
  const rawPositions = new Map<number, THREE.Vector3>();
  systems.forEach((system, index) => {
    const fallback = radialPosition(new THREE.Vector3(0, 0, 0), 40 + Math.floor(index / 18) * 22, index, (index % 4) * 4);
    const position = coordinateOf(system) ?? fallback;
    rawPositions.set(system.id, position);
    rawCenter.add(position);
  });
  rawCenter.divideScalar(Math.max(1, systems.length));

  let maxDist = 1;
  for (const system of systems) {
    maxDist = Math.max(maxDist, rawPositions.get(system.id)!.clone().sub(rawCenter).length());
  }

  const scale = 140 / maxDist;
  const nodes = systems.map((system) => {
    const faction = factionStyle(system.faction_name);
    const style = objectStyle(system.type);
    return {
      object: system,
      position: rawPositions.get(system.id)!.clone().sub(rawCenter).multiplyScalar(scale),
      radius: style.size,
      css: faction.css,
      color: faction.color,
    };
  });

  const byName = new Map<string, THREE.Vector3>();
  for (const node of nodes) {
    for (const value of [node.object.name, node.object.system_name, node.object.system_code, node.object.rsi_id].filter(Boolean) as string[]) {
      byName.set(value.toLowerCase(), node.position);
    }
  }

  const jumpLines: SceneModel['jumpLines'] = [];
  for (const node of nodes) {
    for (const target of jumpPointTargets(node.object)) {
      const to = byName.get(target);
      if (to && node.position.distanceTo(to) > 0.1) jumpLines.push({ from: node.position, to });
    }
  }

  const radius = modelRadius(nodes);
  return {
    nodes,
    rings: [],
    jumpLines,
    camera: cameraFor('galaxy', radius),
    target: new THREE.Vector3(0, 0, 0),
    radius,
  };
}

function buildNestedModel(root: StarmapPosition, objects: StarmapPosition[], allObjects: StarmapPosition[], level: 'system' | 'body'): SceneModel {
  const rootStyle = objectStyle(root.type);
  const rootColor = isSystemObject(root) ? factionStyle(root.faction_name) : rootStyle;
  const physicalRoot = !(level === 'system' && typeKey(root.type) === 'system');
  const rootRadius = physicalRoot ? (isSystemObject(root) ? 3.5 : Math.max(2.2, rootStyle.size * 1.35)) : 0.01;
  const rootNode: SceneNode = {
    object: root,
    position: new THREE.Vector3(0, 0, 0),
    radius: rootRadius,
    css: rootColor.css,
    color: rootColor.color,
    visible: physicalRoot,
    label: physicalRoot,
  };

  const nodes: SceneNode[] = [rootNode];
  const rings: OrbitRing[] = [];
  const placed = new Set<number>([root.id]);
  const sceneCoordinates = scaledCoordinates(root, objects, level === 'system' ? SYSTEM_SCENE_RADIUS : BODY_SCENE_RADIUS);
  const rootChildren = level === 'system'
    ? systemChildren(root, allObjects)
    : childrenOf(root, objects);

  const positionFor = (
    child: StarmapPosition,
    parentPosition: THREE.Vector3,
    parentRadius: number,
    index: number,
    depth: number,
  ) => {
    const exact = sceneCoordinates.scenePositions.get(child.id);
    if (exact) return exact.clone();
    if (isLandingZone(child)) return radialPosition(parentPosition, parentRadius + 0.9, index + depth * 2, 0.25);
    const fallbackRadius = level === 'system' ? 28 + index * 12 + depth * 7 : 10 + index * 5 + depth * 2.5;
    return radialPosition(parentPosition, fallbackRadius, index + depth * 4, (index % 2) * 0.35);
  };

  const placeChildren = (parent: StarmapPosition, parentPosition: THREE.Vector3, parentRadius: number, depth: number) => {
    const children = childrenOf(parent, objects).filter((child) => !placed.has(child.id));
    children.forEach((child, index) => {
      const style = objectStyle(child.type);
      const landing = isLandingZone(child);
      const position = positionFor(child, parentPosition, parentRadius, index, depth);
      const orbit = orbitGeometry(parentPosition, position);
      const node: SceneNode = {
        object: child,
        position,
        radius: landing ? Math.min(style.size, 0.5) : style.size,
        css: style.css,
        color: style.color,
        surface: landing,
        label: nodeLabelEnabled(child, level, depth),
      };
      nodes.push(node);
      placed.add(child.id);
      if (shouldDrawOrbit(child, level, depth) && orbit.radius > 1) {
        rings.push({
          center: parentPosition,
          radius: orbit.radius,
          color: style.color,
          opacity: depth === 1 ? 0.22 : 0.11,
          tiltAxis: orbit.tiltAxis,
          tiltAngle: orbit.tiltAngle,
        });
      }
      placeChildren(child, position, Math.max(1, node.radius), depth + 1);
    });
  };

  rootChildren.forEach((child, index) => {
    if (placed.has(child.id)) return;
    const style = objectStyle(child.type);
    const landing = isLandingZone(child);
    const position = positionFor(child, rootNode.position, Math.max(1, rootNode.radius), index, 1);
    const orbit = orbitGeometry(rootNode.position, position);
    const node: SceneNode = {
      object: child,
      position,
      radius: landing ? Math.min(style.size, 0.5) : style.size,
      css: style.css,
      color: style.color,
      surface: landing,
      label: nodeLabelEnabled(child, level, 1),
    };
    nodes.push(node);
    placed.add(child.id);
    if (shouldDrawOrbit(child, level, 1) && orbit.radius > 1) {
      rings.push({
        center: rootNode.position,
        radius: orbit.radius,
        color: style.color,
        opacity: 0.22,
        tiltAxis: orbit.tiltAxis,
        tiltAngle: orbit.tiltAngle,
      });
    }
    placeChildren(child, position, Math.max(1, node.radius), 1);
  });

  const leftovers = objects.filter((object) => object.id !== root.id && !placed.has(object.id)).sort(sortObjects);
  leftovers.forEach((child, index) => {
    const style = objectStyle(child.type);
    const position = positionFor(child, rootNode.position, Math.max(1, rootNode.radius), index + nodes.length, 1);
    nodes.push({ object: child, position, radius: style.size, css: style.css, color: style.color, label: false });
    placed.add(child.id);
  });

  const jumpLines: SceneModel['jumpLines'] = [];
  if (isSystemObject(root)) {
    const jumpNodes = nodes.filter((node) => typeKey(node.object.type).includes('jump'));
    for (const node of jumpNodes) jumpLines.push({ from: rootNode.position, to: node.position });
  }

  const radius = modelRadius(nodes);
  return {
    nodes,
    rings,
    jumpLines,
    camera: cameraFor(level, radius),
    target: new THREE.Vector3(0, 0, 0),
    radius,
  };
}

function levelTitle(level: StarmapLevel) {
  if (level === 'galaxy') return 'Galactic Map';
  if (level === 'system') return 'System Map';
  return 'Local Map';
}

function StarmapScene({ objects }: { objects: StarmapPosition[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<StarmapPosition | null>(null);
  const [level, setLevel] = useState<StarmapLevel>('galaxy');
  const [activeSystem, setActiveSystem] = useState<StarmapPosition | null>(null);
  const [activeBody, setActiveBody] = useState<StarmapPosition | null>(null);
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const cameraParamRef = useRef<CameraParam | null>(readCameraParam());
  const sceneApiRef = useRef<{
    reticle: THREE.Object3D;
    positions: Map<string, { pos: THREE.Vector3; radius: number }>;
  } | null>(null);

  const toggleLayer = (key: string) =>
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const systems = useMemo(
    () => objects.filter((object) => isSystemObject(object)).sort((a, b) => a.name.localeCompare(b.name)),
    [objects],
  );

  const currentObjects = useMemo(() => {
    if (level === 'galaxy') return systems;
    if (activeSystem) return systemObjects(activeSystem, objects);
    return [];
  }, [activeSystem, level, objects, systems]);

  const jumpGraph = useMemo(() => buildJumpGraph(objects), [objects]);
  // Only systems that participate in the jump network can be route endpoints.
  const routableSystems = useMemo(
    () => systems.filter((system) => jumpGraph.has(normSys(system.name))),
    [systems, jumpGraph],
  );
  const route = useMemo(() => {
    if (!routeFrom || !routeTo) return null;
    return findJumpRoute(jumpGraph, routeFrom, routeTo);
  }, [jumpGraph, routeFrom, routeTo]);

  const sceneModel = useMemo(() => {
    if (level === 'system' && activeSystem) {
      return buildNestedModel(activeSystem, systemObjects(activeSystem, objects), objects, 'system');
    }
    if (level === 'body' && activeSystem && activeBody) {
      return buildNestedModel(activeBody, systemObjects(activeSystem, objects), objects, 'body');
    }
    return buildGalaxyModel(objects);
  }, [activeBody, activeSystem, level, objects]);

  const enterSystem = (system: StarmapPosition) => {
    setActiveSystem(system);
    setActiveBody(null);
    setSelected(null);
    setLevel('system');
  };

  const inspectBody = (body: StarmapPosition) => {
    if (!activeSystem) return;
    setActiveBody(body);
    setSelected(null);
    setLevel('body');
  };

  const backToGalaxy = () => {
    setLevel('galaxy');
    setActiveSystem(null);
    setActiveBody(null);
    setSelected(null);
  };

  const backToSystem = () => {
    setLevel('system');
    setActiveBody(null);
    setSelected(null);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || sceneModel.nodes.length === 0) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03050d);
    scene.fog = new THREE.FogExp2(0x03050d, level === 'galaxy' ? 0.0011 : level === 'system' ? 0.0016 : 0.0028);
    scene.add(new THREE.AmbientLight(0x7aa7ff, level === 'galaxy' ? 1.1 : 1.85));
    scene.add(new THREE.HemisphereLight(0x8edcff, 0x05070f, level === 'galaxy' ? 0.6 : 1.0));

    const key = new THREE.PointLight(0x66d8ff, level === 'galaxy' ? 1.2 : 2.35, 0, 0);
    key.position.set(80, 120, 80);
    scene.add(key);

    // Deep-space nebula backdrop (inward-facing sphere) for the official ARK feel.
    const nebulaTexture = makeNebulaTexture(level);
    const nebulaRadius = level === 'galaxy' ? 2600 : Math.max(900, sceneModel.radius * 9);
    const nebula = new THREE.Mesh(
      new THREE.SphereGeometry(nebulaRadius, 48, 32),
      new THREE.MeshBasicMaterial({ map: nebulaTexture, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    scene.add(nebula);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(getThreePixelRatio());
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 6000);
    const portraitFit = width < 640 && level !== 'galaxy' ? 1.72 : 1;
    camera.position.copy(sceneModel.camera.clone().multiplyScalar(portraitFit));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.9;
    controls.autoRotate = level === 'galaxy' && !cameraParamRef.current;
    controls.autoRotateSpeed = 0.25;
    controls.target.copy(sceneModel.target);
    controls.minDistance = level === 'galaxy' ? 30 : Math.max(10, sceneModel.radius * 0.16);
    controls.maxDistance = level === 'galaxy' ? 900 : Math.max(160, sceneModel.radius * 2.8);
    controls.update();

    // Restore a shared/deep-linked camera at the galaxy level.
    if (level === 'galaxy' && cameraParamRef.current) {
      const { az, polar, dist } = cameraParamRef.current;
      const radius = clamp(dist, controls.minDistance, controls.maxDistance);
      camera.position.setFromSpherical(new THREE.Spherical(radius, clamp(polar, 0.05, Math.PI - 0.05), az)).add(controls.target);
      controls.update();
    }

    // Persist camera moves to the URL so views are shareable.
    const onControlEnd = () => {
      const offset = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      cameraParamRef.current = { az: sph.theta, polar: sph.phi, dist: sph.radius };
      if (level === 'galaxy') writeCameraParam(cameraParamRef.current);
    };
    controls.addEventListener('end', onControlEnd);

    // Post-processing: bloom gives the official ARK Starmap its signature glow.
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(getThreePixelRatio());
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      level === 'galaxy' ? 0.9 : 0.7, // strength
      0.7, // radius
      level === 'galaxy' ? 0.04 : 0.12, // threshold
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    const visibility = createVisibilityTracker(container);
    const glowTexture = makeGlowTexture();
    const flareMainTexture = makeFlareTexture('rgba(255,252,240,0.95)', 'rgba(255,196,120,0.55)');
    const flareGhostTexture = makeFlareTexture('rgba(180,210,255,0.55)', 'rgba(120,160,255,0.18)');
    const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');
    const loadedTextures: THREE.Texture[] = [];
    const pickables: THREE.Mesh[] = [];
    const nodeGroup = new THREE.Group();
    const animatedNodes: Array<{ mesh: THREE.Mesh; glow: THREE.Sprite; base: number; glowBase: number; phase: number; spin: number }> = [];
    const labels: Array<{ sprite: THREE.Sprite; baseWidth: number; baseHeight: number }> = [];
    const jumpComets: Array<{ sprite: THREE.Sprite; curve: THREE.QuadraticBezierCurve3; offset: number; speed: number }> = [];
    const nodePositions = new Map<string, { pos: THREE.Vector3; radius: number }>();

    // Reusable selection reticle, repositioned imperatively when the selection
    // changes so picking a body never rebuilds the whole scene.
    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.62, 56),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    reticle.visible = false;
    reticle.renderOrder = 999;
    nodeGroup.add(reticle);

    const starCount = level === 'galaxy' ? 2200 : 760;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = (level === 'galaxy' ? 600 : sceneModel.radius * 1.15) + Math.random() * (level === 'galaxy' ? 1400 : sceneModel.radius * 1.9);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0x8aa0c0, size: level === 'galaxy' ? 2 : 0.52, sizeAttenuation: true, transparent: true, opacity: level === 'galaxy' ? 0.48 : 0.34 }),
      ),
    );

    for (const ring of sceneModel.rings) {
      nodeGroup.add(makeCircle(ring.radius, ring.color, ring.opacity, ring.center, ring.tiltAxis, ring.tiltAngle));
    }

    for (const node of sceneModel.nodes) {
      if (node.visible === false) continue;
      const layerKey = layerKeyOf(node.object.type);
      if (layerKey && hiddenLayers.has(layerKey)) continue;
      const materialOptions: THREE.MeshStandardMaterialParameters = {
        color: node.color,
        emissive: node.color,
        emissiveIntensity: isSystemObject(node.object) ? 1.05 : 0.28,
        roughness: 0.42,
        metalness: 0.08,
      };
      const tkey = typeKey(node.object.type);
      const isStar = tkey === 'star';
      const sunUrl = isStar ? sunTextureUrl(node.object) : null;
      const image = isStar ? null : starmapTexture(node.object);
      if (sunUrl) {
        // Real RSI sun surface texture, self-lit so it reads as a light source.
        const tex = textureLoader.load(sunUrl, () => {
          tex.colorSpace = THREE.SRGBColorSpace;
        });
        loadedTextures.push(tex);
        materialOptions.map = tex;
        materialOptions.emissiveMap = tex;
        materialOptions.color = 0xffffff;
        materialOptions.emissive = 0xffffff;
        materialOptions.emissiveIntensity = 1.7;
        materialOptions.roughness = 1;
        materialOptions.metalness = 0;
      } else if (image) {
        const tex = textureLoader.load(image, () => {
          tex.colorSpace = THREE.SRGBColorSpace;
        });
        loadedTextures.push(tex);
        materialOptions.map = tex;
        materialOptions.color = 0xffffff;
        materialOptions.emissiveIntensity = isStar ? 0.5 : 0.05;
        materialOptions.roughness = 0.72;
      } else if (isPlanetLike(node.object) || isMoonLike(node.object) || isStar || tkey.includes('asteroid')) {
        const tex = makeProceduralBodyTexture(node.object, node.color);
        loadedTextures.push(tex);
        materialOptions.map = tex;
        materialOptions.color = 0xffffff;
        materialOptions.emissiveIntensity = isStar ? 0.75 : 0.08;
        materialOptions.roughness = tkey.includes('asteroid') ? 0.9 : 0.68;
      }

      const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial(materialOptions));
      mesh.position.copy(node.position);
      mesh.scale.setScalar(node.radius);
      mesh.userData.system = node.object;
      mesh.userData.baseEmissiveIntensity = materialOptions.emissiveIntensity ?? 0.28;
      pickables.push(mesh);
      nodeGroup.add(mesh);
      nodePositions.set(objectId(node.object), { pos: node.position, radius: node.radius });

      // Stars cast light and carry a lens flare, like the official ARK suns.
      if (isStar) {
        const sunColor = new THREE.Color(node.color).lerp(new THREE.Color(0xffffff), 0.45);
        const sunLight = new THREE.PointLight(sunColor.getHex(), level === 'galaxy' ? 1.4 : 3.4, 0, 1.4);
        sunLight.position.copy(node.position);
        const flare = new Lensflare();
        flare.addElement(new LensflareElement(flareMainTexture, level === 'galaxy' ? 140 : 320, 0, sunColor));
        flare.addElement(new LensflareElement(flareGhostTexture, 60, 0.6));
        flare.addElement(new LensflareElement(flareGhostTexture, 90, 0.9));
        sunLight.add(flare);
        nodeGroup.add(sunLight);
      }

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: node.color,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const glowBase = node.surface ? 2.1 : level === 'galaxy' ? 7 : 4.2;
      glow.scale.set(glowBase + node.radius * 2.2, glowBase + node.radius * 2.2, 1);
      glow.position.copy(node.position);
      nodeGroup.add(glow);
      // Subtle axial rotation so bodies feel alive, like the official map.
      const spin = isStar
        ? 0.012
        : tkey.includes('asteroid')
          ? 0.06
          : isPlanetLike(node.object) || isMoonLike(node.object)
            ? 0.05 + (hashString(node.object.name) % 30) / 1000
            : 0;
      mesh.rotation.y = (hashString(node.object.name) % 628) / 100;
      animatedNodes.push({ mesh, glow, base: node.radius, glowBase, phase: Math.random() * Math.PI * 2, spin });

      const shouldLabel = node.label ?? (
        level === 'galaxy' && ['system', 'star'].includes(typeKey(node.object.type))
      );
      if (shouldLabel) {
        const labelHeight = level === 'galaxy' ? 4 : level === 'system' ? 2.35 : 1.45;
        const label = makeLabelSprite(node.object.name, node.css, labelHeight);
        label.position.copy(node.position).add(new THREE.Vector3(0, labelHeight * 0.65 + node.radius, 0));
        labels.push({ sprite: label, baseWidth: label.scale.x, baseHeight: label.scale.y });
        nodeGroup.add(label);
      }
    }

    for (const line of hiddenLayers.has('jump') ? [] : sceneModel.jumpLines) {
      const curve = new THREE.QuadraticBezierCurve3(
        line.from,
        line.from.clone().add(line.to).multiplyScalar(0.5).add(new THREE.Vector3(0, level === 'galaxy' ? 18 : 5, 0)),
        line.to,
      );
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
      const material = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: level === 'galaxy' ? 0.26 : 0.1 });
      nodeGroup.add(new THREE.Line(geometry, material));

      // Pulse of light travelling along the jump tunnel.
      const comet = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture, color: 0x67e8f9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const cometScale = level === 'galaxy' ? 5.5 : 2.6;
      comet.scale.set(cometScale, cometScale, 1);
      nodeGroup.add(comet);
      jumpComets.push({ sprite: comet, curve, offset: Math.random(), speed: 0.16 + Math.random() * 0.12 });
    }

    // Highlight a planned jump route across the galaxy in gold.
    if (level === 'galaxy' && route && route.length > 1) {
      const posByName = new Map<string, THREE.Vector3>();
      for (const node of sceneModel.nodes) {
        for (const key of [node.object.name, node.object.system_name, node.object.system_code]) {
          const norm = normSys(key);
          if (norm) posByName.set(norm, node.position);
        }
      }
      for (let i = 0; i < route.length - 1; i += 1) {
        const a = posByName.get(route[i]);
        const b = posByName.get(route[i + 1]);
        if (!a || !b) continue;
        const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 24, 0));
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(44));
        const material = new THREE.LineBasicMaterial({
          color: 0xfacc15,
          transparent: true,
          opacity: 0.92,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        nodeGroup.add(new THREE.Line(geometry, material));
      }
    }

    scene.add(nodeGroup);
    sceneApiRef.current = { reticle, positions: nodePositions };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hovered: THREE.Mesh | null = null;
    let downX = 0;
    let downY = 0;

    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerMove = (event: PointerEvent) => {
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      const mesh = (hit?.object as THREE.Mesh) ?? null;
      if (mesh !== hovered) {
        if (hovered) {
          (hovered.material as THREE.MeshStandardMaterial).emissiveIntensity = Number(hovered.userData.baseEmissiveIntensity ?? 0.28);
        }
        hovered = mesh;
        if (hovered) (hovered.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.8;
        renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (Math.abs(event.clientX - downX) > 5 || Math.abs(event.clientY - downY) > 5) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      if (hit) {
        const object = (hit.object as THREE.Mesh).userData.system as StarmapPosition;
        setSelected(object);
        controls.autoRotate = false;
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Cinematic fly-in: start pulled back along the view axis and ease to the
    // framing position, mimicking the official map's arrival animation.
    const destCam = camera.position.clone();
    const flyStart = destCam.clone().sub(sceneModel.target).multiplyScalar(2.1).add(sceneModel.target);
    camera.position.copy(flyStart);
    const introStart = performance.now();
    const introDuration = 1100;

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visibility.isVisible()) return;
      const t = performance.now() * 0.001;

      const introElapsed = performance.now() - introStart;
      if (introElapsed < introDuration) {
        const k = introElapsed / introDuration;
        const eased = 1 - (1 - k) ** 3; // easeOutCubic
        camera.position.lerpVectors(flyStart, destCam, eased);
      }

      if (level === 'galaxy') nodeGroup.rotation.y = Math.sin(t * 0.08) * 0.015;
      for (const node of animatedNodes) {
        const pulse = 1 + Math.sin(t * 1.8 + node.phase) * 0.045;
        node.mesh.scale.setScalar(node.base * pulse);
        if (node.spin) node.mesh.rotation.y += node.spin * 0.016;
        const glowPulse = 1 + Math.sin(t * 1.5 + node.phase) * 0.08;
        node.glow.scale.setScalar((node.glowBase + node.base * 2.2) * glowPulse);
      }
      for (const comet of jumpComets) {
        const progress = (t * comet.speed + comet.offset) % 1;
        comet.curve.getPointAt(progress, comet.sprite.position);
      }
      if (reticle.visible) {
        reticle.quaternion.copy(camera.quaternion);
        const base = Number(reticle.userData.baseScale ?? 4);
        reticle.scale.setScalar(base * (1 + Math.sin(t * 3.4) * 0.08));
      }
      const labelReferenceDistance = level === 'galaxy' ? 260 : level === 'system' ? 210 : 120;
      for (const label of labels) {
        const distance = camera.position.distanceTo(label.sprite.position);
        const factor = clamp(distance / labelReferenceDistance, 0.42, 1.05);
        label.sprite.scale.set(label.baseWidth * factor, label.baseHeight * factor, 1);
      }
      controls.update();
      composer.render();
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(getThreePixelRatio());
      renderer.setSize(w, h);
      composer.setPixelRatio(getThreePixelRatio());
      composer.setSize(w, h);
      bloomPass.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      sceneApiRef.current = null;
      ro.disconnect();
      visibility.dispose();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      disposeObject3D(scene);
      sphereGeo.dispose();
      glowTexture.dispose();
      flareMainTexture.dispose();
      flareGhostTexture.dispose();
      nebulaTexture.dispose();
      loadedTextures.forEach((texture) => texture.dispose());
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, [level, sceneModel, hiddenLayers, route]);

  // Move/show the selection reticle without rebuilding the scene.
  useEffect(() => {
    const api = sceneApiRef.current;
    if (!api) return;
    const entry = selected ? api.positions.get(objectId(selected)) : null;
    if (!entry) {
      api.reticle.visible = false;
      return;
    }
    api.reticle.position.copy(entry.pos);
    api.reticle.userData.baseScale = entry.radius * 2.6 + 2.2;
    api.reticle.scale.setScalar(entry.radius * 2.6 + 2.2);
    api.reticle.visible = true;
  }, [selected, sceneModel]);

  const selectedStyle = selected ? objectStyle(selected.type) : null;
  const selectedHasChildren = selected ? hasChildren(selected, currentObjects.length > 0 ? currentObjects : objects) : false;
  const selectedSystem = selected && isSystemObject(selected) ? selected : null;
  const selectedCanInspect = selected && !isSystemObject(selected) && (selectedHasChildren || isPlanetLike(selected) || isMoonLike(selected));
  const browserObjects = level === 'galaxy'
    ? systems
    : level === 'system' && activeSystem
      ? systemChildren(activeSystem, objects)
      : activeBody
        ? childrenOf(activeBody, currentObjects.length > 0 ? currentObjects : objects)
        : [];

  const searchTerm = search.trim().toLowerCase();
  const listObjects = browserObjects.filter((object) => {
    const layerKey = layerKeyOf(object.type);
    if (layerKey && hiddenLayers.has(layerKey)) return false;
    if (!searchTerm) return true;
    return (
      object.name.toLowerCase().includes(searchTerm) ||
      (object.system_name ?? '').toLowerCase().includes(searchTerm) ||
      (object.type ?? '').toLowerCase().includes(searchTerm)
    );
  });

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#030712]">
      <div ref={containerRef} className="absolute inset-0" style={{ cursor: 'grab' }} />

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 rounded-sm border border-cyan-900/40 bg-slate-950/70 px-3 py-1.5 backdrop-blur">
        <Compass size={14} className="text-cyan-400" />
        <span className="font-orbitron text-xs uppercase tracking-widest text-slate-200">{levelTitle(level)}</span>
        <span className="font-mono-sc text-[10px] text-cyan-500">{sceneModel.nodes.filter((node) => node.visible !== false).length} objects</span>
        {activeSystem && (
          <span className="font-mono-sc text-[10px] text-slate-500">
            / {activeSystem.name}{activeBody ? ` / ${activeBody.name}` : ''}
          </span>
        )}
      </div>

      <div className="absolute left-3 top-14 z-10 flex flex-wrap gap-2">
        {level !== 'galaxy' && (
          <button type="button" onClick={level === 'body' ? backToSystem : backToGalaxy} className="sci-btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-[10px]">
            <ChevronLeft size={12} />
            {level === 'body' ? 'System' : 'Galaxy'}
          </button>
        )}
        {level !== 'galaxy' && (
          <button type="button" onClick={backToGalaxy} className="sci-btn-ghost px-2.5 py-1.5 text-[10px]">
            Galaxy
          </button>
        )}
        {routableSystems.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setRouteOpen((open) => !open);
              if (!routeFrom) setRouteFrom(normSys(activeSystem?.name) || normSys(routableSystems[0]?.name));
              if (!routeTo) setRouteTo(normSys(routableSystems[routableSystems.length - 1]?.name));
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] ${routeOpen ? 'sci-btn-primary' : 'sci-btn-ghost'}`}
          >
            <Route size={12} />
            Route
          </button>
        )}
      </div>

      {routeOpen && routableSystems.length > 1 && (
        <div className="absolute left-3 top-[6.25rem] z-20 w-[min(92vw,300px)] rounded-sm border border-cyan-900/50 bg-slate-950/92 p-2 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-mono-sc text-[10px] uppercase tracking-widest text-slate-300">
              <Route size={11} className="text-cyan-400" /> Jump route
            </p>
            <button type="button" onClick={() => setRouteOpen(false)} aria-label="Close route planner" className="rounded-sm p-0.5 text-slate-500 hover:text-slate-200">
              <X size={13} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-mono-sc text-[9px] uppercase text-slate-600">From</span>
              <select aria-label="Route origin" className="sci-input h-8 text-xs" value={routeFrom} onChange={(event) => setRouteFrom(event.target.value)}>
                {routableSystems.map((system) => (
                  <option key={`from-${objectId(system)}`} value={normSys(system.name)}>
                    {system.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono-sc text-[9px] uppercase text-slate-600">To</span>
              <select aria-label="Route destination" className="sci-input h-8 text-xs" value={routeTo} onChange={(event) => setRouteTo(event.target.value)}>
                {routableSystems.map((system) => (
                  <option key={`to-${objectId(system)}`} value={normSys(system.name)}>
                    {system.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2">
            {route && route.length > 1 ? (
              <>
                <p className="mb-1 font-mono-sc text-[10px] text-cyan-500">{route.length - 1} jump{route.length > 2 ? 's' : ''}</p>
                <div className="flex flex-wrap items-center gap-1">
                  {route.map((key, index) => {
                    const system = routableSystems.find((item) => normSys(item.name) === key);
                    return (
                      <span key={key} className="flex items-center gap-1">
                        {index > 0 && <ChevronLeft size={10} className="rotate-180 text-slate-600" />}
                        <button
                          type="button"
                          onClick={() => system && enterSystem(system)}
                          className="rounded-sm border border-cyan-900/50 bg-cyan-950/20 px-1.5 py-0.5 font-mono-sc text-[9px] uppercase tracking-wider text-cyan-300 hover:bg-cyan-900/30"
                        >
                          {system?.name ?? key}
                        </button>
                      </span>
                    );
                  })}
                </div>
              </>
            ) : routeFrom && routeTo && routeFrom !== routeTo ? (
              <p className="font-mono-sc text-[10px] text-amber-500">No known jump route.</p>
            ) : (
              <p className="font-mono-sc text-[10px] text-slate-600">Pick two different systems.</p>
            )}
          </div>
        </div>
      )}

      <div className="absolute bottom-3 left-3 z-10 flex w-[min(92vw,340px)] flex-col rounded-sm border border-slate-800/60 bg-slate-950/82 p-2 backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-mono-sc text-[10px] uppercase tracking-widest text-slate-400">
            {level === 'galaxy' ? <Orbit size={11} /> : <Satellite size={11} />}
            {level === 'galaxy' ? 'Systems' : level === 'system' ? 'System contents' : 'Local objects'}
          </p>
          <span className="font-mono-sc text-[10px] text-cyan-600">{listObjects.length}</span>
        </div>
        <div className="relative mb-2">
          <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={level === 'galaxy' ? 'Search systems…' : 'Search objects…'}
            aria-label="Search starmap"
            className="sci-input h-8 w-full pl-7 pr-7 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-500 hover:text-slate-200"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="max-h-40 space-y-1 overflow-y-auto pr-1 sm:max-h-56">
          {listObjects.length === 0 ? (
            <p className="py-2 text-xs text-slate-600">{searchTerm ? 'No matching objects.' : 'No objects at this level.'}</p>
          ) : (
            listObjects.map((object) => {
              const style = objectStyle(object.type);
              const canInspect = isSystemObject(object) || hasChildren(object, currentObjects) || isPlanetLike(object) || isMoonLike(object);
              return (
                <button
                  type="button"
                  key={objectId(object)}
                  onClick={() => (isSystemObject(object) && level === 'galaxy' ? enterSystem(object) : setSelected(object))}
                  className="flex w-full items-center justify-between gap-2 rounded-sm border border-transparent px-2 py-1.5 text-left transition-colors hover:border-cyan-900/60 hover:bg-cyan-950/20"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: style.css }} />
                    <span className="min-w-0">
                      <span className="block truncate font-mono-sc text-xs text-slate-300">{object.name}</span>
                      <span className="font-mono-sc text-[9px] uppercase tracking-widest" style={{ color: style.css }}>
                        {style.label}
                      </span>
                    </span>
                  </span>
                  {canInspect && (
                    <span className="shrink-0 font-mono-sc text-[9px] text-cyan-600">
                      {isSystemObject(object) && level === 'galaxy' ? 'enter' : 'inspect'}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="pointer-events-auto absolute right-3 bottom-3 z-10 flex w-[min(48vw,180px)] flex-col gap-1 rounded-sm border border-slate-800/60 bg-slate-950/82 p-2 backdrop-blur sm:w-44">
        <p className="mb-0.5 flex items-center gap-1.5 font-mono-sc text-[10px] uppercase tracking-widest text-slate-400">
          <Layers size={11} /> Layers
        </p>
        {MAP_LAYERS.map((layer) => {
          const active = !hiddenLayers.has(layer.key);
          return (
            <button
              type="button"
              key={layer.key}
              onClick={() => toggleLayer(layer.key)}
              className={`flex items-center justify-between gap-2 rounded-sm px-1.5 py-1 text-left font-mono-sc text-[10px] uppercase tracking-wider transition-colors ${active ? 'text-slate-300 hover:bg-cyan-950/20' : 'text-slate-600 hover:bg-slate-900/40'}`}
            >
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: active ? layer.css : '#334155' }} />
                {layer.label}
              </span>
              {active ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>
          );
        })}
      </div>

      {level === 'galaxy' && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 flex-wrap justify-center gap-x-3 gap-y-1 rounded-sm border border-slate-800/60 bg-slate-950/70 px-3 py-2 backdrop-blur lg:flex">
          {FACTIONS.map((f) => (
            <span key={f.key} className="flex items-center gap-1.5 font-mono-sc text-[10px] uppercase tracking-wider text-slate-400">
              <span className="size-2 rounded-full" style={{ backgroundColor: f.css }} />
              {f.label}
            </span>
          ))}
        </div>
      )}

      <div className="pointer-events-none absolute right-3 top-3 hidden rounded-sm border border-slate-800/60 bg-slate-950/70 px-3 py-1.5 font-mono-sc text-[10px] text-slate-500 backdrop-blur sm:block">
        Drag: rotate · Scroll: zoom · Click object
      </div>

      {selected && selectedStyle && (
        <div className="absolute right-3 top-14 z-20 w-[min(92vw,340px)] overflow-hidden rounded-sm border border-cyan-900/50 bg-slate-950/92 backdrop-blur sm:top-12">
          <div className="flex items-start justify-between gap-2 border-b border-slate-800/70 bg-slate-900/50 px-3 py-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-mono-sc text-[9px] uppercase tracking-widest" style={{ color: selectedStyle.css }}>
                <Globe2 size={11} />
                {selectedStyle.label}
              </p>
              <h3 className="truncate font-orbitron text-base text-slate-100">{selected.name}</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="shrink-0 rounded-sm p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-2 px-3 py-3">
            {starmapImage(selected) && (
              <img
                src={starmapImage(selected)!}
                alt=""
                className="h-28 w-full rounded-sm border border-slate-800/60 object-cover sm:h-32"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-sm border px-1.5 py-0.5 font-mono-sc text-[9px] uppercase tracking-widest"
                style={{ borderColor: `${factionStyle(selected.faction_name).css}55`, color: factionStyle(selected.faction_name).css }}
              >
                {selected.faction_name ?? 'Unclaimed'}
              </span>
              {selected.system_code && <span className="font-mono-sc text-[10px] text-slate-500">{selected.system_code}</span>}
              {selected.parent_id && <span className="font-mono-sc text-[10px] text-slate-600">parent {selected.parent_id}</span>}
            </div>
            {selected.description && (
              <p className="max-h-28 overflow-y-auto text-xs leading-relaxed text-slate-400 sm:max-h-40">{selected.description}</p>
            )}
            <dl className="grid grid-cols-2 gap-2 pt-1">
              {selected.star_type && (
                <div>
                  <dt className="font-mono-sc text-[9px] uppercase text-slate-600">Star</dt>
                  <dd className="text-xs text-slate-300">{selected.star_type}</dd>
                </div>
              )}
              {selected.economy && (
                <div>
                  <dt className="font-mono-sc text-[9px] uppercase text-slate-600">Economy</dt>
                  <dd className="text-xs text-slate-300">{selected.economy}</dd>
                </div>
              )}
              {selected.danger && (
                <div>
                  <dt className="font-mono-sc text-[9px] uppercase text-slate-600">Danger</dt>
                  <dd className="text-xs text-slate-300">{selected.danger}</dd>
                </div>
              )}
              {selected.population && (
                <div>
                  <dt className="font-mono-sc text-[9px] uppercase text-slate-600">Population</dt>
                  <dd className="text-xs text-slate-300">{selected.population}</dd>
                </div>
              )}
              {(() => {
                const count = childrenOf(selected, currentObjects.length > 0 ? currentObjects : objects).length;
                return count > 0 ? (
                  <div>
                    <dt className="font-mono-sc text-[9px] uppercase text-slate-600">Sub-objects</dt>
                    <dd className="text-xs text-slate-300">{count}</dd>
                  </div>
                ) : null;
              })()}
              {(() => {
                const coord = coordinateOf(selected);
                return coord ? (
                  <div className="col-span-2">
                    <dt className="font-mono-sc text-[9px] uppercase text-slate-600">Coordinates</dt>
                    <dd className="font-mono-sc text-[10px] text-slate-400">
                      {coord.x.toFixed(2)}, {coord.y.toFixed(2)}, {coord.z.toFixed(2)}
                    </dd>
                  </div>
                ) : null;
              })()}
            </dl>
            {(() => {
              const jumps = jumpPointTargets(selected);
              return jumps.length > 0 ? (
                <div className="pt-1">
                  <p className="mb-1 font-mono-sc text-[9px] uppercase text-slate-600">Jump destinations</p>
                  <div className="flex flex-wrap gap-1">
                    {jumps.map((dest) => (
                      <span
                        key={dest}
                        className="rounded-sm border border-cyan-900/50 bg-cyan-950/20 px-1.5 py-0.5 font-mono-sc text-[9px] uppercase tracking-wider text-cyan-400"
                      >
                        {dest}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
            <div className="flex flex-wrap gap-2 pt-1">
              {selectedSystem && (
                <button type="button" onClick={() => enterSystem(selectedSystem)} className="sci-btn-primary flex items-center gap-1.5 px-3 py-2 text-xs">
                  <Orbit size={13} />
                  Enter system
                </button>
              )}
              {selectedCanInspect && (
                <button type="button" onClick={() => inspectBody(selected)} className="sci-btn-primary flex items-center gap-1.5 px-3 py-2 text-xs">
                  <MapPin size={13} />
                  Inspect body
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StarmapGalaxy() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['starmap.positions'],
    queryFn: () => api.starmap.positions(),
    staleTime: 1000 * 60 * 30,
  });

  const starmapObjects = useMemo(() => {
    const response = data as StarmapPositionsResponse | undefined;
    if (Array.isArray(response)) return response;
    if (response && Array.isArray(response.data)) return response.data as StarmapPosition[];
    return [];
  }, [data]);
  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#030712]">
        <div className="flex items-center gap-2 font-mono-sc text-xs uppercase tracking-widest text-cyan-600">
          <Loader2 size={16} className="animate-spin" />
          Loading RSI starmap objects...
        </div>
      </div>
    );
  }

  if (error || starmapObjects.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#030712]">
        <div className="flex flex-col items-center gap-2 text-center font-mono-sc text-xs text-slate-500">
          <Compass size={28} className="text-slate-700" />
          {error ? 'Unable to load the galactic map.' : 'No RSI starmap objects available.'}
        </div>
      </div>
    );
  }

  return <StarmapScene objects={starmapObjects} />;
}
