import type { Metadata } from 'next';
import UniverseExplorerPage from '@/views/UniverseExplorerPage';

export const metadata: Metadata = {
  title: 'Starvis Starmap',
  description: 'Interactive Star Citizen galaxy map — all star systems, factions and jump tunnel connections.',
};

export default function Page() {
  return <UniverseExplorerPage />;
}
