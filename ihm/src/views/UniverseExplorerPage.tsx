'use client';

import createDynamic from 'next/dynamic';

const StarmapGalaxy = createDynamic(
  () => import('@/components/starmap/StarmapGalaxy').then((m) => m.StarmapGalaxy),
  { ssr: false },
);

export default function UniverseExplorerPage() {
  return (
    <div className="h-[calc(100vh-64px)] w-full">
      <StarmapGalaxy />
    </div>
  );
}
