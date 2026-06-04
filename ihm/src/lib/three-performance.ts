import * as THREE from 'three';

export function getThreePixelRatio() {
  if (typeof window === 'undefined') return 1;
  const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;
  return Math.min(window.devicePixelRatio || 1, isSmallScreen ? 1.25 : 1.5);
}

export function createVisibilityTracker(element: HTMLElement, onChange?: (visible: boolean) => void) {
  let visible = typeof document === 'undefined' ? true : document.visibilityState === 'visible';
  const setVisible = (next: boolean) => {
    visible = next;
    onChange?.(visible);
  };

  const onDocumentVisibility = () => setVisible(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', onDocumentVisibility);

  const observer = new IntersectionObserver(([entry]) => setVisible(document.visibilityState === 'visible' && entry.isIntersecting), {
    threshold: 0.01,
  });
  observer.observe(element);

  return {
    isVisible: () => visible,
    dispose: () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onDocumentVisibility);
    },
  };
}

export function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose();

    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}
