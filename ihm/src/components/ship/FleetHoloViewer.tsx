'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CTMLoader } from '@/lib/CTMLoader';
import { createVisibilityTracker, disposeObject3D, getThreePixelRatio } from '@/lib/three-performance';

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
  group?: string | null;
  gridX?: number | null;
  gridZ?: number | null;
}

export interface TacticalMarker {
  id: string;
  type: 'objective' | 'poi' | 'obstacle';
  label: string;
  gridX: number;
  gridZ: number;
  rotation?: number;
}

export interface TacticalVector {
  id: string;
  sourceType: 'ship' | 'group';
  sourceId: number | string;
  endX: number;
  endZ: number;
  controlX: number;
  controlZ: number;
}

interface Props {
  ships: FleetShip[];
  selectedId: number | null;
  onSelect: (id: number) => void;
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
const COLOR_DEFAULT  = 0x0d7a90;
const COLOR_SELECTED = 0x20e4ff;
const EMISS_DEFAULT  = 0x020c12;
const COLOR_OUTLINE  = 0x00d4ff;
const COLOR_RING     = 0x00c8f0;
const MIN_SHIP_GAP   = 8;
const SHIP_GAP_RATIO = 0.18;
const FLEET_MODEL_FRONT_ROTATION_Y = Math.PI;

const geometryCache = new Map<string, Promise<THREE.BufferGeometry>>();

function loadCachedGeometry(loader: CTMLoader, url: string): Promise<THREE.BufferGeometry> {
  let cached = geometryCache.get(url);
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });
    geometryCache.set(url, cached);
  }
  return cached.then((geometry) => geometry.clone());
}

interface CameraViewState {
  position: THREE.Vector3;
  target: THREE.Vector3;
  userHasMoved: boolean;
}

