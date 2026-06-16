import type { Metadata } from 'next';
import FpsCalculatorPage from '@/views/FpsCalculatorPage';

export const metadata: Metadata = {
  title: 'FPS Calculator',
  description:
    'Star Citizen FPS damage calculator. Calculate time-to-kill, compare weapon DPS and factor in armor damage reduction for ground combat.',
  keywords: ['star citizen fps calculator', 'sc ttk calculator', 'star citizen weapon damage', 'fps dps calculator sc'],
  openGraph: {
    title: 'FPS Calculator — STARVIS',
    description: 'Star Citizen FPS damage and time-to-kill calculator.',
  },
};

export default function Page() {
  return <FpsCalculatorPage />;
}
