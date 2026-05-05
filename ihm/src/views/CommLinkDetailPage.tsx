'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Calendar, ExternalLink, Newspaper, Tag } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/services/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ScifiPanel } from '@/components/ui/ScifiPanel';

type BadgeColor = 'cyan' | 'amber' | 'green' | 'purple' | 'slate';

const CATEGORY_COLORS: Record<string, BadgeColor> = {
  Transmission:        'cyan',
  Engineering:         'green',
  'Spectrum Dispatch': 'purple',
  'Jump Point':        'amber',
  'Lore Builder':      'amber',
  Organizational:      'slate',
  Portfolio:           'green',
  Update:              'cyan',
  News:                'slate',
  'Press Release':     'cyan',
};

function categoryColor(cat: string | null): BadgeColor {
  if (!cat) return 'slate';
  return CATEGORY_COLORS[cat] ?? 'slate';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return ''; }
}

export default function CommLinkDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data: entry, isLoading, error, refetch } = useQuery({
    queryKey: ['commlinks.single', id],
    queryFn: () => api.commLinks.get(id!),
    enabled: !!id,
  });

  if (isLoading) return <LoadingGrid message="LOADING COMM-LINK…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!entry) return <EmptyState icon={<Newspaper size={32} />} title="Comm-Link not found" />;

  const color = categoryColor(entry.category);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-xs font-mono-sc">
        <Link href="/comm-links" className="flex items-center gap-1.5 text-slate-500 hover:text-cyan-400 transition-colors">
          <ArrowLeft size={12} /> Comm-Links
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
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {entry.category && (
                <GlowBadge color={color}><Tag size={9} />{entry.category}</GlowBadge>
              )}
              {entry.published_at && (
                <span className="text-[10px] font-mono-sc text-slate-400 flex items-center gap-1">
                  <Calendar size={9} />{formatDate(entry.published_at)}
                </span>
              )}
            </div>
            <h1 className="font-orbitron text-xl text-white leading-snug">{entry.title}</h1>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {entry.category && (
              <GlowBadge color={color}><Tag size={9} />{entry.category}</GlowBadge>
            )}
            {entry.published_at && (
              <span className="text-xs font-mono-sc text-slate-600 flex items-center gap-1">
                <Calendar size={10} />{formatDate(entry.published_at)}
              </span>
            )}
          </div>
          <h1 className="font-orbitron text-2xl text-slate-100">{entry.title}</h1>
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
            <ScifiPanel title="Transmission">
              <div className="flex items-center gap-1.5 mb-3">
                <BookOpen size={12} className={`text-${color}-500`} />
                <span className="text-[10px] font-orbitron tracking-widest text-slate-600 uppercase">Full Content</span>
              </div>
              <div
                className="text-sm text-slate-400 leading-relaxed space-y-3 comm-link-content"
                dangerouslySetInnerHTML={{ __html: entry.content }}
              />
            </ScifiPanel>
          ) : !entry.excerpt && (
            <ScifiPanel title="Transmission">
              <p className="text-xs text-slate-600">No content available for this dispatch.</p>
            </ScifiPanel>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <ScifiPanel title="Dispatch Info">
            <dl className="space-y-3 text-xs">
              {entry.category && (
                <div>
                  <dt className="text-slate-600 font-mono-sc uppercase text-[10px] mb-0.5">Category</dt>
                  <dd>
                    <Link
                      href={`/comm-links?category=${encodeURIComponent(entry.category)}`}
                      className={`text-[10px] font-mono-sc text-${color}-400 hover:text-${color}-300 border border-${color}-900/40 bg-${color}-950/20 rounded-sm px-1.5 py-0.5 transition-colors inline-block`}
                    >
                      {entry.category}
                    </Link>
                  </dd>
                </div>
              )}
              {entry.published_at && (
                <div>
                  <dt className="text-slate-600 font-mono-sc uppercase text-[10px] mb-0.5">Published</dt>
                  <dd className="text-slate-300 flex items-center gap-1">
                    <Calendar size={10} className="text-slate-600" />
                    {formatDate(entry.published_at)}
                  </dd>
                </div>
              )}
              {entry.rsi_id && (
                <div>
                  <dt className="text-slate-600 font-mono-sc uppercase text-[10px] mb-0.5">RSI ID</dt>
                  <dd className="text-slate-500 font-mono text-[10px]">{entry.rsi_id}</dd>
                </div>
              )}
            </dl>
          </ScifiPanel>

          {/* RSI link */}
          {entry.rsi_url && (
            <a
              href={entry.rsi_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 sci-panel p-3 bg-cyan-950/10 border-cyan-900/30 hover:border-cyan-500/40 transition-colors text-xs text-cyan-400 font-mono-sc w-full"
            >
              <Newspaper size={12} />
              <span className="flex-1">Read on RSI</span>
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
