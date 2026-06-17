'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Newspaper } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { api } from '@/services/api';

export default function CommLinkDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data: entry, isLoading, error, refetch } = useQuery({
    queryKey: ['commlinks.single', id],
    queryFn: () => api.commLinks.get(id!),
    enabled: !!id,
  });

  if (isLoading) return <LoadingGrid message="LOADING COMM-LINK..." />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!entry) return <EmptyState icon={<Newspaper size={32} />} title="Comm-Link not found" />;

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-800/70 bg-slate-950/90 px-4 py-2">
        <Link
          href="/comm-links"
          className="flex items-center gap-1.5 font-mono-sc text-xs text-slate-500 transition-colors hover:text-cyan-400"
        >
          <ArrowLeft size={12} /> Comm-Links
        </Link>
        <span className="text-slate-700">/</span>
        <span className="min-w-0 flex-1 truncate font-mono-sc text-xs text-slate-400">{entry.title}</span>
        {entry.rsi_url && (
          <a
            href={entry.rsi_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex shrink-0 items-center gap-1 font-mono-sc text-xs text-cyan-600 hover:text-cyan-400"
          >
            <ExternalLink size={11} />
            RSI
          </a>
        )}
      </div>

      {entry.rsi_url ? (
        <iframe
          src={entry.rsi_url}
          className="h-full w-full flex-1 border-0"
          title={entry.title}
          allowFullScreen
        />
      ) : (
        <div className="flex flex-1 items-center justify-center font-mono-sc text-sm text-slate-600">
          No RSI URL available for this comm-link.
        </div>
      )}
    </div>
  );
}
