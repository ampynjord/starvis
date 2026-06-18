'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CTMLoader } from '@/lib/CTMLoader';
import { createVisibilityTracker, disposeObject3D, getThreePixelRatio } from '@/lib/three-performance';
import { loadCachedGeometry } from '@/components/holo/ctm-geometry-cache';
import {
  COLOR_DEFAULT,
  COLOR_OUTLINE,
  COLOR_RING,
  COLOR_SELECTED,
  EMISS_DEFAULT,
  FALLBACK_SHIP_LENGTH_M,
  FLEET_MODEL_FRONT_ROTATION_Y,
  MIN_SHIP_GAP,
  SHIP_GAP_RATIO,
  TACTICAL_FRONT_DIRECTION,
  teamColor,
  WORLD_UNITS_PER_METER,
} from '@/components/holo/fleet-tactics-constants';
import type { FleetShip, TacticalMarker, TacticalVector } from '@/components/holo/fleet-tactics-types';
import { API_BASE } from '@/utils/constants';
export type { FleetShip, TacticalMarker, TacticalVector } from '@/components/holo/fleet-tactics-types';

interface Props {
  ships: FleetShip[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  layoutMode?: 'positions' | 'row';
  onPositionChange?: (id: number, position: { gridX: number; gridZ: number }) => void;
  onGroupPositionChange?: (updates: Array<{ id: number; gridX: number; gridZ: number }>) => void;
  tacticalMarkers?: TacticalMarker[];
  selectedMarkerId?: string | null;
  onMarkerSelect?: (id: string) => void;
  onMarkerPositionChange?: (id: string, position: { gridX: number; gridZ: number }) => void;
  tacticalVectors?: TacticalVector[];
  selectedVectorId?: string | null;
  onVectorSelect?: (id: string) => void;
  onVectorChange?: (id: string, vector: Pick<TacticalVector, 'endX' | 'endZ' | 'controlX' | 'controlZ'>) => void;
  onVectorCreate?: (vector: Omit<TacticalVector, 'id'>) => void;
}

// ── Materials ──────────────────────────────────────────────────────────────────
interface CameraViewState {
  position: THREE.Vector3;
  target: THREE.Vector3;
  userHasMoved: boolean;
}

export function FleetTacticsHoloViewer({
  ships,
  selectedId,
  onSelect,
  layoutMode = 'positions',
  onPositionChange,
  onGroupPositionChange,
  tacticalMarkers = [],
  selectedMarkerId = null,
  onMarkerSelect,
  onMarkerPositionChange,
  tacticalVectors = [],
  selectedVectorId = null,
  onVectorSelect,
  onVectorChange,
  onVectorCreate,
}: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef      = useRef<number>(0);
  const clockRef      = useRef(new THREE.Clock());
  const onSelectRef   = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);
  const selectedMarkerIdRef = useRef(selectedMarkerId);
  const selectedVectorIdRef = useRef(selectedVectorId);
  const onPositionChangeRef = useRef(onPositionChange);
  const onMarkerSelectRef = useRef(onMarkerSelect);
  const onMarkerPositionChangeRef = useRef(onMarkerPositionChange);
  const onVectorSelectRef = useRef(onVectorSelect);
  const onVectorChangeRef = useRef(onVectorChange);
  const onVectorCreateRef = useRef(onVectorCreate);
  const onGroupPositionChangeRef = useRef(onGroupPositionChange);
  const syncMarkersRef = useRef<((markers: TacticalMarker[]) => void) | null>(null);
  const syncShipPositionsRef = useRef<((ships: FleetShip[]) => void) | null>(null);
  const cameraViewRef = useRef<CameraViewState | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  // Ship position changes must NOT rebuild the scene (that re-fetches every CTM
  // model, and a fresh/added ship can get stuck on its flat fallback card when a
  // burst trips the API rate limiter). Positions are synced in place instead, so
  // they are deliberately kept out of `shipsKey`.
  const shipsKey = ships
    .map((ship) => [ship.id, ship.shipUuid, ship.ctmUrl ?? '', ship.group ?? ''].join(':'))
    .join('|')
    + `::${tacticalVectors.map((v) => [v.id, v.sourceType, v.sourceId, v.endX.toFixed(1), v.endZ.toFixed(1), v.controlX.toFixed(1), v.controlZ.toFixed(1)].join(':')).join('|')}`;
  const shipPositionsKey = ships.map((ship) => `${ship.id}:${ship.gridX ?? ''}:${ship.gridZ ?? ''}:${ship.rotationY ?? ''}:${ship.elevation ?? ''}:${ship.team ?? ''}`).join('|');

