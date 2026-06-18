'use client';

import { useQuery } from '@tanstack/react-query';
import { Compass, Globe2, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createVisibilityTracker, disposeObject3D, getThreePixelRatio } from '@/lib/three-performance';
import { api } from '@/services/api';
import type { StarmapPosition } from '@/types/api';

// ── Faction palette (hex for THREE, tailwind-ish tones) ─────────────────────────
interface FactionStyle {
  key: string;
  label: string;
  color: number;
  css: string;
}

const FACTIONS: FactionStyle[] = [
  { key: 'uee', label: 'UEE', color: 0x38bdf8, css: '#38bdf8' },
  { key: 'banu', label: 'Banu', color: 0xf59e0b, css: '#f59e0b' },
  { key: 'xian', label: "Xi'an", color: 0x34d399, css: '#34d399' },
  { key: 'vanduul', label: 'Vanduul', color: 0xef4444, css: '#ef4444' },
  { key: 'tevarin', label: 'Tevarin', color: 0xa855f7, css: '#a855f7' },
  { key: 'unclaimed', label: 'Unclaimed', color: 0x94a3b8, css: '#94a3b8' },
];

function factionStyle(faction: string | null): FactionStyle {
  const f = (faction ?? '').toLowerCase();
  if (f.includes('uee') || f.includes('united empire') || f.includes('earth')) return FACTIONS[0];
  if (f.includes('banu')) return FACTIONS[1];
  if (f.includes('xi') || f.includes('xian')) return FACTIONS[2];
  if (f.includes('vanduul')) return FACTIONS[3];
  if (f.includes('tevarin')) return FACTIONS[4];
  return FACTIONS[5];
}

// ── Sprite textures (cached) ────────────────────────────────────────────────────
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

