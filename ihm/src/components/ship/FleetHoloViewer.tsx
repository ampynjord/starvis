'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CTMLoader } from '@/lib/CTMLoader';

export interface FleetShip {
  id: number;
  shipUuid: string;
  name: string;
  className: string;
  manufacturerCode?: string | null;
  role?: string | null;
  career?: string | null;
  sizeX?: number | null;
  sizeY?: number | null;
  sizeZ?: number | null;
  crewSize?: number | null;
  scmSpeed?: number | null;
  isConceptOnly?: boolean;
  thumbnailUrl?: string | null;
  ctmUrl: string | null;
  declaredBy?: string | null;
}

interface Props {
  ships: FleetShip[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

// ── Materials ──────────────────────────────────────────────────────────────────
const COLOR_DEFAULT  = 0x0d7a90;
const COLOR_SELECTED = 0x20e4ff;
const EMISS_DEFAULT  = 0x020c12;
const COLOR_OUTLINE  = 0x00d4ff;
const COLOR_RING     = 0x00c8f0;
const MIN_SHIP_GAP   = 8;
const SHIP_GAP_RATIO = 0.18;

export function FleetHoloViewer({ ships, selectedId, onSelect }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef      = useRef<number>(0);
  const clockRef      = useRef(new THREE.Clock());
  const onSelectRef   = useRef(onSelect);
  const [loadedCount, setLoadedCount] = useState(0);

  // Keep onSelect ref current without rebuilding the scene
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || ships.length === 0) return;
    const container = containerRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    // ── Scene ──────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06101a);

    // Same lighting as single HoloViewer
    scene.add(new THREE.AmbientLight(0x0a2535, 2.5));
    const key = new THREE.DirectionalLight(0x60d8ef, 4.5);
    key.position.set(0.4, 1.0, 0.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x1060a0, 0.6);
    fill.position.set(-1, 0.2, -0.8);
    scene.add(fill);

    // ── Renderer ───────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Camera ─────────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 500000);

    // ── Controls ───────────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.3;
    controls.enablePan = true;

    // ── Per-ship state ─────────────────────────────────────────────────────────
    type ShipEntry = {
      ship: FleetShip;
      root: THREE.Group;          // world-space pivot (drag target)
      inner: THREE.Group | null;  // rotation pivot with loaded mesh
      meshes: THREE.Mesh[];
      outlineMeshes: THREE.Mesh[];
      ring: THREE.Mesh | null;
      radius: number;
      halfWidth: number;
      loaded: boolean;
    };
    const entries: ShipEntry[] = ships.map((ship) => ({
      ship, root: new THREE.Group(), inner: null,
      meshes: [], outlineMeshes: [], ring: null,
      radius: 10, halfWidth: 10, loaded: false,
    }));

    entries.forEach((e) => {
      e.root.userData.fleetItemId = e.ship.id;
      scene.add(e.root);
    });

    // ── Material factory ────────────────────────────────────────────────────────
    const makeMat = (color: number, emissive: number) =>
      new THREE.MeshPhongMaterial({
        color, emissive, specular: 0x66ddff, shininess: 55,
        side: THREE.DoubleSide,
      });

    const makeOutlineMat = () =>
      new THREE.MeshBasicMaterial({
        color: COLOR_OUTLINE,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
      });

    // ── Grid (dynamic) ─────────────────────────────────────────────────────────
    let gridHelper: THREE.GridHelper | null = null;
    const updateGrid = () => {
      if (gridHelper) scene.remove(gridHelper);
      const loaded = entries.filter((e) => e.loaded && e.inner);
      if (loaded.length === 0) return;
      const maxR = Math.max(...entries.map((e) => e.radius));
      const totalSpan = getTotalSpan();
      const size = Math.max(totalSpan * 1.6, maxR * 8);
      const divs = Math.max(10, Math.round(size / (maxR / 2)));

      // Find floor Y from all loaded ships
      let minY = 0;
      loaded.forEach((e) => {
        const box = new THREE.Box3().setFromObject(e.root);
        if (box.min.y < minY) minY = box.min.y;
      });

      gridHelper = new THREE.GridHelper(size, divs, 0x1a5472, 0x0a2233);
      gridHelper.position.y = minY - maxR * 0.04;
      scene.add(gridHelper);
    };

    // ── Position all ships in a row without overlap ───────────────────────────
    const getGap = () => Math.max(MIN_SHIP_GAP, Math.max(...entries.map((e) => e.halfWidth)) * SHIP_GAP_RATIO);

    const getTotalSpan = () => {
      let span = 0;
      const gap = getGap();
      entries.forEach((e, i) => {
        span += e.halfWidth * 2;
        if (i < entries.length - 1) span += gap;
      });
      return span;
    };

    const repositionShips = () => {
      const totalSpan = getTotalSpan();
      const gap = getGap();
      let x = -totalSpan / 2;
      entries.forEach((e) => {
        e.root.position.x = x + e.halfWidth;
        e.root.position.z = 0;
        x += e.halfWidth * 2 + gap;
      });
      // Move rings to ship positions
      entries.forEach((e) => { if (e.ring) e.ring.position.x = 0; });
      updateGrid();
      fitCamera();
    };

    const fitCamera = () => {
      const maxR = Math.max(...entries.map((e) => e.radius));
      const totalSpan = getTotalSpan();
      const dist = Math.max(totalSpan, maxR * 3) * 1.2;
      const height = maxR * 0.5;
      camera.near = dist * 0.001;
      camera.far  = dist * 200;
      camera.updateProjectionMatrix();
      // Position camera like the single HoloViewer, but pulled back for fleet width
      camera.position.set(0, height, dist);
      controls.target.set(0, 0, 0);
      controls.minDistance = maxR * 0.3;
      controls.maxDistance = dist * 10;
      controls.update();
    };

    // ── Load CTM models ────────────────────────────────────────────────────────
    const holoMat = new THREE.MeshPhongMaterial({
      color: 0x1aa8c0, emissive: 0x041828,
      specular: 0x66ddff, shininess: 55, side: THREE.DoubleSide,
    });

    const loader = new CTMLoader();
    let loadedSoFar = 0;
    const CARD_H = 14;
    const CARD_W = CARD_H * 1.78;

    const markLoaded = (entry: ShipEntry, radius: number, halfWidth: number) => {
      entry.radius = radius;
      entry.halfWidth = halfWidth;
      entry.loaded = true;
      loadedSoFar++;
      setLoadedCount(loadedSoFar);
      repositionShips();
    };

    const addFallbackCard = (entry: ShipEntry, texture: THREE.Texture | null) => {
      const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
      const frontMat = texture
        ? new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.85, side: THREE.FrontSide })
        : new THREE.MeshBasicMaterial({ color: 0x0d3040, transparent: true, opacity: 0.7 });
      const front = new THREE.Mesh(geo, frontMat);
      front.userData.fleetItemId = entry.ship.id;

