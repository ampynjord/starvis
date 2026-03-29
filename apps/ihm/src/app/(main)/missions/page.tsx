'use client';

import { Suspense } from 'react';
import MissionsPage from '@/views/MissionsPage';

export default function Page() {
  return <Suspense><MissionsPage /></Suspense>;
}
