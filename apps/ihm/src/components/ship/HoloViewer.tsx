'use client';

import { Box } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CTMLoader } from '@/lib/CTMLoader';

interface Props {
  shipUuid: string;
  shipName: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function HoloViewer({ shipUuid, shipName }: Props) {
  const ctmUrl = `/api/v1/ships/${shipUuid}/model/file`;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!ctmUrl || !canvasRef.current) return;

    const container = canvasRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // ── Scene ──────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040d18);

    // Grid
    const grid = new THREE.GridHelper(60, 30, 0x0d2d40, 0x071520);
    grid.position.y = -10;
    scene.add(grid);

    // Lights
    scene.add(new THREE.AmbientLight(0x1a3a55, 2));
    const key = new THREE.DirectionalLight(0x60d0ff, 3);
    key.position.set(5, 8, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x1040a0, 1.5);
    fill.position.set(-4, 2, -5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x00ffcc, 1);
    rim.position.set(0, -3, -8);
    scene.add(rim);

    // ── Renderer ───────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Camera ─────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 50000);
    camera.position.set(0, 5, 20);

    // ── Controls ───────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.enablePan = false;

    // ── Load CTM ───────────────────────────────────────────────────────
    setLoadState('loading');
    const loader = new CTMLoader();
    loader.load(
      ctmUrl,
      (geometry) => {
        // Axes réels Arrow CTM (MG2Header bounding box) :
        //   span Z=1779 (nez+longueur), X=1202 (ailes), Y=306 (hauteur)
        //   → nose = +Z, up = +Y  (convention OpenGL standard)
        // Ry(90°) : nose (0,0,1) → (1,0,0), up (0,1,0) → (0,1,0) ✓
        const pivot = new THREE.Group();
        pivot.rotation.set(0, Math.PI / 2, 0);
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: 0x8ab4cc,
            metalness: 0.6,
            roughness: 0.4,
            side: THREE.DoubleSide,
          }),
        );
        pivot.add(mesh);
        scene.add(pivot);

        // Centrer en world space (après rotation)
        pivot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(pivot);
        const center = new THREE.Vector3();
        box.getCenter(center);
        pivot.position.sub(center);

        // Recalculer pour adapter la caméra
        pivot.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(pivot);
        const sphere = new THREE.Sphere();
        box2.getBoundingSphere(sphere);
        const r = sphere.radius;

        camera.near = r * 0.001;
        camera.far  = r * 200;
        // Angle RSI : légèrement au-dessus, sur le côté avant
        camera.position.set(r * 0.3, r * 0.45, r * 1.6);
        camera.updateProjectionMatrix();

        controls.minDistance = r * 0.2;
        controls.maxDistance = r * 30;
        controls.target.set(0, 0, 0);
        controls.update();

        grid.position.y = -r;
        setLoadState('ready');
      },
      undefined,
      () => setLoadState('error'),
    );

    // ── Render loop ────────────────────────────────────────────────────
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── Resize ────────────────────────────────────────────────────────
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      rendererRef.current = null;
    };
  }, [ctmUrl]);

  if (!ctmUrl) return null;

  return (
    <div className="sci-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60 bg-slate-900/40">
        <div className="flex items-center gap-2 text-xs font-mono-sc text-cyan-700 uppercase tracking-widest">
          <Box size={13} />
          Holoviewer
        </div>
        <div className="flex items-center gap-3">
          {loadState === 'loading' && (
            <span className="text-[10px] font-mono-sc text-yellow-600 uppercase tracking-wider animate-pulse">
              Chargement…
            </span>
          )}
          {loadState === 'ready' && (
            <span className="text-[10px] font-mono-sc text-cyan-700 uppercase tracking-wider">
              {shipName}
            </span>
          )}
          {loadState === 'error' && (
            <span className="text-[10px] font-mono-sc text-red-600 uppercase tracking-wider">
              Erreur de chargement
            </span>
          )}
        </div>
      </div>

      {/* Canvas 3D */}
      <div
        ref={canvasRef}
        className="w-full"
        style={{ height: 340 }}
        title="Clic gauche: rotation · Scroll: zoom"
      />

      {/* Footer hint */}
      {loadState === 'ready' && (
        <div className="px-4 py-1.5 border-t border-slate-800/40 bg-slate-900/20 text-[10px] font-mono-sc text-slate-600 text-center">
          Clic gauche: rotation · Scroll: zoom
        </div>
      )}
    </div>
  );
}

