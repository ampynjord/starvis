'use client';

import { Box } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CTMLoader } from '@/lib/CTMLoader';
import { createVisibilityTracker, disposeObject3D, getThreePixelRatio } from '@/lib/three-performance';
import { API_BASE } from '@/utils/constants';

interface Props {
  shipUuid: string;
  shipName: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function ShipHoloViewer({ shipUuid, shipName }: Props) {
  const ctmUrl = `${API_BASE}/ships/${shipUuid}/model/file`;
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
    scene.background = new THREE.Color(0x08111e);

    // ── Lighting (modeled after RSI Holoviewer) ────────────────────────
    // Very dark ambient — ship hollows remain nearly black
    scene.add(new THREE.AmbientLight(0x0a2535, 2.5));

    // Key light: top-front, strong white-cyan → bright flat surfaces
    const key = new THREE.DirectionalLight(0x60d8ef, 4.5);
    key.position.set(0.4, 1.0, 0.6);
    scene.add(key);

    // Very soft fill on the opposite side (avoids total black on flanks)
    const fill = new THREE.DirectionalLight(0x1060a0, 0.6);
    fill.position.set(-1, 0.2, -0.8);
    scene.add(fill);

    // ── Renderer ───────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(getThreePixelRatio());
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    controls.autoRotateSpeed = 0.5;
    controls.enablePan = false;
    const visibility = createVisibilityTracker(container);

    // ── RSI hologram material (MeshPhong — soft shadow, light specular) ─
    const holoMaterial = new THREE.MeshPhongMaterial({
      color: 0x1aa8c0,      // cyan-turquoise hologramme
      emissive: 0x041828,   // slight self-glow to avoid total black
      specular: 0x66ddff,   // reflets brillants blanc-bleu
      shininess: 55,
      side: THREE.DoubleSide,
    });

    // ── Load CTM ───────────────────────────────────────────────────────
    setLoadState('loading');
    const loader = new CTMLoader();
    loader.load(
      ctmUrl,
      (geometry) => {
        const pivot = new THREE.Group();
        pivot.rotation.set(0, Math.PI / 2, 0);

        const mesh = new THREE.Mesh(geometry, holoMaterial);
        pivot.add(mesh);
        scene.add(pivot);

        // Centrer en world space
        pivot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(pivot);
        const center = new THREE.Vector3();
        box.getCenter(center);
        pivot.position.sub(center);

        pivot.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(pivot);
        const sphere = new THREE.Sphere();
        box2.getBoundingSphere(sphere);
        const r = sphere.radius;

        camera.near = r * 0.001;
        camera.far  = r * 200;
        camera.position.set(r * 0.3, r * 0.45, r * 1.6);
        camera.updateProjectionMatrix();

        controls.minDistance = r * 0.2;
        controls.maxDistance = r * 30;
        controls.target.set(0, 0, 0);
        controls.update();

        // ── Grille de sol ─────────────────────────────────────────────
        const floorY = box2.min.y - r * 0.04;
        const gridSize = r * 8;
        const divs = Math.max(10, Math.round(gridSize / (r / 2)));

        const grid = new THREE.GridHelper(gridSize, divs, 0x1a5472, 0x0a2233);
        grid.position.y = floorY;
        scene.add(grid);

        setLoadState('ready');
      },
      undefined,
      () => setLoadState('error'),
    );

    // ── Render loop ────────────────────────────────────────────────────
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      if (!visibility.isVisible()) return;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── Resize ─────────────────────────────────────────────────────────
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(getThreePixelRatio());
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      visibility.dispose();
      controls.dispose();
      disposeObject3D(scene);
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
