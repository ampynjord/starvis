'use client';

import { Suspense } from 'react';
import LoadoutManagerPage from '@/views/LoadoutManagerPage';

export default function Page() {
  return <Suspense><LoadoutManagerPage /></Suspense>;
}
