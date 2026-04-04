'use client';

import { Suspense } from 'react';
import ShipsPage from '@/views/ShipsPage';

export default function Page() {
  return <Suspense><ShipsPage /></Suspense>;
}
