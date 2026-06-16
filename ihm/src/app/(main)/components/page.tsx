import type { Metadata } from 'next';
import ComponentsPage from '@/views/ComponentsPage';

export const metadata: Metadata = {
  title: 'Ship Components',
  description:
    'Browse Star Citizen ship components: weapons, shields, quantum drives, thrusters, coolers, power plants and more. Detailed stats extracted from game files.',
  keywords: ['star citizen components', 'sc ship components', 'star citizen weapons', 'star citizen shields', 'quantum drive sc'],
  openGraph: {
    title: 'Ship Components — STARVIS',
    description: 'Complete Star Citizen ship component database with stats.',
  },
};

export default function Page() {
  return <ComponentsPage />;
}
