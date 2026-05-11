import type { Metadata } from 'next';
import { Suspense } from 'react';
import ComparePage from '@/views/ComparePage';

export const metadata: Metadata = {
  title: 'Compare Ships',
  description:
    'Side-by-side comparison of Star Citizen ships. Compare speed, cargo, crew, DPS, shields and more across multiple ships at once.',
  keywords: ['star citizen ship comparison', 'compare sc ships', 'star citizen ship stats comparison'],
  openGraph: {
    title: 'Compare Ships — STARVIS',
    description: 'Side-by-side Star Citizen ship comparison tool.',
  },
};

export default function Page() {
  return <Suspense><ComparePage /></Suspense>;
}
