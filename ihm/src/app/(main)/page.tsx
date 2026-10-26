import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PUBLIC_SITE_URL } from '@/lib/server-config';
import { UniverseNexusView } from '@/views/UniverseNexusView';

export const metadata: Metadata = {
  title: 'STARVIS — Universal Star Citizen Nexus',
  description: 'Connected Star Citizen explorer: fleet, weapons, equipment, locations and markets in one place.',
  openGraph: {
    title: 'STARVIS — Universal Star Citizen Nexus',
    description: 'Connected Star Citizen explorer: fleet, weapons, equipment, locations and markets in one place.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'STARVIS',
  url: PUBLIC_SITE_URL,
  description: 'STARVIS — Universal Star Citizen Nexus',
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
      <Suspense>
        <UniverseNexusView />
      </Suspense>
    </>
  );
}
