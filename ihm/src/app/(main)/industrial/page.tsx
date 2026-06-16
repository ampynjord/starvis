import type { Metadata } from 'next';
import CommoditiesPage from '@/views/CommoditiesPage';

export const metadata: Metadata = {
  title: 'Industrial Commodities',
  description:
    'Star Citizen industrial resources and raw materials: commodity types, sub-types, SCU values and market price data.',
  keywords: ['star citizen commodities', 'sc industrial resources', 'star citizen raw materials', 'sc commodity database'],
  openGraph: {
    title: 'Industrial Commodities — STARVIS',
    description: 'Star Citizen industrial commodity database.',
  },
};

export default function Page() {
  return <CommoditiesPage />;
}