export function FleetHoloViewer({
  ships,
  selectedId,
  onSelect,
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
  const cameraViewRef = useRef<CameraViewState | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const shipsKey = ships
    .map((ship) => [ship.id, ship.shipUuid, ship.ctmUrl ?? '', ship.group ?? ''].join(':'))
    .join('|')
    + `::${tacticalVectors.map((v) => [v.id, v.sourceType, v.sourceId, v.endX.toFixed(1), v.endZ.toFixed(1), v.controlX.toFixed(1), v.controlZ.toFixed(1)].join(':')).join('|')}`;

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

  useEffect(() => {
    if (!containerRef.current || (ships.length === 0 && tacticalMarkers.length === 0 && tacticalVectors.length === 0)) return;
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
      pulse: THREE.Mesh | null;
    };

    type VectorEntry = {
      vector: TacticalVector;
      root: THREE.Group;
      meshes: THREE.Object3D[];
      endHandle: THREE.Mesh;
      curveHandle: THREE.Mesh;
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

    const makeVectorLauncher = (sourceType: 'ship' | 'group', sourceId: number | string, anchorShip?: FleetShip): VectorLauncherEntry => {
      const root = new THREE.Group();
      root.visible = false;
      root.renderOrder = 80;
      const material = new THREE.MeshBasicMaterial({ color: 0x7dfff4, transparent: true, opacity: 0.98, side: THREE.DoubleSide, depthTest: false });
      const halo = new THREE.Mesh(new THREE.TorusGeometry(22, 1.6, 10, 72), material.clone());
      halo.rotation.x = -Math.PI / 2;
      const hitDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(27, 27, 2, 48),
        new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.08, depthTest: false }),
      );
      hitDisc.position.y = -0.8;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(12, 24, 3), material);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.z = -9;
      const stem = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 30), material.clone());
      stem.position.z = 10;
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(6.5, 24, 16), material.clone());
      beacon.position.y = 9;
      for (const mesh of [halo, hitDisc, arrow, stem, beacon]) {
        mesh.renderOrder = 80;
        mesh.userData.vectorLauncherSourceType = sourceType;
        mesh.userData.vectorLauncherSourceId = sourceId;
      }
      root.add(hitDisc, halo, arrow, stem, beacon);
      scene.add(root);
      return { root, meshes: [hitDisc, halo, arrow, stem, beacon], sourceType, sourceId, anchorShip, group: sourceType === 'group' ? String(sourceId) : undefined };
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

      const colorByType = {
        objective: 0xfacc15,
        poi: 0x22d3ee,
        obstacle: 0xef4444,
      } satisfies Record<TacticalMarker['type'], number>;
      const color = colorByType[marker.type];
      const mat = new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.82,
        transparent: true,
        opacity: 0.9,
        shininess: 80,
      });
      const ghostMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
      const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const meshes: THREE.Object3D[] = [];

      let body: THREE.Object3D;
      if (marker.type === 'obstacle') {
        body = new THREE.Group();
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.45, 13, 8), mat);
        stem.position.y = 9.2;
        stem.rotation.z = -0.12;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(2.25, 22, 14), mat.clone());
        dot.position.set(0, 1.9, 0);
        const crown = new THREE.Mesh(new THREE.OctahedronGeometry(3.6, 0), ghostMat.clone());
        crown.position.y = 16.8;
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 7.4, 0.25, 3), ghostMat.clone());
        glow.rotation.y = Math.PI / 3;
        glow.position.y = 0.18;
        body.add(stem, dot, crown, glow);
      } else if (marker.type === 'poi') {
        body = new THREE.Group();
        const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(4.4, 1), mat);
        beacon.position.y = 12;
        const core = new THREE.Mesh(new THREE.SphereGeometry(1.9, 24, 14), mat.clone());
        core.position.y = 5.6;
        const scan = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.22, 8, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78, depthTest: false }));
        scan.position.y = 9.2;
        scan.rotation.x = -Math.PI / 2;
        const halo = new THREE.Mesh(new THREE.TorusGeometry(6.8, 0.14, 8, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, depthTest: false }));
        halo.position.y = 0.35;
        halo.rotation.x = -Math.PI / 2;
        body.add(beacon, core, scan, halo);
      } else {
        body = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 15, 16), mat);
        shaft.position.y = 12.2;
        const fins = new THREE.Mesh(new THREE.ConeGeometry(4.8, 4.8, 4), ghostMat.clone());
        fins.position.y = 7.6;
        fins.rotation.y = Math.PI / 4;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(3.9, 8.6, 28), mat.clone());
        tip.position.y = 3.6;
        tip.rotation.x = Math.PI;
        const target = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.2, 8, 72), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.84, depthTest: false }));
        target.position.y = 0.25;
        target.rotation.x = -Math.PI / 2;
        body.add(shaft, fins, tip, target);
      }
      body.traverse((child) => { child.userData.tacticalMarkerId = marker.id; });
      root.add(body);
      meshes.push(body);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(marker.type === 'obstacle' ? 8 : 6, 0.16, 8, 64), mat.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.2;
      ring.userData.tacticalMarkerId = marker.id;
      root.add(ring);
      meshes.push(ring);

      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(10, 0.1, 10)), lineMat);
      edges.position.y = 0.1;
      edges.userData.tacticalMarkerId = marker.id;
      root.add(edges);
      scene.add(root);
      return { marker, root, meshes, pulse: ring };
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

    const makeVectorEntry = (vector: TacticalVector): VectorEntry => {
      const root = new THREE.Group();
      const sourceEntries = vector.sourceType === 'group'
        ? entries.filter((entry) => entry.ship.group === vector.sourceId)
        : entries.filter((entry) => entry.ship.id === vector.sourceId);
      const sourceX = sourceEntries.length ? sourceEntries.reduce((sum, entry) => sum + entry.root.position.x, 0) / sourceEntries.length : 0;
      const sourceZ = sourceEntries.length ? sourceEntries.reduce((sum, entry) => sum + entry.root.position.z, 0) / sourceEntries.length : 0;
      const start = new THREE.Vector3(sourceX, 0.55, sourceZ);
      const control = new THREE.Vector3(vector.controlX, 0.55, vector.controlZ);
      const end = new THREE.Vector3(vector.endX, 0.55, vector.endZ);
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const mat = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthTest: false });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.35, 6, false), mat);
      tube.userData.tacticalVectorId = vector.id;
      const direction = end.clone().sub(control);
      const angle = Math.atan2(direction.x, direction.z);
      const head = new THREE.Mesh(new THREE.ConeGeometry(3.2, 8, 3), mat.clone());
      head.position.copy(end);
      head.position.y = 0.8;
      head.rotation.set(Math.PI / 2, 0, -angle);
      head.userData.tacticalVectorId = vector.id;
      const endHandle = new THREE.Mesh(new THREE.SphereGeometry(5.8, 16, 12), new THREE.MeshBasicMaterial({ color: 0xa7f3d0, transparent: true, opacity: 0.96, depthTest: false }));
      endHandle.position.copy(end);
      endHandle.position.y = 2;
      endHandle.userData.tacticalVectorId = vector.id;
      endHandle.userData.vectorHandle = 'end';
      const curveHandle = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.9, 8, 32), new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.95, depthTest: false }));
      curveHandle.position.copy(control);
      curveHandle.position.y = 1.5;
      curveHandle.rotation.x = -Math.PI / 2;
      curveHandle.userData.tacticalVectorId = vector.id;
      curveHandle.userData.vectorHandle = 'control';
      root.add(tube, head, endHandle, curveHandle);
      scene.add(root);
      return { vector, root, meshes: [tube, head, endHandle, curveHandle], endHandle, curveHandle };
    };

    const vectorEntries = tacticalVectors.map(makeVectorEntry);

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
        xs.push(entry.root.position.x - 14, entry.root.position.x + 14);
        zs.push(entry.root.position.z - 14, entry.root.position.z + 14);
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
      let x = -totalSpan / 2;
      entries.forEach((e) => {
        e.root.position.x = Number.isFinite(e.ship.gridX ?? NaN) ? Number(e.ship.gridX) : x + e.halfWidth;
        e.root.position.z = Number.isFinite(e.ship.gridZ ?? NaN) ? Number(e.ship.gridZ) : 0;
        x += e.halfWidth * 2 + gap;
      });
    };

    const vectorLaunchers: VectorLauncherEntry[] = entries.map((entry) => makeVectorLauncher('ship', entry.ship.id, entry.ship));
    const allVectorLaunchers = [...vectorLaunchers, ...groupRings.map((ring) => ring.vectorLauncher)];

    const refreshLayout = (fitView = !userHasMovedView) => {
      updateGrid();
      if (fitView) fitCamera();
    };

    const fitCamera = () => {
      const metrics = getSceneMetrics();
      const dist = Math.max(metrics.span, metrics.radius * 3, 80) * 1.2;
      const height = metrics.radius * 0.5;
      camera.near = dist * 0.001;
      camera.far  = dist * 200;
      camera.updateProjectionMatrix();
      // Position camera like the single HoloViewer, but pulled back for fleet width
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
    const CARD_H = 14;
    const CARD_W = CARD_H * 1.78;

    placeShipsOnce();
    refreshLayout();

    const markLoaded = (entry: ShipEntry, radius: number, halfWidth: number) => {
      entry.radius = radius;
      entry.halfWidth = halfWidth;
      entry.loaded = true;
      loadedSoFar++;
      setLoadedCount(loadedSoFar);
      refreshLayout();
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
          refreshLayout();
        }
        return;
      }

      const modelUrl = `/api/v1/ships/${entry.ship.shipUuid}/model/file`;
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
      | { kind: 'vector-handle'; entry: VectorEntry; root: THREE.Object3D; handle: 'end' | 'control' }
      | { kind: 'vector-launcher'; entry: VectorLauncherEntry; root: THREE.Group };
    let dragTarget: DragTarget | null = null;
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragPoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();

    const getHitTarget = (clientX: number, clientY: number): DragTarget | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const meshes: THREE.Object3D[] = [];
      entries.forEach((entry) => entry.meshes.forEach((mesh) => meshes.push(mesh)));
      markerEntries.forEach((entry) => entry.meshes.forEach((mesh) => meshes.push(mesh)));
      vectorEntries.forEach((entry) => entry.meshes.forEach((mesh) => meshes.push(mesh)));
      allVectorLaunchers.filter((entry) => entry.root.visible).forEach((entry) => entry.meshes.forEach((mesh) => meshes.push(mesh)));
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
          const handle = obj.userData.vectorHandle === 'control' ? 'control' : 'end';
          return entry ? { kind: 'vector-handle', entry, root: obj, handle } : null;
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

        // Compute drag offset
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const refPos = target.kind === 'group' ? target.startCenter : target.root.position;
        dragPlane.constant = -refPos.y;
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
        dragPlane.constant = -dragTarget.root.position.y;
        raycaster.ray.intersectPlane(dragPlane, dragPoint);
        if (dragTarget.kind === 'vector-handle') {
          dragTarget.root.position.x = dragPoint.x;
          dragTarget.root.position.z = dragPoint.z;
        } else if (dragTarget.kind === 'vector-launcher') {
          dragTarget.root.position.x = dragPoint.x;
          dragTarget.root.position.z = dragPoint.z;
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
      if (!isDragging && dragTarget) {
        if (dragTarget.kind === 'ship') onSelectRef.current(dragTarget.entry.ship.id);
        if (dragTarget.kind === 'group') {
          const groupName = dragTarget.group;
          const firstShip = entries.find((entry) => entry.ship.group === groupName);
          if (firstShip) onSelectRef.current(firstShip.ship.id);
        }
        if (dragTarget.kind === 'marker') onMarkerSelectRef.current?.(dragTarget.entry.marker.id);
        if (dragTarget.kind === 'vector-handle') onVectorSelectRef.current?.(dragTarget.entry.vector.id);
        if (dragTarget.kind === 'vector-launcher') {
          const launcherTarget = dragTarget;
          const sourceEntries =
            launcherTarget.entry.sourceType === 'group'
              ? entries.filter((entry) => entry.ship.group === launcherTarget.entry.sourceId)
              : entries.filter((entry) => entry.ship.id === launcherTarget.entry.sourceId);
          const startX = sourceEntries.length ? sourceEntries.reduce((sum, entry) => sum + entry.root.position.x, 0) / sourceEntries.length : 0;
          const startZ = sourceEntries.length ? sourceEntries.reduce((sum, entry) => sum + entry.root.position.z, 0) / sourceEntries.length : 0;
          const endX = launcherTarget.entry.root.position.x;
          const endZ = launcherTarget.entry.root.position.z - 48;
          onVectorCreateRef.current?.({
            sourceType: launcherTarget.entry.sourceType,
            sourceId: launcherTarget.entry.sourceId,
            endX,
            endZ,
            controlX: (startX + endX) / 2,
            controlZ: (startZ + endZ) / 2 - 18,
          });
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
        if (dragTarget.kind === 'vector-handle') {
          const vector = dragTarget.entry.vector;
          onVectorChangeRef.current?.(vector.id, {
            endX: dragTarget.handle === 'end' ? dragTarget.root.position.x : vector.endX,
            endZ: dragTarget.handle === 'end' ? dragTarget.root.position.z : vector.endZ,
            controlX: dragTarget.handle === 'control' ? dragTarget.root.position.x : vector.controlX,
            controlZ: dragTarget.handle === 'control' ? dragTarget.root.position.z : vector.controlZ,
          });
        }
        if (dragTarget.kind === 'vector-launcher') {
          const launcherTarget = dragTarget;
          const sourceEntries =
            launcherTarget.entry.sourceType === 'group'
              ? entries.filter((entry) => entry.ship.group === launcherTarget.entry.sourceId)
              : entries.filter((entry) => entry.ship.id === launcherTarget.entry.sourceId);
          const startX = sourceEntries.length ? sourceEntries.reduce((sum, entry) => sum + entry.root.position.x, 0) / sourceEntries.length : 0;
          const startZ = sourceEntries.length ? sourceEntries.reduce((sum, entry) => sum + entry.root.position.z, 0) / sourceEntries.length : 0;
          onVectorCreateRef.current?.({
            sourceType: launcherTarget.entry.sourceType,
            sourceId: launcherTarget.entry.sourceId,
            endX: launcherTarget.root.position.x,
            endZ: launcherTarget.root.position.z,
            controlX: (startX + launcherTarget.root.position.x) / 2,
            controlZ: (startZ + launcherTarget.root.position.z) / 2 - 18,
          });
        }
      }
      saveCameraView();
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

        // Ring
        if (entry.ring && entry.ring.material instanceof THREE.MeshBasicMaterial) {
          entry.ring.material.opacity = isSelected && !showGroupSelection ? 0.6 + Math.sin(t * 5) * 0.25 : 0;
          entry.ring.rotation.z = t * 1.2;
          if (isSelected && !showGroupSelection) {
            const pulse = 1 + Math.sin(t * 3) * 0.06;
            entry.ring.scale.set(pulse, 1, pulse);
          }
        }
      });

      const cameraFrontDirection = new THREE.Vector3(
        camera.position.x - controls.target.x,
        0,
        camera.position.z - controls.target.z,
      );
      if (cameraFrontDirection.lengthSq() < 0.001) cameraFrontDirection.set(0, 0, 1);
      cameraFrontDirection.normalize();

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
          ring.mesh.material.opacity = selected ? 0.68 + Math.sin(t * 5) * 0.18 : 0.18;
        }
        ring.mesh.rotation.z = t * 0.45;
        ring.vectorLauncher.root.position.set(
          centerX + cameraFrontDirection.x * (radius + 34),
          10,
          centerZ + cameraFrontDirection.z * (radius + 34),
        );
        ring.vectorLauncher.root.rotation.y = Math.atan2(cameraFrontDirection.x, cameraFrontDirection.z);
        ring.vectorLauncher.root.visible = selected;
        ring.vectorLauncher.meshes.forEach((mesh, index) => {
          if (mesh.material instanceof THREE.MeshBasicMaterial) {
            mesh.material.opacity = index === 0 ? 0.12 : index === 1 ? 0.78 + Math.sin(t * 5) * 0.16 : 0.96 + Math.sin(t * 5) * 0.04;
          }
        });
      });

      markerEntries.forEach((entry) => {
        const isSelected = entry.marker.id === selectedMarkerIdRef.current;
        entry.root.traverse((child) => {
          if (child instanceof THREE.Mesh && (child.material instanceof THREE.MeshBasicMaterial || child.material instanceof THREE.MeshPhongMaterial)) {
            child.material.opacity = isSelected ? 0.9 : 0.62 + Math.sin(t * 2.5) * 0.08;
          }
        });
        if (entry.pulse) {
          const scale = isSelected ? 1.18 + Math.sin(t * 4) * 0.08 : 1;
          entry.pulse.scale.set(scale, scale, scale);
        }
      });

      vectorEntries.forEach((entry) => {
        const isSelected = entry.vector.id === selectedVectorIdRef.current;
        entry.root.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
            child.material.opacity = isSelected ? 0.95 : 0.7;
          }
        });
        const handleScale = isSelected ? 1.15 + Math.sin(t * 4) * 0.08 : 1;
        entry.endHandle.scale.setScalar(handleScale);
        entry.curveHandle.scale.setScalar(handleScale);
      });

      vectorLaunchers.forEach((launcher) => {
        const entry = entries.find((candidate) => candidate.ship.id === launcher.anchorShip?.id);
        if (!entry) return;
        const isSelected = entry.ship.id === selectedIdRef.current;
        const isPartOfSelectedGroup = showGroupSelection && entry.ship.group === selectedGroup;
        const distance = Math.max(entry.radius * 1.35, 34);
        launcher.root.position.set(
          entry.root.position.x + cameraFrontDirection.x * distance,
          10,
          entry.root.position.z + cameraFrontDirection.z * distance,
        );
        launcher.root.rotation.y = Math.atan2(cameraFrontDirection.x, cameraFrontDirection.z);
        launcher.root.visible = isSelected && !isPartOfSelectedGroup;
        launcher.meshes.forEach((mesh, index) => {
          if (mesh.material instanceof THREE.MeshBasicMaterial) {
            mesh.material.opacity = index === 0 ? 0.12 : index === 1 ? 0.7 + Math.sin(t * 5) * 0.18 : 0.94 + Math.sin(t * 5) * 0.06;
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
