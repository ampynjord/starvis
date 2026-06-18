'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calendar, ExternalLink, Newspaper, Radio, Rows3 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
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

const BORDER_COLORS: Record<BadgeColor, string> = {
  cyan: 'border-cyan-700/50',
  amber: 'border-amber-700/50',
  green: 'border-green-700/50',
  purple: 'border-purple-700/50',
  slate: 'border-slate-700',
};

const TEXT_COLORS: Record<BadgeColor, string> = {
  cyan: 'text-cyan-400',
  amber: 'text-amber-400',
  green: 'text-green-400',
  purple: 'text-purple-400',
  slate: 'text-slate-400',
};

const SOFT_BG_COLORS: Record<BadgeColor, string> = {
  cyan: 'bg-cyan-950/15',
  amber: 'bg-amber-950/15',
  green: 'bg-green-950/15',
  purple: 'bg-purple-950/15',
  slate: 'bg-slate-950/30',
};

function categoryColor(cat: string | null): BadgeColor {
  if (!cat) return 'slate';
  return CATEGORY_COLORS[cat] ?? 'slate';
}

function CategoryLabel({ category }: { category: string | null }) {
  if (!category) return null;
  const color = categoryColor(category);
  return (
    <span className={`inline-flex rounded-sm border px-1.5 py-0.5 font-mono-sc text-[9px] uppercase leading-none tracking-widest ${BORDER_COLORS[color]} ${SOFT_BG_COLORS[color]} ${TEXT_COLORS[color]}`}>
      {category}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

function isRichHtml(content: string): boolean {
  return /<p[\s>]|<img[\s>]|<h[1-6][\s>]|<div[\s>]/i.test(content);
}

export default function CommLinkDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data: entry, isLoading, error, refetch } = useQuery({
    queryKey: ['commlinks.single', id],
    queryFn: () => api.commLinks.get(id!),
    enabled: !!id,
  });

  const { data: relatedData } = useQuery({
    queryKey: ['commlinks.related', entry?.category],
    queryFn: () => api.commLinks.list({ category: entry!.category!, limit: 6 }),
    enabled: !!entry?.category,
  });

  const related = useMemo(
    () => (relatedData?.data ?? []).filter((r) => r.id !== entry?.id).slice(0, 5),
    [relatedData, entry?.id],
  );

  if (isLoading) return <LoadingGrid message="LOADING COMM-LINK..." />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!entry) return <EmptyState icon={<Newspaper size={32} />} title="Comm-Link not found" />;

  const content = entry.content?.trim();

  return (
    <PageShell size="xl">
      <div className="flex items-center gap-2 text-xs font-mono-sc">
        <Link href="/comm-links" className="flex items-center gap-1.5 text-slate-500 transition-colors hover:text-cyan-300">
          <ArrowLeft size={12} /> Comm-Links
        </Link>
        <span className="text-slate-700">/</span>
        <span className="min-w-0 flex-1 truncate text-slate-400">{entry.title}</span>
      </div>

      <article className="overflow-hidden rounded-sm border border-cyan-900/40 bg-panel/70">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative min-h-72 bg-slate-950">
            {entry.thumbnail_url ? (
              <Image src={entry.thumbnail_url} alt={entry.title} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Newspaper size={48} className="text-cyan-900" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
          </div>

          <div className="flex flex-col justify-between p-6">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-300">
                  <Radio size={12} />
                  RSI transmission
                </span>
                <CategoryLabel category={entry.category} />
              </div>
              <h1 className="font-orbitron text-2xl leading-tight text-slate-100">{entry.title}</h1>
              {entry.excerpt && (
                <p className="mt-4 max-w-3xl border-l border-cyan-700/50 pl-4 text-base leading-relaxed text-slate-300">
                  {entry.excerpt}
                </p>
              )}
            </div>
            {entry.published_at && (
              <p className="mt-6 flex items-center gap-1 border-t border-slate-800 pt-3 font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">
                <Calendar size={10} />
                {formatDate(entry.published_at)}
              </p>
            )}
          </div>
        </div>
      </article>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_280px]">
        <ScifiPanel title="Article" className="p-6">
          {content ? (
            isRichHtml(content) ? (
              <div
                className="lore-entry-content max-w-3xl"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted content scraped from official RSI Spectrum
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ) : (
              <div className="lore-entry-content max-w-3xl">
                {content
                  .split(/\n{2,}/)
                  .map((block) => block.trim())
                  .filter(Boolean)
                  .map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
              </div>
            )
          ) : entry.rsi_url ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-slate-400">The full transmission is available on the RSI Spectrum.</p>
              <a
                href={entry.rsi_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-sm border border-cyan-700/50 bg-cyan-950/20 px-3 py-2 font-mono-sc text-xs text-cyan-300 transition-colors hover:border-cyan-500/60 hover:text-cyan-200"
              >
                <Radio size={12} />
                Open transmission on RSI
                <ExternalLink size={10} />
              </a>
            </div>
          ) : (
            <p className="text-xs text-slate-600">No content available for this comm-link.</p>
          )}
        </ScifiPanel>

        <div className="space-y-3">
          <ScifiPanel title="Transmission Data">
            <dl className="space-y-3 text-xs">
              {entry.published_at && (
                <div>
                  <dt className="mb-0.5 font-mono-sc text-[10px] uppercase text-slate-600">Published</dt>
                  <dd className="text-slate-300">{formatDate(entry.published_at)}</dd>
                </div>
              )}
              {entry.category && (
                <div>
                  <dt className="mb-1 font-mono-sc text-[10px] uppercase text-slate-600">Channel</dt>
                  <dd>
                    <Link
                      href={`/comm-links?category=${encodeURIComponent(entry.category)}`}
                      className="rounded-sm border border-cyan-900/40 bg-cyan-950/20 px-1.5 py-0.5 font-mono-sc text-[10px] text-cyan-300 transition-colors hover:text-cyan-200"
                    >
                      {entry.category}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
            {entry.rsi_url && (
              <a
                href={entry.rsi_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex w-full items-center gap-2 border border-cyan-900/30 bg-cyan-950/10 p-3 font-mono-sc text-xs text-cyan-300 transition-colors hover:border-cyan-500/40"
              >
                <Radio size={12} />
                <span className="flex-1">Read on RSI Spectrum</span>
                <ExternalLink size={10} />
              </a>
            )}
          </ScifiPanel>

          {related.length > 0 && (
            <ScifiPanel title="Related Transmissions" actions={<Rows3 size={13} className="text-cyan-600" />}>
              <div className="space-y-1">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/comm-links/${r.id}`}
                    className="group flex items-start gap-2.5 rounded-sm p-1.5 transition-colors hover:bg-cyan-950/10"
                  >
                    {r.thumbnail_url ? (
                      <div className="relative size-10 shrink-0 overflow-hidden rounded-sm border border-slate-800 bg-slate-950">
                        <Image src={r.thumbnail_url} alt={r.title} fill className="object-cover" unoptimized />
                      </div>
                    ) : (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-slate-800 bg-slate-950">
                        <Newspaper size={12} className="text-cyan-900" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-rajdhani text-sm font-semibold leading-tight text-slate-300 line-clamp-2 transition-colors group-hover:text-white">
                        {r.title}
                      </p>
                      {r.excerpt && (
                        <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600 line-clamp-1">{r.excerpt}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </ScifiPanel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
