'use client';

import { Suspense } from 'react';
import UniverseExplorerPage from '@/views/UniverseExplorerPage';

export default function Page() {
  return (
    <Suspense>
      <UniverseExplorerPage />
    </Suspense>
  );
}