function makeLabelSprite(text: string, css: string): THREE.Sprite {
  const padding = 8;
  const font = '600 30px "Rajdhani", system-ui, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  if (measure) measure.font = font;
  const textWidth = measure ? measure.measureText(text).width : text.length * 16;
  const w = Math.ceil(textWidth + padding * 2);
  const h = 44;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(2,6,23,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = css;
    ctx.fillText(text, padding, h / 2 + 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((w / h) * 4, 4, 1);
  return sprite;
}

function StarmapScene({ systems }: { systems: StarmapPosition[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<StarmapPosition | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || systems.length === 0) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030712);
    scene.fog = new THREE.FogExp2(0x030712, 0.0016);

    scene.add(new THREE.AmbientLight(0x4060a0, 1.4));
    const key = new THREE.PointLight(0x66d8ff, 1.2, 0, 0);
    key.position.set(80, 120, 80);
    scene.add(key);

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(getThreePixelRatio());
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 6000);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.9;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;

    const visibility = createVisibilityTracker(container);

    // ── Compute scaled positions ─────────────────────────────────────────────
    const valid = systems.filter((s) => s.coordinates && Number.isFinite(s.coordinates.x));
    const center = new THREE.Vector3();
    for (const s of valid) {
      center.add(new THREE.Vector3(s.coordinates!.x, s.coordinates!.y, s.coordinates!.z));
    }
    center.divideScalar(Math.max(1, valid.length));

    let maxDist = 1;
    for (const s of valid) {
      const d = new THREE.Vector3(s.coordinates!.x, s.coordinates!.y, s.coordinates!.z).sub(center).length();
      if (d > maxDist) maxDist = d;
    }
    const SCALE = 140 / maxDist;
    const posOf = (s: StarmapPosition) =>
      new THREE.Vector3(s.coordinates!.x, s.coordinates!.y, s.coordinates!.z).sub(center).multiplyScalar(SCALE);

    // ── Background starfield ─────────────────────────────────────────────────
    const starCount = 2200;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 600 + Math.random() * 1400;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starField = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0x8aa0c0, size: 2, sizeAttenuation: true, transparent: true, opacity: 0.55 }),
    );
    scene.add(starField);

    // ── System nodes ─────────────────────────────────────────────────────────
    const glowTexture = makeGlowTexture();
    const sphereGeo = new THREE.SphereGeometry(1.6, 20, 20);
    const pickables: THREE.Mesh[] = [];
    const nodeGroup = new THREE.Group();

    for (const s of valid) {
      const style = factionStyle(s.faction_name);
      const p = posOf(s);

      const mat = new THREE.MeshStandardMaterial({
        color: style.color,
        emissive: style.color,
        emissiveIntensity: 0.9,
        roughness: 0.35,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(p);
      mesh.userData.system = s;
      pickables.push(mesh);
      nodeGroup.add(mesh);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: style.color,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.scale.set(12, 12, 1);
      glow.position.copy(p);
      nodeGroup.add(glow);

      const label = makeLabelSprite(s.name, style.css);
      label.position.copy(p).add(new THREE.Vector3(0, 4.5, 0));
      nodeGroup.add(label);
    }
    scene.add(nodeGroup);

    // ── Camera framing ───────────────────────────────────────────────────────
    camera.position.set(120, 90, 200);
    controls.minDistance = 30;
    controls.maxDistance = 900;
    controls.target.set(0, 0, 0);
    controls.update();

    // ── Picking ──────────────────────────────────────────────────────────────
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
        if (hovered) (hovered.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
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
        const s = (hit.object as THREE.Mesh).userData.system as StarmapPosition;
        setSelected(s);
        controls.autoRotate = false;
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // ── Render loop ──────────────────────────────────────────────────────────
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visibility.isVisible()) return;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── Resize ───────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(getThreePixelRatio());
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      visibility.dispose();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      disposeObject3D(scene);
      glowTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, [systems]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#030712]">
      <div ref={containerRef} className="absolute inset-0" style={{ cursor: 'grab' }} />

      {/* Title + count */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-sm border border-cyan-900/40 bg-slate-950/70 px-3 py-1.5 backdrop-blur">
        <Compass size={14} className="text-cyan-400" />
        <span className="font-orbitron text-xs uppercase tracking-widest text-slate-200">Galactic Map</span>
        <span className="font-mono-sc text-[10px] text-cyan-500">{systems.length} systems</span>
      </div>

      {/* Faction legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-sm border border-slate-800/60 bg-slate-950/70 px-3 py-2 backdrop-blur">
        {FACTIONS.map((f) => (
          <span key={f.key} className="flex items-center gap-1.5 font-mono-sc text-[10px] uppercase tracking-wider text-slate-400">
            <span className="size-2 rounded-full" style={{ backgroundColor: f.css }} />
            {f.label}
          </span>
        ))}
      </div>

      {/* Controls hint */}
      <div className="pointer-events-none absolute bottom-3 right-3 hidden rounded-sm border border-slate-800/60 bg-slate-950/70 px-3 py-1.5 font-mono-sc text-[10px] text-slate-500 backdrop-blur sm:block">
        Drag: rotate · Scroll: zoom · Click a star
      </div>

      {/* Selected system panel */}
      {selected && (
        <div className="absolute right-3 top-3 w-[min(88vw,320px)] overflow-hidden rounded-sm border border-cyan-900/50 bg-slate-950/90 backdrop-blur">
          <div className="flex items-start justify-between gap-2 border-b border-slate-800/70 bg-slate-900/50 px-3 py-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-mono-sc text-[9px] uppercase tracking-widest text-cyan-400">
                <Globe2 size={11} />
                {selected.type === 'system' ? 'Star system' : selected.type}
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
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-sm border px-1.5 py-0.5 font-mono-sc text-[9px] uppercase tracking-widest"
                style={{ borderColor: `${factionStyle(selected.faction_name).css}55`, color: factionStyle(selected.faction_name).css }}
              >
                {selected.faction_name ?? 'Unclaimed'}
              </span>
              {selected.system_code && (
                <span className="font-mono-sc text-[10px] text-slate-500">{selected.system_code}</span>
              )}
            </div>
            {selected.description && (
              <p className="max-h-40 overflow-y-auto text-xs leading-relaxed text-slate-400">{selected.description}</p>
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
            </dl>
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

  const systems = useMemo(
    () =>
      (data ?? []).filter(
        (s) => s.type === 'system' && s.coordinates != null && Number.isFinite(s.coordinates.x),
      ),
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#030712]">
        <div className="flex items-center gap-2 font-mono-sc text-xs uppercase tracking-widest text-cyan-600">
          <Loader2 size={16} className="animate-spin" />
          Loading star systems…
        </div>
      </div>
    );
  }

  if (error || systems.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#030712]">
        <div className="flex flex-col items-center gap-2 text-center font-mono-sc text-xs text-slate-500">
          <Compass size={28} className="text-slate-700" />
          {error ? 'Unable to load the galactic map.' : 'No star systems with coordinates available.'}
        </div>
      </div>
    );
  }

  return <StarmapScene systems={systems} />;
}
