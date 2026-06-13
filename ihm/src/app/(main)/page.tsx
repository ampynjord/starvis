import type { Metadata } from 'next';
import { PUBLIC_SITE_URL } from '@/lib/server-config';
import HomePage from '@/views/HomePage';

export const metadata: Metadata = {
  title: 'Starvis - Star Citizen Database & Toolset',
  description:
    'Starvis - Star Citizen Database & Toolset lets you browse ships, components, FPS gear, commodities, missions and more — data extracted directly from game files.',
  openGraph: {
    title: 'Starvis - Star Citizen Database & Toolset',
    description: 'Ships, components, FPS gear, commodities and more — extracted from SC game files.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'STARVIS',
  url: PUBLIC_SITE_URL,
  description: 'Starvis - Star Citizen Database & Toolset — ships, components, FPS gear and more.',
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
      <HomePage />
    </>
  );
}
