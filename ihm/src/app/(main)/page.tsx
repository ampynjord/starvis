import type { Metadata } from 'next';
import HomePage from '@/views/HomePage';

export const metadata: Metadata = {
  title: 'Star Citizen Database — Ships, Components, FPS Gear & More',
  description:
    'STARVIS is the most complete Star Citizen database. Browse ships, components, FPS gear, commodities, missions and more — data extracted directly from game files.',
  openGraph: {
    title: 'STARVIS — Star Citizen Database',
    description: 'Ships, components, FPS gear, commodities and more — extracted from SC game files.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'STARVIS',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://starvis.ampynjord.bzh',
  description: 'The most complete Star Citizen database — ships, components, FPS gear and more.',
  potentialAction: {
    '@type': 'SearchAction',
    target: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://starvis.ampynjord.bzh'}/search?q={search_term_string}`,
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
