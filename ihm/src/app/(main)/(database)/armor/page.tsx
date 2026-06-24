import type { Metadata } from 'next';
import ItemsPage from '@/views/ItemsPage';

export const metadata: Metadata = {
  title: 'Armor',
  description: 'Star Citizen armor database — undersuits, helmets, core armor, arms, legs, backpacks and flair with stats and buy locations.',
  keywords: ['star citizen armor', 'sc helmet', 'star citizen undersuit', 'sc backpack', 'fps armor'],
};

export default function Page() {
  return <ItemsPage group="armor" />;
}
