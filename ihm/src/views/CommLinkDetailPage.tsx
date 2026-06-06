'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calendar, ExternalLink, Newspaper, Radio, Tag } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageShell } from '@/components/ui/PageShell';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { api } from '@/services/api';

type BadgeColor = 'cyan' | 'amber' | 'green' | 'purple' | 'slate';

const CATEGORY_COLORS: Record<string, BadgeColor> = {
  Transmission: 'cyan',
  Engineering: 'green',
  'Spectrum Dispatch': 'purple',
  'Jump Point': 'amber',
  'Lore Builder': 'amber',
  Organizational: 'slate',
  Portfolio: 'green',
  Update: 'cyan',
  News: 'slate',
  'Press Release': 'cyan',
};

const LINK_COLORS: Record<BadgeColor, string> = {
  cyan: 'border-cyan-900/40 bg-cyan-950/20 text-cyan-300 hover:text-cyan-200',
  amber: 'border-amber-900/40 bg-amber-950/20 text-amber-300 hover:text-amber-200',
  green: 'border-green-900/40 bg-green-950/20 text-green-300 hover:text-green-200',
  purple: 'border-purple-900/40 bg-purple-950/20 text-purple-300 hover:text-purple-200',
  slate: 'border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-300',
};

function categoryColor(cat: string | null): BadgeColor {
  if (!cat) return 'slate';
  return CATEGORY_COLORS[cat] ?? 'slate';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

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

  const color = categoryColor(entry.category);

  return (
    <PageShell size="xl">
      <div className="flex items-center gap-2 text-xs font-mono-sc">
        <Link href="/comm-links" className="flex items-center gap-1.5 text-slate-500 transition-colors hover:text-cyan-400">
          <ArrowLeft size={12} /> Comm-Links
        </Link>
        <span className="text-slate-700">/</span>
        <span className="truncate text-slate-400">{entry.title}</span>
      </div>

      <article className="overflow-hidden rounded-sm border border-cyan-900/40 bg-panel/70">
        <div className="relative min-h-[360px] bg-slate-950">
          {entry.thumbnail_url ? (
            <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full min-h-[360px] items-center justify-center">
              <Newspaper size={52} className="text-cyan-900" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/65 to-slate-950/5" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {entry.category && (
                <GlowBadge color={color}>
                  <Tag size={9} />
                  {entry.category}
                </GlowBadge>
              )}
              {entry.published_at && (
                <span className="flex items-center gap-1 font-mono-sc text-[10px] uppercase tracking-widest text-slate-300">
                  <Calendar size={10} />
                  {formatDate(entry.published_at)}
                </span>
              )}
            </div>
            <p className="mb-2 flex items-center gap-1 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-300">
              <Radio size={12} />
              Star Citizen magazine article
            </p>
            <h1 className="max-w-4xl font-orbitron text-3xl leading-tight text-white">{entry.title}</h1>
            {entry.excerpt && (
              <p className="mt-4 max-w-3xl border-l border-cyan-700/50 pl-4 text-base leading-relaxed text-slate-300">
                {entry.excerpt}
              </p>
            )}
          </div>
        </div>
      </article>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_280px]">
        <ScifiPanel title="Article" className="p-6">
          {entry.content ? (
            <div
              className="comm-link-content max-w-3xl"
              dangerouslySetInnerHTML={{ __html: entry.content }}
            />
          ) : (
            <p className="text-xs text-slate-600">No content available for this dispatch.</p>
          )}
        </ScifiPanel>

        <div className="space-y-3">
          <ScifiPanel title="Dispatch">
            <dl className="space-y-3 text-xs">
              {entry.category && (
                <div>
                  <dt className="mb-0.5 font-mono-sc text-[10px] uppercase text-slate-600">Section</dt>
                  <dd>
                    <Link
                      href={`/comm-links?category=${encodeURIComponent(entry.category)}`}
                      className={`inline-block rounded-sm border px-1.5 py-0.5 font-mono-sc text-[10px] transition-colors ${LINK_COLORS[color]}`}
                    >
                      {entry.category}
                    </Link>
                  </dd>
                </div>
              )}
              {entry.published_at && (
                <div>
                  <dt className="mb-0.5 font-mono-sc text-[10px] uppercase text-slate-600">Published</dt>
                  <dd className="flex items-center gap-1 text-slate-300">
                    <Calendar size={10} className="text-slate-600" />
                    {formatDate(entry.published_at)}
                  </dd>
                </div>
              )}
              {entry.rsi_id && (
                <div>
                  <dt className="mb-0.5 font-mono-sc text-[10px] uppercase text-slate-600">RSI ID</dt>
                  <dd className="font-mono text-[10px] text-slate-500">{entry.rsi_id}</dd>
                </div>
              )}
            </dl>
          </ScifiPanel>

          {entry.rsi_url && (
            <a
              href={entry.rsi_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-2 border border-cyan-900/30 bg-cyan-950/10 p-3 font-mono-sc text-xs text-cyan-300 transition-colors hover:border-cyan-500/40"
            >
              <Newspaper size={12} />
              <span className="flex-1">Read on RSI</span>
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
    </PageShell>
  );
}
