'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Calendar, ExternalLink, Globe, Hash, Tag } from 'lucide-react';
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
import type { GalactapediaEntry } from '@/types/api';

function parseArray(v: GalactapediaEntry['categories']): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    return JSON.parse(v as string);
  } catch {
    return [];
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

function contentBlocks(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export default function GalactapediaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data: entry, isLoading, error, refetch } = useQuery({
    queryKey: ['galactapedia.single', id],
    queryFn: () => api.galactapedia.get(id!),
    enabled: !!id,
  });

  if (isLoading) return <LoadingGrid message="LOADING ENTRY..." />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!entry) return <EmptyState icon={<Globe size={32} />} title="Entry not found" />;

  const cats = parseArray(entry.categories);
  const tags = parseArray(entry.tags);
  const paragraphs = entry.content ? contentBlocks(entry.content) : [];

  return (
    <PageShell size="xl">
      <div className="flex items-center gap-2 text-xs font-mono-sc">
        <Link href="/galactapedia" className="flex items-center gap-1.5 text-slate-500 transition-colors hover:text-purple-300">
          <ArrowLeft size={12} /> Galactapedia
        </Link>
        <span className="text-slate-700">/</span>
        <span className="truncate text-slate-400">{entry.title}</span>
      </div>

      <article className="overflow-hidden rounded-sm border border-purple-900/40 bg-panel/70">
        <div className="grid lg:grid-cols-[360px_1fr]">
          <div className="relative min-h-72 bg-slate-950">
            {entry.thumbnail_url ? (
              <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full items-center justify-center">
                <BookOpen size={48} className="text-purple-900" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/10 to-transparent" />
          </div>

          <div className="flex flex-col justify-between p-6">
            <div>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {cats.map((c) => (
                  <GlowBadge key={c} color="purple">
                    <Tag size={9} />
                    {c}
                  </GlowBadge>
                ))}
              </div>
              <p className="mb-2 flex items-center gap-1 font-mono-sc text-[10px] uppercase tracking-widest text-purple-300">
                <BookOpen size={12} />
                Lore encyclopedia entry
              </p>
              <h1 className="font-orbitron text-2xl leading-tight text-slate-100">{entry.title}</h1>
              {entry.excerpt && (
                <p className="mt-4 max-w-3xl border-l border-purple-700/50 pl-4 text-base leading-relaxed text-slate-300">
                  {entry.excerpt}
                </p>
              )}
            </div>
            {entry.updated_at && (
              <p className="mt-6 flex items-center gap-1 border-t border-slate-800 pt-3 font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
                <Calendar size={10} />
                Updated {formatDate(entry.updated_at)}
              </p>
            )}
          </div>
        </div>
      </article>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_280px]">
        <ScifiPanel title="Article" className="p-6">
          {paragraphs.length > 0 ? (
            <div className="lore-entry-content max-w-3xl">
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600">No content available for this entry.</p>
          )}
        </ScifiPanel>

        <div className="space-y-3">
          <ScifiPanel title="Index">
            <dl className="space-y-3 text-xs">
              {entry.updated_at && (
                <div>
                  <dt className="mb-0.5 font-mono-sc text-[10px] uppercase text-slate-600">Last updated</dt>
                  <dd className="text-slate-300">{formatDate(entry.updated_at)}</dd>
                </div>
              )}
              {cats.length > 0 && (
                <div>
                  <dt className="mb-1 font-mono-sc text-[10px] uppercase text-slate-600">Categories</dt>
                  <dd className="flex flex-wrap gap-1">
                    {cats.map((c) => (
                      <Link
                        key={c}
                        href={`/galactapedia?category=${encodeURIComponent(c)}`}
                        className="rounded-sm border border-purple-900/40 bg-purple-950/20 px-1.5 py-0.5 font-mono-sc text-[10px] text-purple-300 transition-colors hover:text-purple-200"
                      >
                        {c}
                      </Link>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </ScifiPanel>

          {tags.length > 0 && (
            <ScifiPanel title="Tags">
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-sm border border-slate-800 bg-slate-900/40 px-1.5 py-0.5 font-mono-sc text-[9px] leading-none text-slate-500">
                    <Hash size={8} />
                    {tag}
                  </span>
                ))}
              </div>
            </ScifiPanel>
          )}

          {entry.rsi_url && (
            <a
              href={entry.rsi_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-2 border border-purple-900/30 bg-purple-950/10 p-3 font-mono-sc text-xs text-purple-300 transition-colors hover:border-purple-500/40"
            >
              <Globe size={12} />
              <span className="flex-1">Read on RSI Galactapedia</span>
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
    </PageShell>
  );
}
