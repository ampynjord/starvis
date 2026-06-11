import type { Metadata } from 'next';
import { Orbitron, Rajdhani, Share_Tech_Mono } from 'next/font/google';
import { ChatWidget } from '@/components/ui/ChatWidget';
import { CookieBanner } from '@/components/ui/CookieBanner';
import { PUBLIC_SITE_URL } from '@/lib/server-config';
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

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_URL),
  title: {
    default: 'STARVIS — Star Citizen Database',
    template: '%s — STARVIS',
  },
  description:
    'Starvis is an unofficial Star Citizen data platform not affiliated with Cloud Imperium Games: ships, components, FPS gear, commodities, missions, manufacturers, galactapedia and more.',
  keywords: ['star citizen', 'star citizen ships', 'star citizen database', 'sc ships', 'star citizen components', 'star citizen wiki', 'starvis', 'star citizen data', 'ship stats', 'galactapedia'],
  authors: [{ name: 'ampynjord' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: PUBLIC_SITE_URL,
    siteName: 'STARVIS',
    title: 'STARVIS — Star Citizen Database',
    description: 'Unofficial Star Citizen database. Not affiliated with Cloud Imperium Games.',
    images: [{ url: '/brand/starvis.png', width: 1254, height: 1254, alt: 'STARVIS logo' }],
  },
  twitter: {
    card: 'summary',
    title: 'STARVIS — Star Citizen Database',
    description: 'Unofficial Star Citizen database. Not affiliated with Cloud Imperium Games.',
    images: ['/brand/starvis.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/brand/starvis.png', type: 'image/png', sizes: '1254x1254' },
    ],
    apple: [{ url: '/brand/starvis.png', type: 'image/png' }],
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
