import type { Metadata } from 'next';
import ComponentsPage from '@/views/ComponentsPage';

export const metadata: Metadata = {
  title: 'Vehicle Equipment',
  description: 'Star Citizen vehicle equipment — coolers, power plants, quantum drives, shields, weapons, missiles and all ship components.',
  keywords: ['star citizen components', 'sc ship weapons', 'quantum drive', 'star citizen shields', 'sc ship equipment', 'star citizen vehicles'],
};

export default function Page() {
  return <ComponentsPage />;
}
