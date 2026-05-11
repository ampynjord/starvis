import type { Metadata } from 'next';
import ComponentsPage from '@/views/ComponentsPage';

export const metadata: Metadata = {
  title: 'Ship Components',
  description:
    'Full database of Star Citizen ship components — weapons, shields, power plants, coolers and quantum drives. Filter by type, size and grade.',
  keywords: ['star citizen components', 'sc ship weapons', 'star citizen shields', 'quantum drive', 'star citizen ship equipment'],
  openGraph: {
    title: 'Ship Components — STARVIS',
    description: 'All Star Citizen ship components with detailed specs and compatibility.',
  },
};

export default function Page() {
  return <ComponentsPage />;
}