  // Keep onSelect ref current without rebuilding the scene
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { selectedMarkerIdRef.current = selectedMarkerId; }, [selectedMarkerId]);
  useEffect(() => { selectedVectorIdRef.current = selectedVectorId; }, [selectedVectorId]);
  useEffect(() => { onPositionChangeRef.current = onPositionChange; }, [onPositionChange]);
  useEffect(() => { onMarkerSelectRef.current = onMarkerSelect; }, [onMarkerSelect]);
  useEffect(() => { onMarkerPositionChangeRef.current = onMarkerPositionChange; }, [onMarkerPositionChange]);
  useEffect(() => { onVectorSelectRef.current = onVectorSelect; }, [onVectorSelect]);
  useEffect(() => { onVectorChangeRef.current = onVectorChange; }, [onVectorChange]);
  useEffect(() => { onVectorCreateRef.current = onVectorCreate; }, [onVectorCreate]);
  useEffect(() => { onGroupPositionChangeRef.current = onGroupPositionChange; }, [onGroupPositionChange]);
  useEffect(() => { syncMarkersRef.current?.(tacticalMarkers); }, [tacticalMarkers]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { syncShipPositionsRef.current?.(ships); }, [shipPositionsKey]);

  useEffect(() => {
    if (!containerRef.current || (ships.length === 0 && tacticalMarkers.length === 0 && tacticalVectors.length === 0)) return;
    const container = containerRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    // Tactical vectors (and their launcher handles) are a Tactics-only feature.
    // The Fleet Manager does not wire up onVectorCreate, so launchers stay hidden
    // there and never appear next to a selected ship.
    const vectorsEnabled = !!onVectorCreate;

    // ── Scene ──────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06101a);

    // Same lighting as the single ship holoviewer.
    scene.add(new THREE.AmbientLight(0x0a2535, 2.5));
    const key = new THREE.DirectionalLight(0x60d8ef, 4.5);
    key.position.set(0.4, 1.0, 0.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x1060a0, 0.6);
    fill.position.set(-1, 0.2, -0.8);
    scene.add(fill);

    // ── Renderer ───────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(getThreePixelRatio());
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
    const savedView = cameraViewRef.current;
    if (savedView) {
      camera.position.copy(savedView.position);
      controls.target.copy(savedView.target);
      controls.update();
    }
    let userHasMovedView = savedView?.userHasMoved ?? false;
    const saveCameraView = () => {
      cameraViewRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
        userHasMoved: userHasMovedView,
      };
    };
    controls.addEventListener('change', saveCameraView);
    const visibility = createVisibilityTracker(container);

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
    const estimateShipFootprint = (ship: FleetShip) => {
      const width = Math.max(Number(ship.sizeX ?? 0), Number(ship.sizeZ ?? 0), Number(ship.sizeY ?? 0), 18);
      const radius = Math.max(width / 2, 10);
      return { radius, halfWidth: radius };
    };

    // Real longest dimension (meters) of a ship, used to scale every model to a
    // consistent size relative to the others (reference: Constellation Andromeda).
    const shipRealLengthMeters = (ship: FleetShip) => {
      const dims = [Number(ship.sizeX), Number(ship.sizeY), Number(ship.sizeZ)].filter((d) => Number.isFinite(d) && d > 0);
      return dims.length ? Math.max(...dims) : FALLBACK_SHIP_LENGTH_M;
    };
    const shipRenderLengthWorld = (ship: FleetShip) => shipRealLengthMeters(ship) * WORLD_UNITS_PER_METER;

    const entries: ShipEntry[] = ships.map((ship) => {
      const footprint = estimateShipFootprint(ship);
      return {
        ship, root: new THREE.Group(), inner: null,
        meshes: [], outlineMeshes: [], ring: null,
        radius: footprint.radius, halfWidth: footprint.halfWidth, loaded: false,
      };
    });

    entries.forEach((e) => {
      e.root.userData.fleetItemId = e.ship.id;
      e.root.rotation.y = Number(e.ship.rotationY) || 0;
      e.root.position.y = Number(e.ship.elevation) || 0;
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

    type MarkerEntry = {
      marker: TacticalMarker;
      root: THREE.Group;
      meshes: THREE.Object3D[];
      pulse: THREE.Object3D | null;
    };

    type VectorEntry = {
      vector: TacticalVector;
      root: THREE.Group;
      meshes: THREE.Object3D[];
      ribbon: THREE.Mesh;
      ribbonGlow: THREE.Mesh;
      head: THREE.Mesh;
      headGlow: THREE.Mesh;
      endHandle: THREE.Group;
      lastSourceX: number;
      lastSourceZ: number;
      lastBaseY: number;
    };

    type VectorLauncherEntry = {
      root: THREE.Group;
      meshes: THREE.Mesh[];
      sourceType: 'ship' | 'group';
      sourceId: number | string;
      anchorShip?: FleetShip;
      group?: string;
    };

    type GroupRingEntry = {
      group: string;
      mesh: THREE.Mesh;
      hitDisc: THREE.Mesh;
      container: THREE.Group;
      vectorLauncher: VectorLauncherEntry;
    };

    // Shared visual for the grab handle, used both by the creation launcher and
    // by the selected-vector end handle so they look identical.
    const buildHandleMeshes = (withChevron: boolean): THREE.Mesh[] => {
      const glowColor = 0x7dfff4;
      const makeMat = (opacity: number) =>
        new THREE.MeshBasicMaterial({
          color: glowColor,
          transparent: true,
          opacity,
          depthTest: false,
          blending: THREE.AdditiveBlending,
        });
      // Soft halo lying flat on the aim plane.
      const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(2.5, 48), makeMat(0.12));
      glowDisc.rotation.x = -Math.PI / 2;
      glowDisc.userData.launcherBaseOpacity = 0.12;
      // Faint outer ring.
      const outerRing = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.06, 10, 64), makeMat(0.4));
      outerRing.rotation.x = -Math.PI / 2;
      outerRing.userData.launcherBaseOpacity = 0.4;
      // Main bright ring.
      const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.14, 12, 56), makeMat(0.9));
      innerRing.rotation.x = -Math.PI / 2;
      innerRing.userData.launcherBaseOpacity = 0.9;
      // Bright core.
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), makeMat(1));
      core.userData.launcherBaseOpacity = 1;
      const meshes = [glowDisc, outerRing, innerRing, core] as THREE.Mesh[];
      if (withChevron) {
        // Forward chevron hinting the drag-to-aim direction (+Z front, flat).
        const chevron = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1, 4), makeMat(0.85));
        chevron.rotation.x = Math.PI / 2;
        chevron.position.set(0, 0, 1.95);
        chevron.userData.launcherBaseOpacity = 0.85;
        meshes.push(chevron);
      }
      return meshes;
    };

    const makeVectorLauncher = (sourceType: 'ship' | 'group', sourceId: number | string, anchorShip?: FleetShip): VectorLauncherEntry => {
      const root = new THREE.Group();
      root.visible = false;
      root.renderOrder = 80;
      const handleMeshes = buildHandleMeshes(true);
      // Invisible, generous pick volume.
      const hitDisc = new THREE.Mesh(
        new THREE.SphereGeometry(3, 16, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false }),
      );
      hitDisc.userData.keepInvisible = true;

      const meshes = [...handleMeshes, hitDisc];
      for (const mesh of meshes) {
        mesh.renderOrder = 80;
        mesh.userData.vectorLauncherSourceType = sourceType;
        mesh.userData.vectorLauncherSourceId = sourceId;
      }
      root.add(...meshes);
      scene.add(root);
      return { root, meshes, sourceType, sourceId, anchorShip, group: sourceType === 'group' ? String(sourceId) : undefined };
    };

    const groupRings: GroupRingEntry[] = [...new Set(entries.map((entry) => entry.ship.group).filter((group): group is string => !!group))]
      .filter((group) => entries.filter((entry) => entry.ship.group === group).length > 1)
      .map((group) => {
        const mesh = new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.018, 8, 96),
          new THREE.MeshBasicMaterial({ color: COLOR_RING, transparent: true, opacity: 0 }),
        );
        mesh.rotation.x = -Math.PI / 2;
        const hitDisc = new THREE.Mesh(
          new THREE.CylinderGeometry(1, 1, 0.5, 32),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
        );
        hitDisc.userData.groupDragTarget = group;
        const container = new THREE.Group();
        container.add(mesh, hitDisc);
        scene.add(container);
        return { group, mesh, hitDisc, container, vectorLauncher: makeVectorLauncher('group', group) };
      });

    const makeMarkerEntry = (marker: TacticalMarker): MarkerEntry => {
      const root = new THREE.Group();
      root.position.set(marker.gridX, 0, marker.gridZ);
      root.rotation.y = marker.rotation ?? 0;
      root.userData.tacticalMarkerId = marker.id;

      // Three distinct, color-coded holographic 3D volumes:
      //   objective -> golden diamond pylon pointing down at its target
      //   poi       -> cyan crystal with an orbiting ring
      //   obstacle  -> red spiky hazard cluster
      const colorByType = {
        objective: 0xfacc15,
        poi: 0x22d3ee,
        obstacle: 0xef4444,
      } satisfies Record<TacticalMarker['type'], number>;
      const color = colorByType[marker.type];
      const meshes: THREE.Object3D[] = [];
      const tag = (obj: THREE.Object3D) => { obj.userData.tacticalMarkerId = marker.id; };

      const solidMat = (opacity: number) => new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const addWire = (geo: THREE.BufferGeometry, target: THREE.Object3D) => {
        const wire = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false }),
        );
        tag(wire);
        target.add(wire);
      };
      const addMesh = (mesh: THREE.Mesh, baseOpacity: number, target: THREE.Object3D) => {
        mesh.userData.baseOpacity = baseOpacity;
        tag(mesh);
        target.add(mesh);
        meshes.push(mesh);
        return mesh;
      };

      // Raycast target spanning ground to floating volume.
      const hitDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(64, 64, 150, 20, 1, true),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hitDisc.position.y = 64;
      hitDisc.userData.tacticalMarkerId = marker.id;
      hitDisc.userData.keepInvisible = true;
      root.add(hitDisc);
      meshes.push(hitDisc);

      // Ground socle rings.
      const baseRing = new THREE.Mesh(new THREE.TorusGeometry(46, 1.7, 8, 96), solidMat(0.6));
      baseRing.rotation.x = -Math.PI / 2;
      baseRing.position.y = 2;
      addMesh(baseRing, 0.6, root);
      const baseRing2 = new THREE.Mesh(new THREE.TorusGeometry(58, 0.8, 8, 96), solidMat(0.32));
      baseRing2.rotation.x = -Math.PI / 2;
      baseRing2.position.y = 2;
      addMesh(baseRing2, 0.32, root);

      // Vertical beam to draw the eye up to the floating volume.
      const beamHeight = marker.type === 'obstacle' ? 48 : 72;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, beamHeight, 8), solidMat(0.28));
      beam.position.y = beamHeight / 2;
      addMesh(beam, 0.28, root);

      // Floating volume (spins + bobs in the animate loop).
      const volume = new THREE.Group();
      volume.position.y = beamHeight + 16;
      volume.userData.baseY = beamHeight + 16;
      volume.userData.markerSpin = true;
      root.add(volume);

      if (marker.type === 'objective') {
        const geo = new THREE.OctahedronGeometry(20, 0);
        const core = addMesh(new THREE.Mesh(geo, solidMat(0.5)), 0.5, volume);
        core.scale.set(1, 1.7, 1);
        addWire(geo, core);
        const cone = addMesh(new THREE.Mesh(new THREE.ConeGeometry(13, 22, 4), solidMat(0.45)), 0.5, volume);
        cone.position.y = -28;
        cone.rotation.y = Math.PI / 4;
      } else if (marker.type === 'poi') {
        const geo = new THREE.IcosahedronGeometry(20, 0);
        const core = addMesh(new THREE.Mesh(geo, solidMat(0.45)), 0.5, volume);
        addWire(geo, core);
        const orbit = addMesh(new THREE.Mesh(new THREE.TorusGeometry(31, 1.2, 8, 64), solidMat(0.55)), 0.6, volume);
        orbit.rotation.x = Math.PI / 2.4;
      } else {
        const geo = new THREE.TetrahedronGeometry(25, 0);
        const core = addMesh(new THREE.Mesh(geo, solidMat(0.42)), 0.48, volume);
        addWire(geo, core);
        const geo2 = new THREE.TetrahedronGeometry(25, 0);
        const core2 = addMesh(new THREE.Mesh(geo2, solidMat(0.3)), 0.36, volume);
        core2.rotation.set(Math.PI, Math.PI / 3, 0);
        addWire(geo2, core2);
      }

      scene.add(root);
      return { marker, root, meshes, pulse: volume };
    };

    let markerEntries = tacticalMarkers.map(makeMarkerEntry);
    syncMarkersRef.current = (nextMarkers: TacticalMarker[]) => {
      const nextIds = new Set(nextMarkers.map((marker) => marker.id));
      markerEntries
        .filter((entry) => !nextIds.has(entry.marker.id))
        .forEach((entry) => {
          scene.remove(entry.root);
          disposeObject3D(entry.root);
        });
      markerEntries = markerEntries.filter((entry) => nextIds.has(entry.marker.id));

      nextMarkers.forEach((marker) => {
        const existing = markerEntries.find((entry) => entry.marker.id === marker.id);
        if (existing) {
          existing.marker = marker;
          existing.root.position.set(marker.gridX, 0, marker.gridZ);
          existing.root.rotation.y = marker.rotation ?? 0;
          return;
        }
        markerEntries.push(makeMarkerEntry(marker));
      });
    };

    // Tactical vectors sit at the source ship's selection-ring height (its base
    // "socle"), not floating at the model centre. Falls back to the floor when no
    // model is loaded yet.
    const vectorBaseY = (srcEntries: ShipEntry[]) => {
      const ys = srcEntries
        .map((e) => e.root.position.y + (e.ring ? e.ring.position.y : 0));
      return ys.length ? Math.min(...ys) + 0.4 : 0.55;
    };

    // Team color of a vector's source (first source ship that has a team).
    const vectorTeamColor = (srcEntries: ShipEntry[]): number | null => {
      for (const e of srcEntries) {
        const col = teamColor(e.ship.team);
        if (col !== null) return col;
      }
      return null;
    };

    const makeFlatVectorRibbon = (curve: THREE.QuadraticBezierCurve3, width: number, y: number, tEnd = 1) => {
      const segments = 64;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) points.push(curve.getPointAt((i / segments) * tEnd));
      const vertices: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(points.length - 1, i + 1)];
        const tangent = next.clone().sub(prev);
        if (tangent.lengthSq() < 0.001) tangent.set(0, 0, 1);
        tangent.normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2);
        const left = points[i].clone().add(normal);
        const right = points[i].clone().sub(normal);
        vertices.push(left.x, y, left.z, right.x, y, right.z);
        if (i < points.length - 1) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    };

    const makeFlatArrowHead = (tip: THREE.Vector3, direction: THREE.Vector3, halfWidth: number, length: number, y: number) => {
      const forward = direction.clone();
      forward.y = 0;
      if (forward.lengthSq() < 0.001) forward.copy(TACTICAL_FRONT_DIRECTION);
      forward.normalize();
      const side = new THREE.Vector3(-forward.z, 0, forward.x);
      const back = tip.clone().addScaledVector(forward, -length);
      const left = back.clone().addScaledVector(side, halfWidth);
      const right = back.clone().addScaledVector(side, -halfWidth);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        tip.x, y, tip.z,
        left.x, y, left.z,
        right.x, y, right.z,
      ], 3));
      geometry.setIndex([0, 1, 2]);
      geometry.computeVertexNormals();
      return geometry;
    };

    const sourceCenterOf = (srcEntries: ShipEntry[]) => ({
      x: srcEntries.length ? srcEntries.reduce((s, e) => s + e.root.position.x, 0) / srcEntries.length : 0,
      z: srcEntries.length ? srcEntries.reduce((s, e) => s + e.root.position.z, 0) / srcEntries.length : 0,
    });
    // Radius of the source selection ring, so vectors start at the ring edge
    // instead of the ship/group center ("ctm").
    const sourceRingRadius = (srcEntries: ShipEntry[]) => {
      if (srcEntries.length === 0) return 0;
      if (srcEntries.length === 1) return Math.max(srcEntries[0].radius * 0.85, 8);
      const c = sourceCenterOf(srcEntries);
      let maxD = 22;
      for (const e of srcEntries) {
        const d = Math.hypot(e.root.position.x - c.x, e.root.position.z - c.z) + Math.max(e.halfWidth, e.radius * 0.4);
        if (d > maxD) maxD = d;
      }
      return maxD + 8;
    };
    const ringEdgeStart = (srcEntries: ShipEntry[], endX: number, endZ: number) => {
      const c = sourceCenterOf(srcEntries);
      const ringR = sourceRingRadius(srcEntries);
      const dx = endX - c.x, dz = endZ - c.z;
      const len = Math.hypot(dx, dz) || 1;
      return { x: c.x + (dx / len) * ringR, z: c.z + (dz / len) * ringR };
    };
    // Grab-handle size scaled to the source ship/group footprint.
    const vectorHandleSize = (srcEntries: ShipEntry[]) =>
      Math.max(10, Math.min(46, (srcEntries.length ? Math.max(...srcEntries.map((e) => e.radius)) : 20) * 0.5));

    const makeVectorEntry = (vector: TacticalVector): VectorEntry => {
      const root = new THREE.Group();
      const srcEntries = vector.sourceType === 'group'
        ? entries.filter((e) => e.ship.group === vector.sourceId)
        : entries.filter((e) => e.ship.id === vector.sourceId);
      const srcX = srcEntries.length ? srcEntries.reduce((sum, e) => sum + e.root.position.x, 0) / srcEntries.length : 0;
      const srcZ = srcEntries.length ? srcEntries.reduce((sum, e) => sum + e.root.position.z, 0) / srcEntries.length : 0;
      const baseY = vectorBaseY(srcEntries);
      const ex = vector.endX, ez = vector.endZ;
      const edge = ringEdgeStart(srcEntries, ex, ez);
      const sx = edge.x, sz = edge.z;
      const dx = ex - sx, dz = ez - sz;
      const len = Math.hypot(dx, dz);
      const ctrlX = len > 1 ? (sx + ex) / 2 - (dz / len) * len * 0.1 : (sx + ex) / 2;
      const ctrlZ = len > 1 ? (sz + ez) / 2 + (dx / len) * len * 0.1 : (sz + ez) / 2;
      const start = new THREE.Vector3(sx, baseY, sz);
      const control = new THREE.Vector3(ctrlX, baseY, ctrlZ);
      const end = new THREE.Vector3(ex, baseY, ez);
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const dist = Math.max(start.distanceTo(end), 1);
      const width = Math.max(4, Math.min(14, dist * 0.025));
      const headLength = width * 3.4;
      const headHalfWidth = width * 1.5;
      const tEnd = Math.max(0, 1 - headLength / curve.getLength());
      const tip = curve.getPointAt(1);
      const headDir = tip.clone().sub(curve.getPointAt(tEnd));
      const mat = new THREE.MeshBasicMaterial({ color: 0x22f5df, transparent: true, opacity: 0.56, side: THREE.DoubleSide, depthTest: false });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x67fff2, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthTest: false });
      const ribbon = new THREE.Mesh(makeFlatVectorRibbon(curve, width, baseY, tEnd), mat);
      ribbon.userData.tacticalVectorId = vector.id;
      const ribbonGlow = new THREE.Mesh(makeFlatVectorRibbon(curve, width * 1.55, baseY, tEnd), glowMat);
      ribbonGlow.userData.tacticalVectorId = vector.id;
      const head = new THREE.Mesh(makeFlatArrowHead(tip, headDir, headHalfWidth, headLength, baseY), mat.clone());
      head.userData.tacticalVectorId = vector.id;
      const headGlow = new THREE.Mesh(makeFlatArrowHead(tip, headDir, headHalfWidth * 1.4, headLength * 1.1, baseY), glowMat.clone());
      headGlow.userData.tacticalVectorId = vector.id;
      // Grab handle — identical visual to the creation launcher, shown only
      // when the vector is selected.
      const endHandle = new THREE.Group();
      endHandle.position.set(ex, baseY, ez);
      endHandle.visible = false;
      endHandle.renderOrder = 80;
      const endHandleMeshes = buildHandleMeshes(false);
      const endHitDisc = new THREE.Mesh(
        new THREE.SphereGeometry(3, 16, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false }),
      );
      endHitDisc.userData.keepInvisible = true;
      for (const mesh of [...endHandleMeshes, endHitDisc]) {
        mesh.renderOrder = 80;
        mesh.userData.tacticalVectorId = vector.id;
        mesh.userData.vectorHandle = 'end';
      }
      endHandle.add(...endHandleMeshes, endHitDisc);
      endHandle.scale.setScalar(vectorHandleSize(srcEntries));
      root.add(ribbonGlow, ribbon, headGlow, head, endHandle);
      scene.add(root);
      return { vector, root, meshes: [ribbonGlow, ribbon, headGlow, head, endHandle], ribbon, ribbonGlow, head, headGlow, endHandle, lastSourceX: srcX, lastSourceZ: srcZ, lastBaseY: baseY };
    };

    const vectorEntries = tacticalVectors.map(makeVectorEntry);
    // Sources (ship or group) that already own a vector. A ship/group may carry
    // only one vector, so its creation launcher is hidden once a vector exists.
    const vectorSourceKeys = new Set(vectorEntries.map((e) => `${e.vector.sourceType}:${e.vector.sourceId}`));

    const rebuildVectorGeometry = (entry: VectorEntry, overrideEndX?: number, overrideEndZ?: number) => {
      const srcEntries = entry.vector.sourceType === 'group'
        ? entries.filter((e) => e.ship.group === entry.vector.sourceId)
        : entries.filter((e) => e.ship.id === entry.vector.sourceId);
      const srcX = srcEntries.length ? srcEntries.reduce((s, e) => s + e.root.position.x, 0) / srcEntries.length : 0;
      const srcZ = srcEntries.length ? srcEntries.reduce((s, e) => s + e.root.position.z, 0) / srcEntries.length : 0;
      const baseY = vectorBaseY(srcEntries);
      const ex = overrideEndX ?? entry.vector.endX;
      const ez = overrideEndZ ?? entry.vector.endZ;
      const edge = ringEdgeStart(srcEntries, ex, ez);
      const sx = edge.x, sz = edge.z;
      const dx = ex - sx, dz = ez - sz;
      const len = Math.hypot(dx, dz);
      const ctrlX = len > 1 ? (sx + ex) / 2 - (dz / len) * len * 0.1 : (sx + ex) / 2;
      const ctrlZ = len > 1 ? (sz + ez) / 2 + (dx / len) * len * 0.1 : (sz + ez) / 2;
      const start = new THREE.Vector3(sx, baseY, sz);
      const control = new THREE.Vector3(ctrlX, baseY, ctrlZ);
      const end = new THREE.Vector3(ex, baseY, ez);
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const dist = Math.max(start.distanceTo(end), 1);
      const width = Math.max(4, Math.min(14, dist * 0.025));
      const headLength = width * 3.4;
      const headHalfWidth = width * 1.5;
      const tEnd = Math.max(0, 1 - headLength / curve.getLength());
      const tip = curve.getPointAt(1);
      const headDir = tip.clone().sub(curve.getPointAt(tEnd));
      entry.ribbon.geometry.dispose();
      entry.ribbon.geometry = makeFlatVectorRibbon(curve, width, baseY, tEnd);
      entry.ribbonGlow.geometry.dispose();
      entry.ribbonGlow.geometry = makeFlatVectorRibbon(curve, width * 1.55, baseY, tEnd);
      entry.head.geometry.dispose();
      entry.head.geometry = makeFlatArrowHead(tip, headDir, headHalfWidth, headLength, baseY);
      entry.headGlow.geometry.dispose();
      entry.headGlow.geometry = makeFlatArrowHead(tip, headDir, headHalfWidth * 1.4, headLength * 1.1, baseY);
      entry.endHandle.scale.setScalar(vectorHandleSize(srcEntries));
      entry.endHandle.position.set(ex, baseY, ez);
      entry.lastSourceX = srcX;
      entry.lastSourceZ = srcZ;
      entry.lastBaseY = baseY;
    };

    const sourceEntriesForLauncher = (launcher: VectorLauncherEntry) =>
      launcher.sourceType === 'group'
        ? entries.filter((entry) => entry.ship.group === launcher.sourceId)
        : entries.filter((entry) => entry.ship.id === launcher.sourceId);

    const sourceCenter = (sourceEntries: ShipEntry[]) => ({
      x: sourceEntries.length ? sourceEntries.reduce((sum, entry) => sum + entry.root.position.x, 0) / sourceEntries.length : 0,
      z: sourceEntries.length ? sourceEntries.reduce((sum, entry) => sum + entry.root.position.z, 0) / sourceEntries.length : 0,
    });

    const vectorPayloadFromLauncher = (launcher: VectorLauncherEntry, endX: number, endZ: number): Omit<TacticalVector, 'id'> => {
      const sourceEntries = sourceEntriesForLauncher(launcher);
      const start = ringEdgeStart(sourceEntries, endX, endZ);
      const dx = endX - start.x;
      const dz = endZ - start.z;
      const length = Math.max(Math.hypot(dx, dz), 1);
      // Bend the ribbon gently and symmetrically, perpendicular to the aim
      // direction, so the arrow always points exactly at the drop point.
      const perpX = -dz / length;
      const perpZ = dx / length;
      const curveBias = Math.min(length * 0.08, 40);
      return {
        sourceType: launcher.sourceType,
        sourceId: launcher.sourceId,
        endX,
        endZ,
        controlX: (start.x + endX) / 2 + perpX * curveBias,
        controlZ: (start.z + endZ) / 2 + perpZ * curveBias,
      };
    };

    // ── Grid (dynamic) ─────────────────────────────────────────────────────────
    let gridHelper: THREE.GridHelper | null = null;
    const updateGrid = () => {
      if (gridHelper) scene.remove(gridHelper);
      const loaded = entries.filter((e) => e.loaded && e.inner);
      if (entries.length === 0 && markerEntries.length === 0) return;
      const metrics = getSceneMetrics();
      const size = Math.max(metrics.span * 2.8, metrics.radius * 14, 180);
      const divs = Math.min(96, Math.max(18, Math.round(size / Math.max(metrics.radius / 2, 8))));

      // Find floor Y from all loaded ships
      let minY = 0;
      loaded.forEach((e) => {
        const box = new THREE.Box3().setFromObject(e.root);
        if (box.min.y < minY) minY = box.min.y;
      });

      gridHelper = new THREE.GridHelper(size, divs, 0x1a5472, 0x0a2233);
      gridHelper.position.y = minY - metrics.radius * 0.04;
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

    const getSceneMetrics = () => {
      const xs: number[] = [];
      const zs: number[] = [];
      entries.forEach((entry) => {
        const half = Math.max(entry.halfWidth, entry.radius, 10);
        xs.push(entry.root.position.x - half, entry.root.position.x + half);
        zs.push(entry.root.position.z - half, entry.root.position.z + half);
      });
      markerEntries.forEach((entry) => {
        xs.push(entry.root.position.x - 96, entry.root.position.x + 96);
        zs.push(entry.root.position.z - 96, entry.root.position.z + 96);
      });
      vectorEntries.forEach((entry) => {
        xs.push(entry.vector.endX, entry.vector.controlX);
        zs.push(entry.vector.endZ, entry.vector.controlZ);
      });
      if (xs.length === 0 || zs.length === 0) {
        return { radius: 20, span: 80, centerX: 0, centerZ: 0 };
      }
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minZ = Math.min(...zs);
      const maxZ = Math.max(...zs);
      const width = Math.max(maxX - minX, getTotalSpan(), 40);
      const depth = Math.max(maxZ - minZ, 40);
      const radius = Math.max(...entries.map((entry) => entry.radius), 20);
      return {
        radius,
        span: Math.max(width, depth),
        centerX: (minX + maxX) / 2,
        centerZ: (minZ + maxZ) / 2,
      };
    };

    const placeShipsOnce = () => {
      const totalSpan = getTotalSpan();
      const gap = getGap();
      const widestShip = Math.max(...entries.map((entry) => entry.halfWidth * 2), 0);
      const forcedGap = Math.max(gap, widestShip * 1.35, 360);
      const forceRowLayout = layoutMode === 'row';

      // Ships with an explicit, finite grid position keep it exactly — this is
      // what the user dragged them to, so it must always be honored. Only ships
      // without a saved position (or when an explicit row layout is requested)
      // are auto-arranged in a centered row. Previously an "overlap" heuristic
      // forced every ship into a row, which silently snapped dragged ships back.
      const autoEntries = entries.filter(
        (e) => forceRowLayout || !(Number.isFinite(e.ship.gridX ?? NaN) && Number.isFinite(e.ship.gridZ ?? NaN)),
      );
      const forcedStartX = -((Math.max(autoEntries.length, 1) - 1) * forcedGap) / 2;
      let x = -totalSpan / 2;
      let autoIndex = 0;
      entries.forEach((e) => {
        const hasExplicitPosition = Number.isFinite(e.ship.gridX ?? NaN) && Number.isFinite(e.ship.gridZ ?? NaN);
        if (!forceRowLayout && hasExplicitPosition) {
          e.root.position.x = Number(e.ship.gridX);
          e.root.position.z = Number(e.ship.gridZ);
        } else {
          e.root.position.x = autoEntries.length > 1 ? forcedStartX + autoIndex * forcedGap : x + e.halfWidth;
          e.root.position.z = 0;
          autoIndex++;
        }
        x += e.halfWidth * 2 + gap;
      });
    };

    const vectorLaunchers: VectorLauncherEntry[] = entries.map((entry) => makeVectorLauncher('ship', entry.ship.id, entry.ship));
    const allVectorLaunchers = [...vectorLaunchers, ...groupRings.map((ring) => ring.vectorLauncher)];

    const refreshLayout = (fitView = !userHasMovedView) => {
      updateGrid();
      if (fitView) fitCamera();
    };

    // Apply external position changes (drag persistence, formations, group moves)
    // in place, without tearing down and rebuilding the whole scene — a rebuild
    // re-requests every CTM model and can leave a ship stuck on its flat card.
    syncShipPositionsRef.current = (nextShips: FleetShip[]) => {
      let moved = false;
      nextShips.forEach((nextShip) => {
        const entry = entries.find((e) => e.ship.id === nextShip.id);
        if (!entry) return;
        entry.ship = nextShip;
        const gx = Number(nextShip.gridX);
        const gz = Number(nextShip.gridZ);
        if (Number.isFinite(gx) && Number.isFinite(gz) && (entry.root.position.x !== gx || entry.root.position.z !== gz)) {
          entry.root.position.x = gx;
          entry.root.position.z = gz;
          moved = true;
        }
        const ry = Number(nextShip.rotationY) || 0;
        if (entry.root.rotation.y !== ry) {
          entry.root.rotation.y = ry;
        }
        const ev = Number(nextShip.elevation) || 0;
        if (entry.root.position.y !== ev) {
          entry.root.position.y = ev;
          moved = true; // vectors follow the source height, so trigger a refresh
        }
      });
      if (moved) refreshLayout(false);
    };

    const fitCamera = () => {
      const metrics = getSceneMetrics();
      const dist = Math.max(metrics.span, metrics.radius * 3, 80) * 1.2;
      const height = metrics.radius * 0.5;
      camera.near = dist * 0.001;
      camera.far  = dist * 200;
      camera.updateProjectionMatrix();
      // Position camera like the single ship holoviewer, but pulled back for fleet width.
      camera.position.set(metrics.centerX, height, metrics.centerZ + dist);
      controls.target.set(metrics.centerX, 0, metrics.centerZ);
      controls.minDistance = metrics.radius * 0.3;
      controls.maxDistance = dist * 10;
      controls.update();
      saveCameraView();
    };

    // ── Load CTM models ────────────────────────────────────────────────────────
    const holoMat = new THREE.MeshPhongMaterial({
      color: 0x1aa8c0, emissive: 0x041828,
      specular: 0x66ddff, shininess: 55, side: THREE.DoubleSide,
    });

    const loader = new CTMLoader();
    let loadedSoFar = 0;

    placeShipsOnce();
    refreshLayout();

    const markLoaded = (entry: ShipEntry, radius: number, halfWidth: number) => {
      entry.radius = radius;
      entry.halfWidth = halfWidth;
      entry.loaded = true;
      loadedSoFar++;
      setLoadedCount(loadedSoFar);
      placeShipsOnce();
      refreshLayout();
    };

    const addFallbackCard = (entry: ShipEntry, texture: THREE.Texture | null) => {
      const cardW = Math.max(shipRenderLengthWorld(entry.ship), 12);
      const cardH = cardW / 1.78;
      const geo = new THREE.PlaneGeometry(cardW, cardH);
      const frontMat = texture
        ? new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.85, side: THREE.FrontSide })
        : new THREE.MeshBasicMaterial({ color: 0x0d3040, transparent: true, opacity: 0.7 });
      const front = new THREE.Mesh(geo, frontMat);
      front.userData.fleetItemId = entry.ship.id;

      const backMat = new THREE.MeshBasicMaterial({ color: 0x071820, transparent: true, opacity: 0.4, side: THREE.BackSide });
      const back = new THREE.Mesh(geo, backMat);

      const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(cardW + 0.3, cardH + 0.3));
      const borderMat = new THREE.LineBasicMaterial({ color: 0x1aa8c0, transparent: true, opacity: 0.7 });
      const border = new THREE.LineSegments(borderGeo, borderMat);

      const card = new THREE.Group();
      card.add(front, back, border);
      card.userData.fleetItemId = entry.ship.id;
      entry.root.add(card);
      entry.meshes.push(front);
      markLoaded(entry, cardW / 2, cardW / 2);
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
        const CARD_W = Math.max(shipRenderLengthWorld(entry.ship), 12);
        const CARD_H = CARD_W / 1.78; // 16:9-ish

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
              placeShipsOnce();
              refreshLayout();
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
              placeShipsOnce();
              refreshLayout();
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
          placeShipsOnce();
          refreshLayout();
        }
        return;
      }

      const modelUrl = `${API_BASE}/ships/${entry.ship.shipUuid}/model/file`;
      void loadCachedGeometry(loader, modelUrl)
        .then((geometry) => {
          const mat = makeMat(COLOR_DEFAULT, EMISS_DEFAULT);
          const mesh = new THREE.Mesh(geometry, mat);
          mesh.userData.fleetItemId = entry.ship.id;

          // Outline mesh (BackSide, slightly scaled up, hidden by default)
          const outlineMat = makeOutlineMat();
          const outlineMesh = new THREE.Mesh(geometry, outlineMat);
          outlineMesh.scale.setScalar(1.04);
          outlineMesh.userData.isOutline = true;

          const inner = new THREE.Group();
          inner.rotation.set(0, FLEET_MODEL_FRONT_ROTATION_Y, 0);
          inner.add(mesh);
          inner.add(outlineMesh);

          // Rescale the model to its real-world size so every ship is consistent
          // in scale relative to the others (reference: Constellation Andromeda).
          inner.updateMatrixWorld(true);
          const nativeBox = new THREE.Box3().setFromObject(inner);
          const nativeSize = new THREE.Vector3();
          nativeBox.getSize(nativeSize);
          const nativeLongest = Math.max(nativeSize.x, nativeSize.y, nativeSize.z) || 1;
          inner.scale.setScalar(shipRenderLengthWorld(entry.ship) / nativeLongest);

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

          // Selection ring (torus) — takes the ship's team color (socle).
          const ringGeo = new THREE.TorusGeometry(r * 0.85, r * 0.015, 8, 64);
          const ringMat = new THREE.MeshBasicMaterial({
            color: teamColor(entry.ship.team) ?? COLOR_RING, transparent: true, opacity: 0,
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
          placeShipsOnce();
          refreshLayout();
        })
        .catch(() => {
          loadFallbackCard(entry);
        });
    });

    // ── Raycasting ─────────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();
    let mouseStart  = { x: 0, y: 0 };
    let isDragging  = false;
    type DragTarget =
      | { kind: 'ship'; entry: ShipEntry; root: THREE.Group }
      | { kind: 'group'; group: string; root: THREE.Group; startCenter: THREE.Vector3; startPositions: Map<number, THREE.Vector3> }
      | { kind: 'marker'; entry: MarkerEntry; root: THREE.Group }
      | { kind: 'vector-end'; entry: VectorEntry }
      | { kind: 'vector-launcher'; entry: VectorLauncherEntry; root: THREE.Group };
    let dragTarget: DragTarget | null = null;
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragPoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();
    const launcherDragPreview = new THREE.Group();
    launcherDragPreview.visible = false;
    launcherDragPreview.renderOrder = 95;
    scene.add(launcherDragPreview);

    const clearLauncherDragPreview = () => {
      launcherDragPreview.children.forEach((child) => disposeObject3D(child));
      launcherDragPreview.clear();
      launcherDragPreview.visible = false;
    };

    const updateLauncherDragPreview = (launcher: VectorLauncherEntry, endX: number, endZ: number) => {
      clearLauncherDragPreview();
      const payload = vectorPayloadFromLauncher(launcher, endX, endZ);
      const sourceEntries = sourceEntriesForLauncher(launcher);
      const startPoint = ringEdgeStart(sourceEntries, endX, endZ);
      const baseY = vectorBaseY(sourceEntries);
      const start = new THREE.Vector3(startPoint.x, baseY, startPoint.z);
      const control = new THREE.Vector3(payload.controlX, baseY, payload.controlZ);
      const end = new THREE.Vector3(payload.endX, baseY, payload.endZ);
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const length = Math.max(start.distanceTo(end), 1);
      const width = Math.max(4, Math.min(14, length * 0.025));
      const headLength = width * 3.4;
      const headHalfWidth = width * 1.5;
      const tEnd = Math.max(0, 1 - headLength / curve.getLength());
      const tip = curve.getPointAt(1);
      const headDir = tip.clone().sub(curve.getPointAt(tEnd));
      const mat = new THREE.MeshBasicMaterial({ color: 0x7dfff4, transparent: true, opacity: 0.68, side: THREE.DoubleSide, depthTest: false });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x7dfff4, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthTest: false });
      const ribbon = new THREE.Mesh(makeFlatVectorRibbon(curve, width, baseY, tEnd), mat);
      const glow = new THREE.Mesh(makeFlatVectorRibbon(curve, width * 1.75, baseY, tEnd), glowMat);
      const head = new THREE.Mesh(makeFlatArrowHead(tip, headDir, headHalfWidth, headLength, baseY), mat.clone());
      const headGlow = new THREE.Mesh(makeFlatArrowHead(tip, headDir, headHalfWidth * 1.4, headLength * 1.1, baseY), glowMat.clone());
      launcherDragPreview.add(glow, ribbon, headGlow, head);
      launcherDragPreview.visible = true;
    };

    const getHitTarget = (clientX: number, clientY: number): DragTarget | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const launcherMeshes: THREE.Object3D[] = [];
      allVectorLaunchers.filter((entry) => entry.root.visible).forEach((entry) => entry.meshes.forEach((mesh) => launcherMeshes.push(mesh)));
      const launcherHits = raycaster.intersectObjects(launcherMeshes, true);
      if (launcherHits.length) {
        let launcherObj: THREE.Object3D | null = launcherHits[0].object;
        while (launcherObj) {
          if (launcherObj.userData.vectorLauncherSourceId !== undefined) {
            const entry = allVectorLaunchers.find(
              (launcher) =>
                launcher.sourceType === launcherObj!.userData.vectorLauncherSourceType && String(launcher.sourceId) === String(launcherObj!.userData.vectorLauncherSourceId),
            );
            return entry ? { kind: 'vector-launcher', entry, root: entry.root } : null;
          }
          launcherObj = launcherObj.parent;
        }
      }
      const meshes: THREE.Object3D[] = [];
      entries.forEach((entry) => entry.meshes.forEach((mesh) => meshes.push(mesh)));
      markerEntries.forEach((entry) => entry.meshes.forEach((mesh) => meshes.push(mesh)));
      vectorEntries.forEach((entry) => entry.meshes.forEach((mesh) => {
        // Hidden end handles must not block clicks on objects behind them.
        if (mesh === entry.endHandle && !entry.endHandle.visible) return;
        meshes.push(mesh);
      }));
      groupRings.forEach((ring) => meshes.push(ring.hitDisc));
      const hits = raycaster.intersectObjects(meshes, true);
      if (!hits.length) return null;
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        if (obj.userData.groupDragTarget !== undefined) {
          const groupName = obj.userData.groupDragTarget as string;
          const groupEntries = entries.filter((e) => e.ship.group === groupName);
          const ring = groupRings.find((r) => r.group === groupName);
          if (!ring) return null;
          const startPositions = new Map<number, THREE.Vector3>();
          groupEntries.forEach((e) => startPositions.set(e.ship.id, e.root.position.clone()));
          const startCenter = ring.container.position.clone();
          return { kind: 'group', group: groupName, root: ring.container, startCenter, startPositions };
        }
        if (obj.userData.vectorLauncherSourceId !== undefined) {
          const entry = allVectorLaunchers.find(
            (launcher) =>
              launcher.sourceType === obj!.userData.vectorLauncherSourceType && String(launcher.sourceId) === String(obj!.userData.vectorLauncherSourceId),
          );
          return entry ? { kind: 'vector-launcher', entry, root: entry.root } : null;
        }
        if (obj.userData.tacticalVectorId !== undefined) {
          const entry = vectorEntries.find((vector) => vector.vector.id === obj!.userData.tacticalVectorId);
          return entry ? { kind: 'vector-end', entry } : null;
        }
        if (obj.userData.fleetItemId !== undefined) {
          const entry = entries.find((e) => e.ship.id === obj!.userData.fleetItemId);
          return entry ? { kind: 'ship', entry, root: entry.root } : null;
        }
        if (obj.userData.tacticalMarkerId !== undefined) {
          const entry = markerEntries.find((e) => e.marker.id === obj!.userData.tacticalMarkerId);
          return entry ? { kind: 'marker', entry, root: entry.root } : null;
        }
        obj = obj.parent;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      userHasMovedView = true;
      mouseStart = { x: e.clientX, y: e.clientY };
      isDragging = false;
      const target = getHitTarget(e.clientX, e.clientY);
      if (target) {
        dragTarget = target;
        controls.enabled = false;
        renderer.domElement.style.cursor = target.kind === 'vector-launcher' ? 'grabbing' : 'move';

        // Compute drag offset
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const refPos = target.kind === 'group' ? target.startCenter : target.kind === 'vector-end' ? target.entry.endHandle.position : target.root.position;
        dragPlane.constant = target.kind === 'vector-launcher' || target.kind === 'vector-end' ? 0 : -refPos.y;
        raycaster.ray.intersectPlane(dragPlane, dragPoint);
        dragOffset.copy(refPos).sub(dragPoint);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - mouseStart.x;
      const dy = e.clientY - mouseStart.y;
      if (Math.hypot(dx, dy) > 4) isDragging = true;

      if (dragTarget && isDragging) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        if (dragTarget.kind === 'vector-launcher' || dragTarget.kind === 'vector-end') {
          dragPlane.constant = 0;
        } else {
          dragPlane.constant = -dragTarget.root.position.y;
        }
        raycaster.ray.intersectPlane(dragPlane, dragPoint);
        if (dragTarget.kind === 'vector-end') {
          dragTarget.entry.endHandle.position.set(dragPoint.x, 2, dragPoint.z);
          rebuildVectorGeometry(dragTarget.entry, dragPoint.x, dragPoint.z);
        } else if (dragTarget.kind === 'vector-launcher') {
          // Handle rides the cursor on the arrow plane so it follows the arrow tip.
          const launcherBaseY = vectorBaseY(sourceEntriesForLauncher(dragTarget.entry));
          dragTarget.root.position.set(dragPoint.x, launcherBaseY, dragPoint.z);
          updateLauncherDragPreview(dragTarget.entry, dragPoint.x, dragPoint.z);
        } else if (dragTarget.kind === 'group') {
          const groupTarget = dragTarget;
          const dx = dragPoint.x + dragOffset.x - groupTarget.startCenter.x;
          const dz = dragPoint.z + dragOffset.z - groupTarget.startCenter.z;
          const groupEntries = entries.filter((e) => e.ship.group === groupTarget.group);
          groupEntries.forEach((e) => {
            const start = groupTarget.startPositions.get(e.ship.id);
            if (start) {
              e.root.position.x = start.x + dx;
              e.root.position.z = start.z + dz;
            }
          });
        } else {
          dragTarget.root.position.x = dragPoint.x + dragOffset.x;
          dragTarget.root.position.z = dragPoint.z + dragOffset.z;
        }
      }
    };

    const onPointerUp = (_e: PointerEvent) => {
      controls.enabled = true;
      renderer.domElement.style.cursor = 'grab';
      if (!isDragging && dragTarget) {
        if (dragTarget.kind === 'ship') onSelectRef.current(dragTarget.entry.ship.id);
        if (dragTarget.kind === 'group') {
          const groupName = dragTarget.group;
          const firstShip = entries.find((entry) => entry.ship.group === groupName);
          if (firstShip) onSelectRef.current(firstShip.ship.id);
        }
        if (dragTarget.kind === 'marker') onMarkerSelectRef.current?.(dragTarget.entry.marker.id);
        if (dragTarget.kind === 'vector-end') onVectorSelectRef.current?.(dragTarget.entry.vector.id);
        if (dragTarget.kind === 'vector-launcher') {
          const launcherTarget = dragTarget;
          const sourceEntries = sourceEntriesForLauncher(launcherTarget.entry);
          const start = sourceCenter(sourceEntries);
          const defaultDistance = Math.max(160, ...sourceEntries.map((entry) => entry.radius * 2.8));
          onVectorCreateRef.current?.(vectorPayloadFromLauncher(
            launcherTarget.entry,
            start.x + TACTICAL_FRONT_DIRECTION.x * defaultDistance,
            start.z + TACTICAL_FRONT_DIRECTION.z * defaultDistance,
          ));
        }
      } else if (isDragging && dragTarget) {
        if (dragTarget.kind === 'ship') {
          onPositionChangeRef.current?.(dragTarget.entry.ship.id, {
            gridX: dragTarget.root.position.x,
            gridZ: dragTarget.root.position.z,
          });
        }
        if (dragTarget.kind === 'group') {
          const groupTarget = dragTarget;
          const groupEntries = entries.filter((e) => e.ship.group === groupTarget.group);
          onGroupPositionChangeRef.current?.(
            groupEntries.map((e) => ({ id: e.ship.id, gridX: e.root.position.x, gridZ: e.root.position.z })),
          );
        }
        if (dragTarget.kind === 'marker') {
          onMarkerPositionChangeRef.current?.(dragTarget.entry.marker.id, {
            gridX: dragTarget.root.position.x,
            gridZ: dragTarget.root.position.z,
          });
        }
        if (dragTarget.kind === 'vector-end') {
          const vector = dragTarget.entry.vector;
          const endX = dragTarget.entry.endHandle.position.x;
          const endZ = dragTarget.entry.endHandle.position.z;
          const srcEs = vector.sourceType === 'group'
            ? entries.filter((e) => e.ship.group === vector.sourceId)
            : entries.filter((e) => e.ship.id === vector.sourceId);
          const srcX = srcEs.length ? srcEs.reduce((s, e) => s + e.root.position.x, 0) / srcEs.length : 0;
          const srcZ = srcEs.length ? srcEs.reduce((s, e) => s + e.root.position.z, 0) / srcEs.length : 0;
          const ddx = endX - srcX, ddz = endZ - srcZ;
          const dlen = Math.hypot(ddx, ddz);
          const ctrlX = dlen > 1 ? (srcX + endX) / 2 - (ddz / dlen) * dlen * 0.1 : (srcX + endX) / 2;
          const ctrlZ = dlen > 1 ? (srcZ + endZ) / 2 + (ddx / dlen) * dlen * 0.1 : (srcZ + endZ) / 2;
          onVectorChangeRef.current?.(vector.id, { endX, endZ, controlX: ctrlX, controlZ: ctrlZ });
        }
        if (dragTarget.kind === 'vector-launcher') {
          const launcherTarget = dragTarget;
          onVectorCreateRef.current?.(vectorPayloadFromLauncher(launcherTarget.entry, launcherTarget.root.position.x, launcherTarget.root.position.z));
        }
      }
      saveCameraView();
      clearLauncherDragPreview();
      dragTarget = null;
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
      if (!visibility.isVisible()) return;
      const t = clockRef.current.getElapsedTime();
      const selectedEntry = entries.find((entry) => entry.ship.id === selectedIdRef.current);
      const selectedGroup = selectedEntry?.ship.group;
      const selectedGroupEntries = selectedGroup ? entries.filter((entry) => entry.ship.group === selectedGroup) : [];
      const showGroupSelection = selectedGroupEntries.length > 1;

      // Animate selected ship
      entries.forEach((entry) => {
        const isSelected = entry.ship.id === selectedIdRef.current;
        const isGroupSelected = showGroupSelection && entry.ship.group === selectedGroup;

        // Mesh material
        entry.meshes.forEach((m) => {
          if (m.material instanceof THREE.MeshPhongMaterial && !m.userData.isOutline) {
            m.material.color.setHex(isSelected || isGroupSelected ? COLOR_SELECTED : COLOR_DEFAULT);
            m.material.emissive.setHex(
              isSelected || isGroupSelected ? 0x082a3a + Math.round(Math.sin(t * 3) * 0.15 * 0x050a10) : EMISS_DEFAULT
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

        // Ring (selection socle — colored by team, faintly visible when the
        // ship belongs to a team so camps are readable at a glance).
        if (entry.ring && entry.ring.material instanceof THREE.MeshBasicMaterial) {
          const teamCol = teamColor(entry.ship.team);
          entry.ring.material.color.setHex(teamCol ?? COLOR_RING);
          const selectedRing = isSelected && !showGroupSelection;
          const baseOpacity = teamCol !== null ? 0.34 : 0;
          entry.ring.material.opacity = selectedRing ? 0.6 + Math.sin(t * 5) * 0.25 : baseOpacity;
          entry.ring.rotation.z = t * 1.2;
          const pulse = selectedRing ? 1 + Math.sin(t * 3) * 0.06 : 1;
          entry.ring.scale.set(pulse, 1, pulse);
        }
      });

      const tacticalFrontDirection = TACTICAL_FRONT_DIRECTION;

      groupRings.forEach((ring) => {
        const groupEntries = entries.filter((entry) => entry.ship.group === ring.group);
        const minX = Math.min(...groupEntries.map((entry) => entry.root.position.x - Math.max(entry.halfWidth, entry.radius * 0.4)));
        const maxX = Math.max(...groupEntries.map((entry) => entry.root.position.x + Math.max(entry.halfWidth, entry.radius * 0.4)));
        const minZ = Math.min(...groupEntries.map((entry) => entry.root.position.z - Math.max(entry.halfWidth, entry.radius * 0.4)));
        const maxZ = Math.max(...groupEntries.map((entry) => entry.root.position.z + Math.max(entry.halfWidth, entry.radius * 0.4)));
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;
        const radius = Math.max(maxX - minX, maxZ - minZ, 22) / 2 + 8;
        ring.container.position.set(centerX, 0, centerZ);
        ring.mesh.scale.set(radius, radius, radius);
        ring.hitDisc.scale.set(radius, 1, radius);
        const selected = showGroupSelection && ring.group === selectedGroup;
        if (ring.mesh.material instanceof THREE.MeshBasicMaterial) {
          const groupTeam = groupEntries.reduce<number | null>((acc, e) => acc ?? teamColor(e.ship.team), null);
          ring.mesh.material.color.setHex(groupTeam ?? COLOR_RING);
          ring.mesh.material.opacity = selected ? 0.68 + Math.sin(t * 5) * 0.18 : 0.18;
        }
        ring.mesh.rotation.z = t * 0.45;
        const launcherScale = Math.max(10, Math.min(46, radius * 0.28));
        const isDraggingThisLauncher = dragTarget?.kind === 'vector-launcher' && dragTarget.entry === ring.vectorLauncher;
        if (!isDraggingThisLauncher) {
          ring.vectorLauncher.root.position.set(
            centerX + tacticalFrontDirection.x * (radius + launcherScale * 3.5),
            launcherScale * 1.2,
            centerZ + tacticalFrontDirection.z * (radius + launcherScale * 3.5),
          );
        }
        ring.vectorLauncher.root.visible = selected && vectorsEnabled && !vectorSourceKeys.has(`group:${ring.group}`);
        const grabPulse = isDraggingThisLauncher ? 1.5 + Math.sin(t * 14) * 0.2 : 0.85 + Math.sin(t * 3.5) * 0.15;
        ring.vectorLauncher.root.scale.setScalar(launcherScale * grabPulse);
        ring.vectorLauncher.meshes.forEach((mesh) => {
          if (mesh.material instanceof THREE.MeshBasicMaterial && !mesh.userData.keepInvisible) {
            const base = (mesh.userData.launcherBaseOpacity as number | undefined) ?? 0.82;
            mesh.material.opacity = base * (isDraggingThisLauncher ? 0.7 : 0.85 + Math.sin(t * 3.5) * 0.15);
          }
        });
      });

      markerEntries.forEach((entry) => {
        const isSelected = entry.marker.id === selectedMarkerIdRef.current;
        entry.root.traverse((child) => {
          if (child instanceof THREE.Mesh && (child.material instanceof THREE.MeshBasicMaterial || child.material instanceof THREE.MeshPhongMaterial)) {
            if (child.userData.keepInvisible) {
              child.material.opacity = 0;
              return;
            }
            const base = (child.userData.baseOpacity as number | undefined) ?? 0.5;
            const flick = 0.06 * Math.sin(t * 2.5 + (child.position.y || 0) * 0.05);
            child.material.opacity = Math.min(1, (isSelected ? base * 1.4 + 0.18 : base) + flick);
          }
          if (child instanceof THREE.Group && child.userData.markerSpin) {
            child.rotation.y = t * 0.6;
          }
        });
        if (entry.pulse) {
          const baseY = (entry.pulse.userData.baseY as number | undefined) ?? entry.pulse.position.y;
          entry.pulse.position.y = baseY + Math.sin(t * 1.6) * 3;
          const scale = isSelected ? 1.18 + Math.sin(t * 4) * 0.08 : 1;
          entry.pulse.scale.set(scale, scale, scale);
        }
      });

      vectorEntries.forEach((entry) => {
        // Follow source position when ship/group moves
        const srcEs = entry.vector.sourceType === 'group'
          ? entries.filter((e) => e.ship.group === entry.vector.sourceId)
          : entries.filter((e) => e.ship.id === entry.vector.sourceId);
        const srcX = srcEs.length ? srcEs.reduce((s, e) => s + e.root.position.x, 0) / srcEs.length : 0;
        const srcZ = srcEs.length ? srcEs.reduce((s, e) => s + e.root.position.z, 0) / srcEs.length : 0;
        const baseY = vectorBaseY(srcEs);
        if (Math.abs(srcX - entry.lastSourceX) > 1 || Math.abs(srcZ - entry.lastSourceZ) > 1 || Math.abs(baseY - entry.lastBaseY) > 0.5) {
          rebuildVectorGeometry(entry);
        }
        const isSelected = entry.vector.id === selectedVectorIdRef.current;
        const teamCol = vectorTeamColor(srcEs);
        const baseCol = teamCol ?? 0x22f5df;
        const glowCol = teamCol ?? 0x67fff2;
        const handleCol = teamCol !== null
          ? new THREE.Color(teamCol).lerp(new THREE.Color(0xffffff), 0.55).getHex()
          : 0x7dfff4;
        // Selection highlight: brighten the ribbon toward white when selected.
        const ribbonCol = isSelected
          ? new THREE.Color(baseCol).lerp(new THREE.Color(0xffffff), 0.4).getHex()
          : baseCol;
        (entry.ribbon.material as THREE.MeshBasicMaterial).color.setHex(ribbonCol);
        (entry.head.material as THREE.MeshBasicMaterial).color.setHex(ribbonCol);
        (entry.ribbonGlow.material as THREE.MeshBasicMaterial).color.setHex(glowCol);
        (entry.headGlow.material as THREE.MeshBasicMaterial).color.setHex(glowCol);
        const ribbonOpacity = isSelected ? 0.95 + Math.sin(t * 4) * 0.05 : 0.7;
        const glowOpacity = isSelected ? 0.34 : 0.18;
        (entry.ribbon.material as THREE.MeshBasicMaterial).opacity = ribbonOpacity;
        (entry.head.material as THREE.MeshBasicMaterial).opacity = ribbonOpacity;
        (entry.ribbonGlow.material as THREE.MeshBasicMaterial).opacity = glowOpacity;
        (entry.headGlow.material as THREE.MeshBasicMaterial).opacity = glowOpacity;
        // Grab handle: same visual as the creation launcher, only while selected.
        entry.endHandle.visible = isSelected;
        if (isSelected) {
          const pulse = 0.9 + Math.sin(t * 4) * 0.12;
          entry.endHandle.scale.setScalar(vectorHandleSize(srcEs) * (1 + Math.sin(t * 4) * 0.06));
          entry.endHandle.children.forEach((mesh) => {
            if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshBasicMaterial && !mesh.userData.keepInvisible) {
              mesh.material.color.setHex(handleCol);
              const base = (mesh.userData.launcherBaseOpacity as number | undefined) ?? 0.9;
              mesh.material.opacity = base * pulse;
            }
          });
        }
      });

      vectorLaunchers.forEach((launcher) => {
        const entry = entries.find((candidate) => candidate.ship.id === launcher.anchorShip?.id);
        if (!entry) return;
        const isSelected = entry.ship.id === selectedIdRef.current;
        const isPartOfSelectedGroup = showGroupSelection && entry.ship.group === selectedGroup;
        const launcherScale = Math.max(10, Math.min(46, entry.radius * 0.5));
        const distance = Math.max(entry.radius * 1.8, 64);
        const isDraggingThisLauncher = dragTarget?.kind === 'vector-launcher' && dragTarget.entry === launcher;
        if (!isDraggingThisLauncher) {
          launcher.root.position.set(
            entry.root.position.x + tacticalFrontDirection.x * distance,
            launcherScale * 1.2,
            entry.root.position.z + tacticalFrontDirection.z * distance,
          );
        }
        const shipHasVector = vectorSourceKeys.has(`ship:${entry.ship.id}`)
          || (!!entry.ship.group && vectorSourceKeys.has(`group:${entry.ship.group}`));
        launcher.root.visible = isSelected && !isPartOfSelectedGroup && vectorsEnabled && !shipHasVector;
        const pulse = isDraggingThisLauncher ? 1.5 + Math.sin(t * 14) * 0.2 : 0.85 + Math.sin(t * 3.5) * 0.15;
        launcher.root.scale.setScalar(launcherScale * pulse);
        launcher.meshes.forEach((mesh) => {
          if (mesh.material instanceof THREE.MeshBasicMaterial && !mesh.userData.keepInvisible) {
            const base = (mesh.userData.launcherBaseOpacity as number | undefined) ?? 0.82;
            mesh.material.opacity = base * (isDraggingThisLauncher ? 0.7 : 0.85 + Math.sin(t * 3.5) * 0.15);
          }
        });
      });

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // ── Resize ─────────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(getThreePixelRatio());
      renderer.setSize(w, h);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      visibility.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup',   onPointerUp);
      renderer.domElement.removeEventListener('wheel', preventPageWheel);
      saveCameraView();
      controls.removeEventListener('change', saveCameraView);
      controls.dispose();
      holoMat.dispose();
      syncMarkersRef.current = null;
      syncShipPositionsRef.current = null;
      disposeObject3D(scene);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      rendererRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipsKey]);

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
