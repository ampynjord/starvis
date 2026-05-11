import type { Metadata } from 'next';
import ChangelogPage from '@/views/ChangelogPage';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'STARVIS platform changelog — history of data updates, new features and improvements.',
  openGraph: {
    title: 'Changelog — STARVIS',
    description: 'STARVIS update history and data changelog.',
  },
};

export default function Page() {
  return <ChangelogPage />;
}
