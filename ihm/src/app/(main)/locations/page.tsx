'use client';

import { Suspense } from 'react';
import LocationsPage from '@/views/LocationsPage';

export default function Page() {
  return <Suspense><LocationsPage /></Suspense>;
}
