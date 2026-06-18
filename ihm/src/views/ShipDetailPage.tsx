'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, BarChart3, ChevronLeft, ChevronRight, Clock, Coins,
  Crosshair, ExternalLink, Layers, Package, Palette, Rocket, Ruler, Users, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import type { ShipGalleryImage, ShipModule } from '@/types/api';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { PageShell } from '@/components/ui/PageShell';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { PriceAvailabilityPanel, type PriceAvailabilityRow } from '@/components/economy/PriceAvailabilityPanel';
import { ShipCard } from '@/components/ship/ShipCard';
import { ShipLoadout } from '@/components/ship/ShipLoadout';
import { ShipStatsBanner } from '@/components/ship/ShipStatsBanner';
import { CargoGrid } from '@/components/ship/CargoGrid';
import { ShipHoloViewer } from '@/components/ship/ShipHoloViewer';
import { fCredits, fDate, fMass } from '@/utils/formatters';
import { VARIANT_TYPE_LABELS } from '@/utils/constants';

// ── helpers ──────────────────────────────────────────────────────────────────
function fV(v: number | null | undefined, dec = 0) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(dec);
}

function n(v: number | string | null | undefined) {
  if (v == null || v === '') return null;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
}

function crewLabel(min: number | null | undefined, max: number | null | undefined, size: number | null | undefined) {
  const lo = min ?? size;
  const hi = max ?? size;
  if (lo == null) return null;
  return lo !== hi && hi != null ? `${lo}–${hi}` : String(lo);
}

const STATUS_LABELS: Record<string, string> = {
  'in-concept': 'In Concept',
  'in-production': 'In Production',
  'in-development': 'In Development',
  'in-game-only': 'In Game Only',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function shipMarketEmptyCopy(ship: {
  is_concept_only?: boolean | null;
  production_status?: string | null;
  store_url?: string | null;
  variant_type?: string | null;
}) {
  if (ship.variant_type === 'collector') {
    return {
      message: 'No in-game purchase or rental terminal is listed on UEX for this collector vehicle.',
      detail: 'Collector and limited vehicles can exist in game data without being sold at a public terminal in the current build.',
    };
  }
  if (ship.variant_type === 'wikelo' || ship.variant_type === 'pyam_exec') {
    return {
      message: 'No in-game purchase or rental terminal is listed on UEX for this special variant.',
      detail: 'Special, reward, event, loot or program variants can be obtainable without a normal shop price in the UEX market data.',
    };
  }
  if (ship.is_concept_only) {
    return {
      message: 'No in-game purchase or rental terminal is listed on UEX for this concept vehicle.',
      detail: 'Concept vehicles can have RSI pledge metadata while not being available through in-game terminals yet.',
    };
  }
  if (ship.production_status && !['flight-ready', 'flight_ready'].includes(ship.production_status)) {
    return {
      message: `No in-game purchase or rental terminal is listed on UEX for this ${statusLabel(ship.production_status).toLowerCase()} vehicle.`,
      detail: 'The ship exists in official RSI or game metadata, but UEX crowd-sourced market data does not list a terminal offer for it.',
    };
  }
  if (ship.store_url) {
    return {
      message: 'No in-game purchase or rental terminal is listed on UEX for this vehicle.',
      detail: 'It has an official RSI page, but Starvis only shows in-game prices when UEX lists a dealer terminal offer for it.',
    };
  }
  return {
    message: 'No in-game purchase or rental terminal is listed on UEX for this vehicle.',
    detail: 'It may be unavailable for purchase, loot-only, event-only, collector-only, stock-only, or simply not yet listed in UEX market data.',
  };
}

// ── Quick stat pill ───────────────────────────────────────────────────────────
function QuickStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 min-w-[72px]">
      <div className="flex items-center gap-1 text-slate-600">
        {icon}
        <span className="text-[9px] font-mono-sc uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-sm font-orbitron font-bold text-slate-200 tabular-nums">{value}</span>
    </div>
  );
}

function galleryImageSource(image: ShipGalleryImage): 'pledge' | 'media' | 'fallback' {
  if (image.source) return image.source;
  if (image.kind === 'ship-matrix-media') return 'fallback';
  if (image.url.includes('media.robertsspaceindustries.com')) return 'media';
  if (image.url.includes('robertsspaceindustries.com/i/')) return 'pledge';
  return 'fallback';
}

