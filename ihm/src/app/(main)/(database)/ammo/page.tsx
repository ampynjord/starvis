import type { Metadata } from 'next';
import ItemsPage from '@/views/ItemsPage';

export const metadata: Metadata = {
  title: 'Ammo',
  description: 'Star Citizen ammunition database — magazines for all FPS weapons.',
  keywords: ['star citizen ammo', 'sc magazines', 'star citizen ammunition'],
};

export default function Page() {
  return <ItemsPage group="ammo" />;
}
