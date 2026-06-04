'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, ExternalLink, Globe, Tag } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { GalactapediaEntry } from '@/types/api';
import { api } from '@/services/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageShell } from '@/components/ui/PageShell';
import { ScifiPanel } from '@/components/ui/ScifiPanel';

function parseArray(v: GalactapediaEntry['categories']): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v as string); } catch { return []; }
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return ''; }
}

export default function GalactapediaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data: entry, isLoading, error, refetch } = useQuery({
    queryKey: ['galactapedia.single', id],
    queryFn: () => api.galactapedia.get(id!),
    enabled: !!id,
  });

  if (isLoading) return <LoadingGrid message="LOADING ENTRY…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!entry) return <EmptyState icon={<Globe size={32} />} title="Entry not found" />;

  const cats = parseArray(entry.categories);
  const tags = parseArray(entry.tags);

  return (
    <PageShell size="lg">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-xs font-mono-sc">
        <Link href="/galactapedia" className="flex items-center gap-1.5 text-slate-500 hover:text-cyan-400 transition-colors">
          <ArrowLeft size={12} /> Galactapedia
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-400 truncate">{entry.title}</span>
      </div>

      {/* Hero */}
      {entry.thumbnail_url ? (
        <div className="relative w-full h-64 rounded-sm overflow-hidden bg-slate-900 mb-6">
          <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover" unoptimized />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {cats.map((c) => (
                <GlowBadge key={c} color="purple"><Tag size={9} />{c}</GlowBadge>
              ))}
            </div>
            <h1 className="font-orbitron text-xl text-white leading-snug">{entry.title}</h1>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {cats.map((c) => (
              <GlowBadge key={c} color="purple"><Tag size={9} />{c}</GlowBadge>
            ))}
          </div>
          <h1 className="font-orbitron text-2xl text-slate-100">{entry.title}</h1>
          {entry.updated_at && (
            <p className="text-xs font-mono-sc text-slate-600 mt-1">Updated {formatDate(entry.updated_at)}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4 items-start">
        {/* Main content */}
        <div className="space-y-4">
          {entry.excerpt && (
            <ScifiPanel title="Summary">
              <p className="text-sm text-slate-300 leading-relaxed">{entry.excerpt}</p>
            </ScifiPanel>
          )}

          {entry.content ? (
            <ScifiPanel title="Encyclopedia">
              <div className="flex items-center gap-1.5 mb-3">
                <BookOpen size={12} className="text-purple-500" />
                <span className="text-[10px] font-orbitron tracking-widest text-slate-600 uppercase">Full Article</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{entry.content}</p>
            </ScifiPanel>
          ) : !entry.excerpt && (
            <ScifiPanel title="Encyclopedia">
              <p className="text-xs text-slate-600">No content available for this entry.</p>
            </ScifiPanel>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {/* Meta */}
          <ScifiPanel title="Info">
            <dl className="space-y-3 text-xs">
              {entry.updated_at && (
                <div>
                  <dt className="text-slate-600 font-mono-sc uppercase text-[10px] mb-0.5">Last updated</dt>
                  <dd className="text-slate-300">{formatDate(entry.updated_at)}</dd>
                </div>
              )}
              {cats.length > 0 && (
                <div>
                  <dt className="text-slate-600 font-mono-sc uppercase text-[10px] mb-1">Categories</dt>
                  <dd className="flex flex-wrap gap-1">
                    {cats.map((c) => (
                      <Link
                        key={c}
                        href={`/galactapedia?category=${encodeURIComponent(c)}`}
                        className="text-[10px] font-mono-sc text-purple-400 hover:text-purple-300 border border-purple-900/40 bg-purple-950/20 rounded-sm px-1.5 py-0.5 transition-colors"
                      >
                        {c}
                      </Link>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </ScifiPanel>

          {/* Tags */}
          {tags.length > 0 && (
            <ScifiPanel title="Tags">
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="text-[9px] font-mono-sc text-slate-500 border border-slate-800 bg-slate-900/40 rounded-sm px-1.5 py-0.5 leading-none">
                    {t}
                  </span>
                ))}
              </div>
            </ScifiPanel>
          )}

          {/* RSI link */}
          {entry.rsi_url && (
            <a
              href={entry.rsi_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 sci-panel p-3 bg-purple-950/10 border-purple-900/30 hover:border-purple-500/40 transition-colors text-xs text-purple-400 font-mono-sc w-full"
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
