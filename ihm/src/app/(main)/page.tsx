import type { Metadata } from 'next';
import { PUBLIC_SITE_URL } from '@/lib/server-config';
import { UniverseNexusView } from '@/views/UniverseNexusView';

export const metadata: Metadata = {
  title: 'STARVIS — Nexus Universel Star Citizen',
  description:
    'Explorateur universel et connecté de Star Citizen : flotte, armement, équipement, lieux et marchés sans silos.',
  openGraph: {
    title: 'STARVIS — Nexus Universel Star Citizen',
    description: 'Explorateur universel et connecté de Star Citizen : flotte, armement, équipement, lieux et marchés sans silos.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'STARVIS',
  url: PUBLIC_SITE_URL,
  description: 'STARVIS — Nexus Universel Star Citizen',
  potentialAction: {
    '@type': 'SearchAction',
    target: `${PUBLIC_SITE_URL}/search?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <UniverseNexusView />
    </>
  );
}
