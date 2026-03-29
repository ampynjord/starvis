import type { Metadata } from 'next';
import { Orbitron, Rajdhani, Share_Tech_Mono } from 'next/font/google';
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
  title: 'STARVIS — Star Citizen Database',
  description: 'Star Citizen ship and component database',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`dark ${orbitron.variable} ${rajdhani.variable} ${shareTechMono.variable}`}>
      <body className="bg-void text-slate-200">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
