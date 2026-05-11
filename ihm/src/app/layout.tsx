import type { Metadata } from 'next';
import { Orbitron, Rajdhani, Share_Tech_Mono } from 'next/font/google';
import { ChatWidget } from '@/components/ui/ChatWidget';
import { CookieBanner } from '@/components/ui/CookieBanner';
import { Providers } from './providers';
import '@/index.css';

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  display: 'swap',
  weight: ['400', '600', '700', '900'],
});

const rajdhani = Rajdhani({
  subsets: ['latin'],
  variable: '--font-rajdhani',
  display: 'swap',
  weight: ['300', '400', '600', '700'],
});

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: '400',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://starvis.ampynjord.bzh';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'STARVIS — Star Citizen Database',
    template: '%s — STARVIS',
  },
  description:
    'Starvis is the most complete Star Citizen database: ships, components, FPS gear, commodities, missions, manufacturers, galactapedia and more. Data extracted directly from the game files.',
  keywords: ['star citizen', 'star citizen ships', 'star citizen database', 'sc ships', 'star citizen components', 'star citizen wiki', 'starvis', 'star citizen data', 'ship stats', 'galactapedia'],
  authors: [{ name: 'ampynjord' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'STARVIS',
    title: 'STARVIS — Star Citizen Database',
    description: 'Ships, components, FPS gear, commodities and more — extracted from game files.',
  },
  twitter: {
    card: 'summary',
    title: 'STARVIS — Star Citizen Database',
    description: 'Ships, components, FPS gear, commodities and more — extracted from game files.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${orbitron.variable} ${rajdhani.variable} ${shareTechMono.variable}`} suppressHydrationWarning>
      <body className="bg-void text-slate-200">
        <Providers>
          {children}
          <ChatWidget />
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