      const backMat = new THREE.MeshBasicMaterial({ color: 0x071820, transparent: true, opacity: 0.4, side: THREE.BackSide });
      const back = new THREE.Mesh(geo, backMat);

      const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(CARD_W + 0.3, CARD_H + 0.3));
      const borderMat = new THREE.LineBasicMaterial({ color: 0x1aa8c0, transparent: true, opacity: 0.7 });
      const border = new THREE.LineSegments(borderGeo, borderMat);

      const card = new THREE.Group();
      card.add(front, back, border);
      card.userData.fleetItemId = entry.ship.id;
      entry.root.add(card);
      entry.meshes.push(front);
      markLoaded(entry, CARD_W / 2, CARD_W / 2);
    };

    const loadFallbackCard = (entry: ShipEntry) => {
      if (!entry.ship.thumbnailUrl) {
        addFallbackCard(entry, null);
        return;
      }
      new THREE.TextureLoader().load(
        entry.ship.thumbnailUrl,
        (tex) => addFallbackCard(entry, tex),
        undefined,
        () => addFallbackCard(entry, null),
      );
    };

    entries.forEach((entry) => {
      if (!entry.ship.ctmUrl) {
        // Concept / no-model ship — holographic card with thumbnail texture
        const CARD_H = 14;
        const CARD_W = CARD_H * 1.78; // 16:9-ish

        const buildCard = (texture: THREE.Texture | null) => {
          const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
          // Front face: thumbnail (or solid holo color)
          const frontMat = texture
            ? new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.85, side: THREE.FrontSide })
            : new THREE.MeshBasicMaterial({ color: 0x0d3040, transparent: true, opacity: 0.7 });
          const front = new THREE.Mesh(geo, frontMat);
          front.userData.fleetItemId = entry.ship.id;

          // Back: subtle cyan holo glow
          const backMat = new THREE.MeshBasicMaterial({ color: 0x071820, transparent: true, opacity: 0.4, side: THREE.BackSide });
          const back = new THREE.Mesh(geo, backMat);

          // Border frame (line segments around card)
          const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(CARD_W + 0.3, CARD_H + 0.3));
          const borderMat = new THREE.LineBasicMaterial({ color: 0x1aa8c0, transparent: true, opacity: 0.7 });
          const border = new THREE.LineSegments(borderGeo, borderMat);

          const card = new THREE.Group();
          card.add(front, back, border);
          card.userData.fleetItemId = entry.ship.id;
          card.rotation.y = 0;
          return { card, meshes: [front] as THREE.Mesh[] };
        };

        if (entry.ship.thumbnailUrl) {
          const texLoader = new THREE.TextureLoader();
          texLoader.load(
            entry.ship.thumbnailUrl,
            (tex) => {
              const { card, meshes } = buildCard(tex);
              entry.root.add(card);
              entry.meshes.push(...meshes);
              entry.radius = CARD_W / 2;
              entry.halfWidth = CARD_W / 2;
              entry.loaded = true;
              loadedSoFar++;
              setLoadedCount(loadedSoFar);
              repositionShips();
            },
            undefined,
            () => {
              const { card, meshes } = buildCard(null);
              entry.root.add(card);
              entry.meshes.push(...meshes);
              entry.radius = CARD_W / 2;
              entry.halfWidth = CARD_W / 2;
              entry.loaded = true;
              loadedSoFar++;
              setLoadedCount(loadedSoFar);
              repositionShips();
            },
          );
        } else {
          const { card, meshes } = buildCard(null);
          entry.root.add(card);
          entry.meshes.push(...meshes);
          entry.radius = CARD_W / 2;
          entry.halfWidth = CARD_W / 2;
          entry.loaded = true;
          loadedSoFar++;
          setLoadedCount(loadedSoFar);
          repositionShips();
        }
        return;
      }

      loader.load(
        `/api/v1/ships/${entry.ship.shipUuid}/model/file`,
        (geometry) => {
          const mat = makeMat(COLOR_DEFAULT, EMISS_DEFAULT);
          const mesh = new THREE.Mesh(geometry, mat);
          mesh.userData.fleetItemId = entry.ship.id;

          // Outline mesh (BackSide, slightly scaled up, hidden by default)
          const outlineMat = makeOutlineMat();
          const outlineMesh = new THREE.Mesh(geometry, outlineMat);
          outlineMesh.scale.setScalar(1.04);
          outlineMesh.userData.isOutline = true;

          const inner = new THREE.Group();
          inner.rotation.set(0, 0, 0);
          inner.add(mesh);
          inner.add(outlineMesh);

          // Center on origin
          inner.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(inner);
          const center = new THREE.Vector3();
          box.getCenter(center);
          inner.position.sub(center);

          // Get bounding sphere
          inner.updateMatrixWorld(true);
          const box2 = new THREE.Box3().setFromObject(inner);
          const sphere = new THREE.Sphere();
          box2.getBoundingSphere(sphere);
          const r = sphere.radius;
          const width = box2.max.x - box2.min.x;

          entry.inner = inner;
          entry.meshes.push(mesh);
          entry.outlineMeshes.push(outlineMesh);
          entry.radius = r;
          entry.halfWidth = Math.max(width / 2, r * 0.35);
          entry.root.add(inner);

          // Selection ring (torus)
          const ringGeo = new THREE.TorusGeometry(r * 0.85, r * 0.015, 8, 64);
          const ringMat = new THREE.MeshBasicMaterial({
            color: COLOR_RING, transparent: true, opacity: 0,
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = box2.min.y;
          ring.userData.isRing = true;
          entry.ring = ring;
          entry.root.add(ring);

          entry.loaded = true;
          loadedSoFar++;
          setLoadedCount(loadedSoFar);
          repositionShips();
        },
        undefined,
        () => {
          loadFallbackCard(entry);
        },
      );
    });

    // ── Raycasting ─────────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();
    let mouseStart  = { x: 0, y: 0 };
    let isDragging  = false;
    let dragEntry: ShipEntry | null = null;
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragPoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();

    const getHitEntry = (clientX: number, clientY: number): ShipEntry | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const meshes: THREE.Object3D[] = [];
      entries.forEach((e) => e.meshes.forEach((m) => meshes.push(m)));
      const hits = raycaster.intersectObjects(meshes, true);
      if (!hits.length) return null;
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        if (obj.userData.fleetItemId !== undefined) {
          return entries.find((e) => e.ship.id === obj!.userData.fleetItemId) ?? null;
        }
        obj = obj.parent;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      mouseStart = { x: e.clientX, y: e.clientY };
      isDragging = false;
      const entry = getHitEntry(e.clientX, e.clientY);
      if (entry) {
        dragEntry = entry;
        controls.enabled = false;

        // Compute drag offset
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        dragPlane.constant = -entry.root.position.y;
        raycaster.ray.intersectPlane(dragPlane, dragPoint);
        dragOffset.copy(entry.root.position).sub(dragPoint);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - mouseStart.x;
      const dy = e.clientY - mouseStart.y;
      if (Math.hypot(dx, dy) > 4) isDragging = true;

      if (dragEntry && isDragging) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        dragPlane.constant = -dragEntry.root.position.y;
        raycaster.ray.intersectPlane(dragPlane, dragPoint);
        dragEntry.root.position.x = dragPoint.x + dragOffset.x;
        dragEntry.root.position.z = dragPoint.z + dragOffset.z;
      }
    };

    const onPointerUp = (_e: PointerEvent) => {
      controls.enabled = true;
      if (!isDragging && dragEntry) {
        onSelectRef.current(dragEntry.ship.id);
      }
      dragEntry = null;
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup',   onPointerUp);
    const preventPageWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    renderer.domElement.addEventListener('wheel', preventPageWheel, { passive: false });

    // ── Render loop ────────────────────────────────────────────────────────────
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const t = clockRef.current.getElapsedTime();

      // Animate selected ship
      entries.forEach((entry) => {
        const isSelected = entry.ship.id === selectedIdRef.current;

        // Mesh material
        entry.meshes.forEach((m) => {
          if (m.material instanceof THREE.MeshPhongMaterial && !m.userData.isOutline) {
            m.material.color.setHex(isSelected ? COLOR_SELECTED : COLOR_DEFAULT);
            m.material.emissive.setHex(
              isSelected ? 0x082a3a + Math.round(Math.sin(t * 3) * 0.15 * 0x050a10) : EMISS_DEFAULT
            );
          }
        });

        // Outline
        entry.outlineMeshes.forEach((m) => {
          if (m.material instanceof THREE.MeshBasicMaterial) {
            m.material.opacity = isSelected ? 0.55 + Math.sin(t * 4) * 0.2 : 0;
            m.scale.setScalar(isSelected ? 1.04 + Math.sin(t * 4) * 0.005 : 1.04);
          }
        });

        // Ring
        if (entry.ring && entry.ring.material instanceof THREE.MeshBasicMaterial) {
          entry.ring.material.opacity = isSelected ? 0.6 + Math.sin(t * 5) * 0.25 : 0;
          entry.ring.rotation.z = t * 1.2;
          if (isSelected) {
            const pulse = 1 + Math.sin(t * 3) * 0.06;
            entry.ring.scale.set(pulse, 1, pulse);
          }
        }
      });

      controls.update();
      renderer.render(scene, camera);
    };

    // We need a ref to track selectedId reactively in the loop
    const selectedIdRef = { current: selectedId };
    // Patch: we'll update this ref when the outer selectedId changes via a shared object
    (renderer.domElement as any).__selectedIdRef = selectedIdRef;

    animate();

    // ── Resize ─────────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup',   onPointerUp);
      renderer.domElement.removeEventListener('wheel', preventPageWheel);
      controls.dispose();
      holoMat.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      rendererRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ships]);

  // ── Sync selectedId into running animation loop ───────────────────────────
  useEffect(() => {
    const canvas = rendererRef.current?.domElement;
    if (canvas) {
      const ref = (canvas as any).__selectedIdRef;
      if (ref) ref.current = selectedId;
    }
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ cursor: 'grab' }}
    >
      {loadedCount < ships.length && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-slate-900/80 border border-cyan-800/40 rounded-sm px-3 py-1 text-[10px] font-mono-sc text-cyan-600 animate-pulse pointer-events-none">
          Loading {loadedCount}/{ships.length}…
        </div>
      )}
      <div className="absolute bottom-2 right-3 text-[9px] text-slate-700 font-mono-sc pointer-events-none select-none">
        Click: select · Drag ship: move · Scroll: zoom
      </div>
    </div>
  );
}
