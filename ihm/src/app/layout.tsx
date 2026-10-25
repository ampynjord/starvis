import type { Metadata } from 'next';
import { Orbitron, Rajdhani, Share_Tech_Mono } from 'next/font/google';
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
    default: 'Starvis - Open Star Citizen Data Engine & Public API',
    template: '%s — STARVIS',
  },
  description:
    'Starvis is an open Star Citizen Data Engine & Public REST API cross-referencing official P4K/DataForge, RSI Ship Matrix, Starmap, Galactapedia, SC Wiki, UEX 2.0 and bilingual EN/FR datasets.',
  keywords: [
    'star citizen',
    'star citizen ships',
    'star citizen database',
    'sc ships',
    'star citizen components',
    'star citizen API',
    'star citizen tools',
    'starvis',
    'star citizen data',
    'ship stats',
    'galactapedia',
  ],
  authors: [{ name: 'ampynjord' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: PUBLIC_SITE_URL,
    siteName: 'STARVIS',
    title: 'Starvis - Open Star Citizen Data Engine & Public API',
    description:
      'Open Star Citizen Database & Public API cross-referencing official P4K, RSI and community sources. Not affiliated with Cloud Imperium Games.',
    images: [{ url: '/brand/starvis.png', width: 1254, height: 1254, alt: 'STARVIS logo' }],
  },
  twitter: {
    card: 'summary',
    title: 'Starvis - Open Star Citizen Data Engine & Public API',
    description:
      'Open Star Citizen Database & Public API cross-referencing official P4K, RSI and community sources. Not affiliated with Cloud Imperium Games.',
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
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
