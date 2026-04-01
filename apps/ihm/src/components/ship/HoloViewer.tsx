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

// ── Hologram shaders (style RSI Holoviewer) ────────────────────────────────
const holoVertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(transpose(inverse(modelMatrix))) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const holoFragmentShader = /* glsl */`
  uniform float time;
  uniform vec3 cameraPos;

  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    // Fresnel — lumineux sur les arêtes de silhouette
    vec3 viewDir = normalize(cameraPos - vWorldPos);
    float NdotV   = max(dot(normalize(vNormal), viewDir), 0.0);
    float fresnel = pow(1.0 - NdotV, 2.8);

    // Scanline subtile
    float scan = sin(vWorldPos.y * 22.0 + time * 1.8) * 0.025 + 0.975;

    // Couleurs RSI : gris-acier bleuté en face, cyan vif sur les bords
    vec3 faceColor = vec3(0.22, 0.42, 0.60);
    vec3 rimColor  = vec3(0.20, 0.82, 1.00);

    vec3 color = mix(faceColor, rimColor, fresnel);
    color *= scan;

    gl_FragColor = vec4(color, 1.0);
  }
`;

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
    scene.background = new THREE.Color(0x030b15);

    // Grid (style RSI — teinte bleue sombre)
    const grid = new THREE.GridHelper(200, 60, 0x0a2a42, 0x061525);
    grid.position.y = -10;
    scene.add(grid);

    // Lumières complémentaires au shader (le fresnel gère l'essentiel)
    scene.add(new THREE.AmbientLight(0x0d2035, 3));
    const key = new THREE.DirectionalLight(0x4ab8e8, 1.2);
    key.position.set(6, 10, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x0a2a60, 0.6);
    fill.position.set(-5, 3, -6);
    scene.add(fill);

    // ── Renderer ───────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
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

    // ── Shared hologram material ───────────────────────────────────────
    const holoMaterial = new THREE.ShaderMaterial({
      vertexShader: holoVertexShader,
      fragmentShader: holoFragmentShader,
      uniforms: {
        time: { value: 0 },
        cameraPos: { value: camera.position },
      },
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

        // Maillage principal avec shader hologramme
        const mesh = new THREE.Mesh(geometry, holoMaterial);
        pivot.add(mesh);

        // Couche rim-glow (coque inversée légèrement élargie — technique RSI)
        const rimMat = new THREE.MeshBasicMaterial({
          color: 0x00c8f0,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        });
        const rimMesh = new THREE.Mesh(geometry, rimMat);
        rimMesh.scale.setScalar(1.012);
        pivot.add(rimMesh);

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
    const clock = new THREE.Clock();
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      // Uniforms hologramme
      holoMaterial.uniforms.time.value = clock.getElapsedTime();
      holoMaterial.uniforms.cameraPos.value.copy(camera.position);
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
      holoMaterial.dispose();
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