function GalleryCarousel({
  shipName,
  images,
  title,
  subtitle,
}: {
  shipName: string;
  images: ShipGalleryImage[];
  title: string;
  subtitle: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const displayImages = useMemo(() => images.filter((image) => !failedUrls.has(image.url)), [failedUrls, images]);
  const active = displayImages[Math.min(activeIndex, displayImages.length - 1)] ?? displayImages[0];

  useEffect(() => {
    setActiveIndex(0);
    setFailedUrls(new Set());
  }, [images]);

  useEffect(() => {
    thumbnailRefs.current[activeIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex >= displayImages.length) setActiveIndex(Math.max(displayImages.length - 1, 0));
  }, [activeIndex, displayImages.length]);

  if (!active) return null;

  const go = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + displayImages.length) % displayImages.length);
  };
  const markFailed = (url: string) => {
    setFailedUrls((current) => new Set(current).add(url));
  };

  return (
    <ScifiPanel title={title} subtitle={subtitle}>
      <div className="space-y-3">
        <a
          href={active.url}
          target="_blank"
          rel="noreferrer"
          className="group relative block aspect-video overflow-hidden rounded-sm border border-slate-800 bg-slate-950"
        >
          <img
            src={active.url}
            alt={active.title ?? `${shipName} official media`}
            className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-100"
            loading="lazy"
            onError={() => markFailed(active.url)}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-linear-to-t from-slate-950/95 via-slate-950/40 to-transparent p-3">
            <span className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-400">
              {active.title ?? `${shipName} media ${activeIndex + 1}`}
            </span>
            <span className="font-mono-sc text-[10px] text-cyan-500">
              {activeIndex + 1}/{displayImages.length}
            </span>
          </div>
        </a>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(-1)} className="sci-btn h-10 w-10 justify-center px-0" aria-label="Previous image">
            <ChevronLeft size={16} />
          </button>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {displayImages.map((image, index) => (
              <button
                key={image.id}
                ref={(node) => {
                  thumbnailRefs.current[index] = node;
                }}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={[
                  'relative h-14 w-24 shrink-0 overflow-hidden rounded-sm border bg-slate-950 transition-colors',
                  index === activeIndex ? 'border-cyan-500' : 'border-slate-800 hover:border-cyan-900',
                ].join(' ')}
                aria-label={`Show gallery image ${index + 1}`}
              >
                <img
                  src={image.thumbnail_url ?? image.url}
                  alt=""
                  className="h-full w-full object-cover opacity-75"
                  loading="lazy"
                  onError={() => markFailed(image.url)}
                />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => go(1)} className="sci-btn h-10 w-10 justify-center px-0" aria-label="Next image">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </ScifiPanel>
  );
}

function OfficialGallerySections({ shipName, images }: { shipName: string; images: ShipGalleryImage[] }) {
  const pledgeImages = images.filter((image) => galleryImageSource(image) === 'pledge');
  const fallbackImages = images.filter((image) => galleryImageSource(image) === 'fallback');
  const mainImages = pledgeImages.length > 0 ? pledgeImages : fallbackImages;

  if (mainImages.length === 0) return null;

  return (
    <div className="space-y-3">
      <GalleryCarousel
        shipName={shipName}
        images={mainImages}
        title="Pledge Store Gallery"
        subtitle={`${mainImages.length} official images`}
      />
    </div>
  );
}

