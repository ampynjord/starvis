import type { Metadata } from 'next';
import ItemsPage from '@/views/ItemsPage';

export const metadata: Metadata = {
  title: 'Weapons',
  description: 'Star Citizen FPS weapons database — sidearms, primary weapons (AR, SMG, shotgun, sniper, LMG), special, melee, attachments and throwables.',
  keywords: ['star citizen weapons', 'sc fps weapons', 'star citizen guns', 'sc rifle', 'sc pistol'],
};

export default function Page() {
  return <ItemsPage group="weapons" />;
}
