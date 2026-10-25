'use client';

import { Box } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadCachedGeometry } from '@/components/holo/ctm-geometry-cache';
import { useLanguage } from '@/contexts/LanguageContext';
import { CTMLoader } from '@/lib/CTMLoader';
import { createVisibilityTracker, disposeObject3D, getThreePixelRatio } from '@/lib/three-performance';
import { API_BASE } from '@/utils/constants';

interface Props {
  shipUuid: string;
  shipName: string;
  /** When false, skip WebGL and show an empty state (e.g. no `ctm_url`). */
  hasModel?: boolean;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export function ShipHoloViewer({ shipUuid, shipName, hasModel = true }: Props) {
  const { t } = useLanguage();
  const ctmUrl = hasModel ? `${API_BASE}/ships/${encodeURIComponent(shipUuid)}/model/file` : null;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<LoadState>(hasModel ? 'idle' : 'unavailable');
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!hasModel) {
      setLoadState('unavailable');
      return;
    }
    if (!ctmUrl || !canvasRef.current) return;
    let disposed = false;

    const container = canvasRef.current;
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08111e);

    scene.add(new THREE.AmbientLight(0x0a2535, 2.5));

    const key = new THREE.DirectionalLight(0x60d8ef, 4.5);
    key.position.set(0.4, 1.0, 0.6);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x1060a0, 0.6);
    fill.position.set(-1, 0.2, -0.8);
    scene.add(fill);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(getThreePixelRatio());
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 50000);
    camera.position.set(0, 5, 20);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.enablePan = false;
    const visibility = createVisibilityTracker(container);

    const holoMaterial = new THREE.MeshPhongMaterial({
      color: 0x1aa8c0,
      emissive: 0x041828,
      specular: 0x66ddff,
      shininess: 55,
      side: THREE.DoubleSide,
    });

    setLoadState('loading');
    const loader = new CTMLoader();
    void loadCachedGeometry(loader, ctmUrl)
      .then((geometry) => {
        if (disposed) return;
        const pivot = new THREE.Group();
        pivot.rotation.set(0, Math.PI / 2, 0);

        const mesh = new THREE.Mesh(geometry, holoMaterial);
        pivot.add(mesh);
        scene.add(pivot);

        pivot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(pivot);
        const center = new THREE.Vector3();
        box.getCenter(center);
        pivot.position.sub(center);

        pivot.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(pivot);
        const sphere = new THREE.Sphere();
        box2.getBoundingSphere(sphere);
        const r = Math.max(sphere.radius, 0.01);

        camera.near = r * 0.001;
        camera.far = r * 200;
        camera.position.set(r * 0.3, r * 0.45, r * 1.6);
        camera.updateProjectionMatrix();

        controls.minDistance = r * 0.2;
        controls.maxDistance = r * 30;
        controls.target.set(0, 0, 0);
        controls.update();

        const floorY = box2.min.y - r * 0.04;
        const gridSize = r * 8;
        const divs = Math.max(10, Math.round(gridSize / (r / 2)));

        const grid = new THREE.GridHelper(gridSize, divs, 0x1a5472, 0x0a2233);
        grid.position.y = floorY;
        scene.add(grid);

        setLoadState('ready');
      })
      .catch(() => {
        if (!disposed) setLoadState('error');
      });

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      if (!visibility.isVisible()) return;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(getThreePixelRatio());
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      visibility.dispose();
      controls.dispose();
      disposeObject3D(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
    };
  }, [ctmUrl, hasModel]);

  return (
    <div className="sci-panel overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-800/60 bg-slate-900/40">
        <div className="flex items-center gap-2 text-xs font-mono-sc text-cyan-700 uppercase tracking-widest">
          <Box size={13} />
          {t('holo_title')}
        </div>
        <div className="flex items-center gap-3 min-w-0">
          {loadState === 'loading' && (
            <span className="text-[10px] font-mono-sc text-yellow-600 uppercase tracking-wider animate-pulse">
              {t('holo_loading')}
            </span>
          )}
          {loadState === 'ready' && (
            <span className="text-[10px] font-mono-sc text-cyan-700 uppercase tracking-wider truncate max-w-[12rem] sm:max-w-none">
              {shipName}
            </span>
          )}
          {(loadState === 'error' || loadState === 'unavailable') && (
            <span className="text-[10px] font-mono-sc text-slate-500 uppercase tracking-wider">
              {t('holo_error')}
            </span>
          )}
        </div>
      </div>

      <div className="relative w-full bg-[#08111e]" style={{ height: 'min(42vw, 380px)', minHeight: 240 }} title={t('holo_hint')}>
        {hasModel && <div ref={canvasRef} className="absolute inset-0" />}
        {(loadState === 'loading' || loadState === 'error' || loadState === 'unavailable') && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            {loadState === 'loading' ? (
              <div className="h-8 w-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
            ) : (
              <p className="px-4 text-center text-xs font-mono-sc text-slate-500 max-w-sm">{t('holo_unavailable')}</p>
            )}
          </div>
        )}
      </div>

      {loadState === 'ready' && ctmUrl && (
        <div className="px-3 sm:px-4 py-2 border-t border-slate-800/40 bg-slate-900/20 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-sc text-slate-500">
          <span className="hidden sm:inline">{t('holo_hint')}</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-slate-600 uppercase">{t('holo_export')}</span>
            <a
              href={`${ctmUrl}?format=glb`}
              download
              className="px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
              title={t('holo_dl_glb')}
            >
              GLB
            </a>
            <a
              href={`${ctmUrl}?format=obj`}
              download
              className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/60 text-slate-300 hover:border-cyan-500/30 hover:text-cyan-300 transition-colors"
              title={t('holo_dl_obj')}
            >
              OBJ
            </a>
            <a
              href={ctmUrl}
              download
              className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/60 text-slate-400 hover:border-cyan-500/30 hover:text-cyan-300 transition-colors"
              title={t('holo_dl_ctm')}
            >
              CTM
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