// ── Dimension SVG ─────────────────────────────────────────────────────────────
function DimensionBox({ L, W, H, mass }: { L: number; W: number; H: number; mass: number | null }) {
  const maxDim = Math.max(L, W, H, 1);
  const scale = 48;
  const lp = Math.max((L / maxDim) * scale, 4);
  const wp = Math.max((W / maxDim) * scale, 4);
  const hp = Math.max((H / maxDim) * scale, 4);
  const c = 0.866, s = 0.5;
  const pad = 20;
  const ax = lp * c + pad;
  const ay = (lp + wp) * s + hp + pad;
  type V = [number, number];
  const Bf: V = [ax, ay];
  const Bl: V = [ax - lp * c, ay - lp * s];
  const Br: V = [ax + wp * c, ay - wp * s];
  const Bb: V = [ax - lp * c + wp * c, ay - lp * s - wp * s];
  const Tf: V = [Bf[0], Bf[1] - hp];
  const Tl: V = [Bl[0], Bl[1] - hp];
  const Tr: V = [Br[0], Br[1] - hp];
  const Tb: V = [Bb[0], Bb[1] - hp];
  const svgW = (lp + wp) * c + pad * 2;
  const svgH = (lp + wp) * s + hp + pad * 2;
  const seg = (a: V, b: V, props: React.SVGProps<SVGLineElement>) => (
    <line x1={a[0].toFixed(1)} y1={a[1].toFixed(1)} x2={b[0].toFixed(1)} y2={b[1].toFixed(1)} {...props} />
  );
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${svgW.toFixed(0)} ${svgH.toFixed(0)}`} className="w-full" style={{ maxHeight: 140 }}>
        <defs>
          {(['aL', 'aW', 'aH'] as const).map((id, i) => (
            <marker key={id} id={id} markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
              <polygon points="0,0 4,2 0,4" fill={['rgb(52,211,153)', 'rgb(251,191,36)', 'rgb(34,211,238)'][i]} />
            </marker>
          ))}
        </defs>
        {seg(Bl, Bb, { stroke: 'rgba(100,116,139,0.35)', strokeWidth: '0.7', strokeDasharray: '2,2' })}
        {seg(Br, Bb, { stroke: 'rgba(100,116,139,0.35)', strokeWidth: '0.7', strokeDasharray: '2,2' })}
        {seg(Bf, Bb, { stroke: 'rgba(100,116,139,0.35)', strokeWidth: '0.7', strokeDasharray: '2,2' })}
        {seg(Bf, Bl, { stroke: 'rgba(148,163,184,0.55)', strokeWidth: '0.8' })}
        {seg(Bf, Br, { stroke: 'rgba(148,163,184,0.55)', strokeWidth: '0.8' })}
        {seg(Bf, Tf, { stroke: 'rgba(148,163,184,0.55)', strokeWidth: '0.8' })}
        {seg(Bl, Tl, { stroke: 'rgba(148,163,184,0.55)', strokeWidth: '0.8' })}
        {seg(Br, Tr, { stroke: 'rgba(148,163,184,0.55)', strokeWidth: '0.8' })}
        {seg(Tf, Tl, { stroke: 'rgba(148,163,184,0.55)', strokeWidth: '0.8' })}
        {seg(Tf, Tr, { stroke: 'rgba(148,163,184,0.55)', strokeWidth: '0.8' })}
        {seg(Tl, Tb, { stroke: 'rgba(148,163,184,0.55)', strokeWidth: '0.8' })}
        {seg(Tr, Tb, { stroke: 'rgba(148,163,184,0.55)', strokeWidth: '0.8' })}
        {L > 0 && <>
          {seg(Bf, Bl, { stroke: 'rgb(52,211,153)', strokeWidth: '1', markerEnd: 'url(#aL)', opacity: 0.7 })}
          <text x={((Bf[0] + Bl[0]) / 2 - lp * s * 0.22).toFixed(1)} y={((Bf[1] + Bl[1]) / 2 - lp * c * 0.10 + 3).toFixed(1)}
            fontSize="6.5" fill="rgb(52,211,153)" textAnchor="middle" fontFamily="monospace" fontWeight="bold">{L.toFixed(0)} m</text>
        </>}
        {W > 0 && <>
          {seg(Bf, Br, { stroke: 'rgb(251,191,36)', strokeWidth: '1', markerEnd: 'url(#aW)', opacity: 0.7 })}
          <text x={((Bf[0] + Br[0]) / 2 + wp * s * 0.22).toFixed(1)} y={((Bf[1] + Br[1]) / 2 - wp * c * 0.10 + 3).toFixed(1)}
            fontSize="6.5" fill="rgb(251,191,36)" textAnchor="middle" fontFamily="monospace" fontWeight="bold">{W.toFixed(0)} m</text>
        </>}
        {H > 0 && <>
          {seg(Br, Tr, { stroke: 'rgb(34,211,238)', strokeWidth: '1', markerEnd: 'url(#aH)', opacity: 0.7 })}
          <text x={(Br[0] + 8).toFixed(1)} y={((Br[1] + Tr[1]) / 2 + 2).toFixed(1)}
            fontSize="6.5" fill="rgb(34,211,238)" textAnchor="start" fontFamily="monospace" fontWeight="bold">{H.toFixed(0)} m</text>
        </>}
      </svg>
      <div className="flex gap-4 items-center">
        <span className="flex items-center gap-1 text-[9px] font-mono-sc text-emerald-600"><span className="w-3 h-px bg-emerald-600 inline-block" /> L</span>
        <span className="flex items-center gap-1 text-[9px] font-mono-sc text-amber-500"><span className="w-3 h-px bg-amber-500 inline-block" /> W</span>
        <span className="flex items-center gap-1 text-[9px] font-mono-sc text-cyan-500"><span className="w-3 h-px bg-cyan-500 inline-block" /> H</span>
        {mass != null && <span className="text-[9px] font-mono-sc text-slate-700 ml-auto">{fMass(mass)}</span>}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ShipDetailPage() {
  const params = useParams<{ uuid: string }>();
  const uuid = params?.uuid;
  const router = useRouter();
  const { env } = useEnv();

  const { data: ship, isLoading, error, refetch } = useQuery({
    queryKey: ['ships.get', uuid, env],
    queryFn: () => api.ships.get(uuid!, env),
    enabled: !!uuid,
  });
  const { data: loadout } = useQuery({
    queryKey: ['ships.loadout', uuid, env],
    queryFn: () => api.ships.loadout(uuid!, env),
    enabled: !!uuid,
  });
  const { data: paints } = useQuery({
    queryKey: ['ships.paints', uuid, env],
    queryFn: () => api.ships.paints(uuid!, env),
    enabled: !!uuid,
  });
  const { data: similar } = useQuery({
    queryKey: ['ships.similar', uuid, env],
    queryFn: () => api.ships.similar(uuid!, 4, env),
    enabled: !!uuid,
  });
  const { data: modules } = useQuery({
    queryKey: ['ships.modules', uuid, env],
    queryFn: () => api.ships.modules(uuid!, env),
    enabled: !!uuid,
  });
  const { data: shipObjectDetail } = useQuery({
    queryKey: ['objects.ship.prices', uuid, env],
    queryFn: () => api.objects.detail<unknown, { buy_locations?: PriceAvailabilityRow[] }>('ship', uuid!, { env, include: 'buy_locations' }),
    enabled: !!uuid,
  });

  const moduleSlots = useMemo(() => {
    if (!modules || modules.length === 0) return [];
    const slotMap = new Map<string, ShipModule[]>();
    for (const m of modules) {
      if (!slotMap.has(m.slot_name)) slotMap.set(m.slot_name, []);
      slotMap.get(m.slot_name)!.push(m);
    }
    return Array.from(slotMap.values());
  }, [modules]);

  const defaultSelected = useMemo(() => {
    const sel: Record<string, string> = {};
    for (const slot of moduleSlots) {
      const def = slot.find((m) => m.is_default) ?? slot[0];
      if (def) sel[def.slot_name] = def.module_class_name;
    }
    return sel;
  }, [moduleSlots]);

  const [selectedModules, setSelectedModules] = useState<Record<string, string>>({});
  const effectiveSelection = useMemo(() => ({ ...defaultSelected, ...selectedModules }), [defaultSelected, selectedModules]);
  const activeModules = useMemo(
    () => moduleSlots.map((slot) => {
      const sel = effectiveSelection[slot[0].slot_name];
      return slot.find((m) => m.module_class_name === sel) ?? slot.find((m) => m.is_default) ?? slot[0];
    }),
    [moduleSlots, effectiveSelection],
  );
  const buyLocations = shipObjectDetail?.related?.buy_locations ?? [];
  const bestPurchase = useMemo(
    () => {
      const prices = buyLocations.map((row) => n(row.base_price)).filter((value): value is number => value != null && value > 0);
      return prices.length ? Math.min(...prices) : null;
    },
    [buyLocations],
  );
  const bestRental = useMemo(
    () => {
      const prices = buyLocations
        .flatMap((row) => [row.rental_price_1d, row.rental_price_3d, row.rental_price_7d, row.rental_price_30d])
        .map(n)
        .filter((value): value is number => value != null && value > 0);
      return prices.length ? Math.min(...prices) : null;
    },
    [buyLocations],
  );
  const pricesUpdatedAt = useMemo(() => {
    const times = buyLocations
      .map((row) => (row.updated_at ? new Date(row.updated_at).getTime() : Number.NaN))
      .filter((value) => Number.isFinite(value));
    return times.length ? new Date(Math.max(...times)) : null;
  }, [buyLocations]);

  if (isLoading) return <LoadingGrid message="LOADING…" />;
  if (error) return <ErrorState error={error as Error} onRetry={() => void refetch()} />;
  if (!ship) return null;

  const category = ship.vehicle_category ?? 'ship';
  const isGround = category === 'ground' || category === 'gravlev';

  const categoryLabel = category === 'ground' ? 'Ground Vehicles' : category === 'gravlev' ? 'Grav-Lev' : 'Ships';
  const categoryHref = category === 'ground' ? '/ships?cat=ground' : category === 'gravlev' ? '/ships?cat=gravlev' : '/ships';

  const crew = crewLabel(ship.min_crew, ship.max_crew, ship.crew_size);
  const hasDimensions = (ship.size_x || ship.size_y || ship.size_z);
  const hasCargo = ship.cargo_capacity != null && Number(ship.cargo_capacity) > 0;
  const hasInsurance = ship.insurance_claim_time != null || ship.insurance_expedite_cost != null;
  const gallery = ship.gallery ?? [];
  const marketEmptyCopy = shipMarketEmptyCopy(ship);

  return (
    <PageShell size="xl">

      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs font-mono-sc text-slate-600">
        <button onClick={() => router.back()} className="hover:text-slate-400 transition-colors flex items-center gap-1">
          <ArrowLeft size={12} /> Back
        </button>
        <ChevronRight size={10} />
        <Link href={categoryHref} className="hover:text-slate-400 transition-colors">{categoryLabel}</Link>
        <ChevronRight size={10} />
        <span className="text-slate-400">{ship.name}</span>
      </div>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="sci-panel overflow-hidden">
        {/* Image ou placeholder */}
        <div className="relative w-full h-48 bg-slate-900">
          {(ship.thumbnail_large ?? ship.thumbnail) ? (
            <img
              src={(ship.thumbnail_large ?? ship.thumbnail)!}
              alt={ship.name}
              className="w-full h-full object-cover opacity-80"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-orbitron text-6xl font-black text-slate-800 select-none tracking-widest">
                {ship.manufacturer_code ?? ship.name.slice(0, 3).toUpperCase()}
              </span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[#0A1628] to-transparent" />
        </div>

        {/* Header info */}
        <div className="px-6 pb-6 -mt-8 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest mb-1">
                {ship.manufacturer_name}
              </p>
              <h1 className="font-orbitron text-3xl font-black text-slate-100 leading-tight">
                {ship.name}
              </h1>
              {ship.short_name && ship.short_name !== ship.name && (
                <p className="text-[10px] font-mono-sc text-slate-600 mt-0.5 uppercase tracking-widest">{ship.short_name}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {ship.career && <GlowBadge color="cyan">{ship.career}</GlowBadge>}
                {ship.role && ship.role !== ship.career && <GlowBadge color="slate">{ship.role}</GlowBadge>}
                {isGround && <GlowBadge color="slate">{category}</GlowBadge>}
                {ship.variant_type && ship.variant_type !== 'standard' && (
                  <GlowBadge color={ship.variant_type === 'collector' ? 'amber' : ship.variant_type === 'wikelo' ? 'green' : ship.variant_type === 'pyam_exec' ? 'purple' : 'slate'}>
                    {VARIANT_TYPE_LABELS[ship.variant_type] ?? ship.variant_type}
                  </GlowBadge>
                )}
                {ship.is_concept_only && <GlowBadge color="amber">In Concept</GlowBadge>}
                {!ship.is_concept_only && ship.production_status && !['flight-ready', 'flight_ready'].includes(ship.production_status) && (
                  <GlowBadge color="amber">
                    {statusLabel(ship.production_status)}
                  </GlowBadge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link href={`/compare?a=${uuid}`} className="sci-btn-amber text-sm">
                <BarChart3 size={13} /> Compare
              </Link>
              {ship.store_url && (
                <a href={ship.store_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-mono-sc text-slate-500 hover:text-cyan-400 transition-colors">
                  <ExternalLink size={11} /> RSI Store
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Description ────────────────────────────────────────────────────── */}
      {ship.sm_description && (
        <p className="text-sm text-slate-400 leading-relaxed border-l-2 border-cyan-900/40 pl-4">
          {ship.sm_description}
        </p>
      )}

      {/* ── Quick stats bar ────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {crew != null && (
          <QuickStat icon={<Users size={9} />} label="Crew" value={crew} />
        )}
        {isGround ? (
          <>
            {(ship.max_speed ?? ship.scm_speed) != null && (
              <QuickStat icon={<Zap size={9} />} label="Speed" value={`${fV(ship.max_speed ?? ship.scm_speed)} m/s`} />
            )}
          </>
        ) : (
          <>
            {ship.scm_speed != null && (
              <QuickStat icon={<Zap size={9} />} label="SCM" value={`${fV(ship.scm_speed)} m/s`} />
            )}
            {ship.boost_speed_forward != null && (
              <QuickStat icon={<Zap size={9} />} label="Boost" value={`${fV(ship.boost_speed_forward)} m/s`} />
            )}
            {ship.max_speed != null && (
              <QuickStat icon={<Zap size={9} />} label="Nav" value={`${fV(ship.max_speed)} m/s`} />
            )}
          </>
        )}
        {hasCargo && (
          <QuickStat icon={<Package size={9} />} label="Cargo" value={`${ship.cargo_capacity} SCU`} />
        )}
        {bestPurchase != null && (
          <QuickStat icon={<Coins size={9} />} label="Buy" value={fCredits(bestPurchase)} />
        )}
        {bestRental != null && (
          <QuickStat icon={<Clock size={9} />} label="Rent" value={`from ${fCredits(bestRental)}`} />
        )}
        {ship.total_hp != null && Number(ship.total_hp) > 0 && (
          <QuickStat icon={<span className="text-[8px]">HP</span>} label="Hull" value={String(ship.total_hp)} />
        )}
        {ship.shield_hp != null && Number(ship.shield_hp) > 0 && (
          <QuickStat icon={<span className="text-[8px]">SH</span>} label="Shield" value={String(ship.shield_hp)} />
        )}
        {ship.mass != null && (
          <QuickStat icon={<span className="text-[8px]">kg</span>} label="Mass" value={fMass(ship.mass)} />
        )}
        {ship.weapon_damage_total != null && Number(ship.weapon_damage_total) > 0 && (
          <QuickStat icon={<Crosshair size={9} />} label="Weap DPS" value={String(Math.round(Number(ship.weapon_damage_total)))} />
        )}
        {ship.missile_damage_total != null && Number(ship.missile_damage_total) > 0 && (
          <QuickStat icon={<Rocket size={9} />} label="Missiles" value={String(Math.round(Number(ship.missile_damage_total)))} />
        )}
      </div>

      {/* ── Main layout ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

        {/* ════ LEFT — 3D · Dimensions · Cargo · Loadout ════ */}
        <div className="lg:col-span-3 space-y-6">

          {/* Ship holoviewer — only if 3D model available */}
          {ship.ctm_url && (
            <ShipHoloViewer shipUuid={ship.uuid} shipName={ship.name} />
          )}

          {/* Dimensions */}
          {hasDimensions && (
            <ScifiPanel title="Dimensions" actions={<Ruler size={13} className="text-slate-600" />}>
              <DimensionBox
                L={Number(ship.size_y) || 0}
                W={Number(ship.size_x) || 0}
                H={Number(ship.size_z) || 0}
                mass={ship.mass}
              />
            </ScifiPanel>
          )}

          {/* Cargo */}
          {hasCargo && (
            <ScifiPanel title="Cargo" actions={<Package size={13} className="text-slate-600" />}>
              <CargoGrid scu={Number(ship.cargo_capacity)} shipName={ship.name} />
            </ScifiPanel>
          )}

          {/* Loadout */}
          {loadout && loadout.length > 0 && (
            <ScifiPanel title="Loadout" subtitle="Stock equipment" actions={<Layers size={14} className="text-slate-600" />}>
              <ShipLoadout
                nodes={loadout}
                activeModules={activeModules}
                moduleSlots={moduleSlots}
                onModuleChange={(slotName, className) =>
                  setSelectedModules((prev) => ({ ...prev, [slotName]: className }))
                }
              />
            </ScifiPanel>
          )}

          {gallery.length > 0 && <OfficialGallerySections shipName={ship.name} images={gallery} />}
        </div>

        {/* ════ RIGHT sidebar ════ */}
        <div className="lg:col-span-2 space-y-4">

          {/* Stats */}
          <ScifiPanel title={isGround ? 'Performance' : 'Combat & Speed'}>
            <ShipStatsBanner ship={ship} loadout={loadout ?? []} category={category} />
          </ScifiPanel>

          {/* Pricing — in-game (aUEC) vs pledge (USD, official RSI store) */}
          <ScifiPanel title="Pricing" actions={<Coins size={13} className="text-slate-600" />}>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 flex items-center gap-1 font-mono-sc text-[10px] uppercase tracking-widest text-cyan-700">
                  <Coins size={10} /> In-game · aUEC
                </p>
                {bestPurchase != null || bestRental != null ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {bestPurchase != null && (
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-mono-sc text-[10px] uppercase text-slate-600">Buy</span>
                        <span className="font-orbitron text-sm font-bold tabular-nums text-amber-400">{fCredits(bestPurchase)}</span>
                      </span>
                    )}
                    {bestRental != null && (
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-mono-sc text-[10px] uppercase text-slate-600">Rent</span>
                        <span className="font-orbitron text-sm font-bold tabular-nums text-blue-300">from {fCredits(bestRental)}</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="font-mono-sc text-[11px] text-slate-600">Not sold at in-game terminals.</p>
                )}
                {(bestPurchase != null || bestRental != null) && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1 font-mono-sc text-[9px] uppercase tracking-widest text-slate-600">
                    <span>
                      Source ·{' '}
                      <a
                        href="https://uexcorp.space"
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-700 transition-colors hover:text-cyan-400"
                      >
                        UEX
                      </a>
                    </span>
                    {pricesUpdatedAt && (
                      <>
                        <span className="text-slate-700">·</span>
                        <span>Updated {fDate(pricesUpdatedAt.toISOString())}</span>
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="border-t border-slate-800/60 pt-3">
                <p className="mb-1.5 flex items-center gap-1 font-mono-sc text-[10px] uppercase tracking-widest text-emerald-700">
                  <span className="text-[8px]">$</span> Pledge · USD
                </p>
                {ship.store_url ? (
                  <a
                    href={ship.store_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-900/40 bg-emerald-950/15 px-2.5 py-1.5 font-mono-sc text-[11px] text-emerald-300 transition-colors hover:border-emerald-600/50 hover:text-emerald-200"
                  >
                    <ExternalLink size={11} />
                    View pledge price on RSI
                  </a>
                ) : (
                  <p className="font-mono-sc text-[11px] text-slate-600">No RSI pledge store listing.</p>
                )}
              </div>
            </div>
          </ScifiPanel>

          <PriceAvailabilityPanel
            rows={buyLocations}
            emptyMessage={marketEmptyCopy.message}
            emptyDetail={marketEmptyCopy.detail}
          />

          {/* Crew widget */}
          {(() => {
            const minC = ship.min_crew != null ? Number(ship.min_crew) : (ship.crew_size ?? null);
            const maxC = ship.max_crew != null ? Number(ship.max_crew) : (ship.crew_size ?? null);
            if (maxC == null) return null;
            const label = minC != null && maxC !== minC ? `${minC} – ${maxC}` : String(maxC);
            const pipCount = Math.min(maxC, 16);
            return (
              <ScifiPanel>
                <div className="flex items-center justify-between mb-3">
                  <span className="flex items-center gap-1.5 text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">
                    <Users size={10} /> Crew
                  </span>
                  <span className="text-sm font-orbitron font-bold text-teal-400 tabular-nums">{label}</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {Array.from({ length: pipCount }).map((_, i) => (
                    <div key={i} className={`w-4 h-4 rounded-xs border flex items-center justify-center ${
                      minC != null && i < minC ? 'bg-teal-900/60 border-teal-700/50' : 'bg-teal-900/30 border-teal-800/40'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${minC != null && i < minC ? 'bg-teal-500' : 'bg-teal-700'}`} />
                    </div>
                  ))}
                  {maxC > 16 && (
                    <div className="w-4 h-4 rounded-xs bg-teal-900/40 border border-teal-800/40 flex items-center justify-center">
                      <span className="text-[7px] font-mono-sc text-teal-600">+{maxC - 16}</span>
                    </div>
                  )}
                </div>
                {minC != null && maxC !== minC && (
                  <p className="text-[9px] font-mono-sc text-slate-600 mt-1.5">
                    <span className="text-teal-700">{minC} min</span> · <span className="text-teal-500">{maxC} max</span>
                  </p>
                )}
              </ScifiPanel>
            );
          })()}

          {/* Insurance */}
          {hasInsurance && (
            <ScifiPanel title="Insurance" actions={<Clock size={13} className="text-slate-600" />}>
              {ship.insurance_claim_time != null && (() => {
                const claimMin = Number(ship.insurance_claim_time);
                const MAX_CLAIM = 253;
                const color = claimMin < 60 ? 'bg-emerald-600' : claimMin < 120 ? 'bg-amber-500' : 'bg-red-600';
                const textColor = claimMin < 60 ? 'text-emerald-400' : claimMin < 120 ? 'text-amber-400' : 'text-red-400';
                const pct = Math.min(100, (claimMin / MAX_CLAIM) * 100);
                return (
                  <div className="mb-3">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Claim time</span>
                      <span className={`text-sm font-orbitron font-bold tabular-nums ${textColor}`}>
                        {claimMin.toFixed(1)} <span className="text-[10px]">min</span>
                      </span>
                    </div>
                    <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      {[60, 120, 180].map(t => (
                        <div key={t} className="absolute top-0 bottom-0 w-px bg-slate-700/50"
                          style={{ left: `${(t / MAX_CLAIM) * 100}%` }} />
                      ))}
                    </div>
                  </div>
                );
              })()}
              {ship.insurance_expedite_cost != null && (
                <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                  <span className="text-[10px] font-mono-sc text-slate-700 uppercase tracking-widest">Expedite</span>
                  <span className="text-[11px] font-mono-sc text-amber-500 tabular-nums">
                    {fCredits(ship.insurance_expedite_cost)}
                  </span>
                </div>
              )}
            </ScifiPanel>
          )}

          {/* Paints */}
          {paints && paints.length > 0 && (
            <ScifiPanel title="Liveries" subtitle={`${paints.length} available`} actions={<Palette size={14} className="text-slate-600" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5 max-h-72 overflow-y-auto pr-1">
                {paints.map(p => (
                  <div key={p.paint_uuid ?? p.paint_class_name} className="px-2.5 py-2 rounded-sm border border-slate-800/50 bg-slate-900/30 hover:bg-white/5">
                    <p className="text-xs font-rajdhani font-semibold text-slate-300 truncate">{p.paint_name ?? 'Unnamed livery'}</p>
                  </div>
                ))}
              </div>
            </ScifiPanel>
          )}
        </div>
      </div>

      {/* ── Similar ────────────────────────────────────────────────────────── */}
      {similar && similar.length > 0 && (
        <ScifiPanel
          title={isGround ? 'Similar vehicles' : 'Similar ships'}
          subtitle="Same role or manufacturer"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {similar.map((s, i) => (
              <ShipCard key={s.uuid} ship={s} index={i} />
            ))}
          </div>
        </ScifiPanel>
      )}
    </PageShell>
  );
}
