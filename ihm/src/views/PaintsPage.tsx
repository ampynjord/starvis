'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Palette } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListFilterBar, ListFilterResetButton, ListFilterSelect } from '@/components/ui/ListFilters';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { useListQueryState } from '@/hooks/useListQueryState';
import type { PaintListItem, PaintManufacturerGroup } from '@/types/api';

// ── Event badge detection ──────────────────────────────────────────────────────

interface EventBadge {
  label: string;
  color: string;
}

const EVENT_PATTERNS: Array<{ regex: RegExp; badge: EventBadge }> = [
  { regex: /iae/i,        badge: { label: 'IAE',       color: 'text-amber-400 bg-amber-950/40 border-amber-800' } },
  { regex: /ilw/i,        badge: { label: 'ILW',       color: 'text-cyan-400 bg-cyan-950/40 border-cyan-800' } },
  { regex: /invictus/i,   badge: { label: 'Invictus',  color: 'text-yellow-400 bg-yellow-950/40 border-yellow-800' } },
  { regex: /pirate/i,     badge: { label: 'Pirate Sw', color: 'text-red-400 bg-red-950/40 border-red-800' } },
  { regex: /holiday|luminalia/i, badge: { label: 'Holiday', color: 'text-green-400 bg-green-950/40 border-green-800' } },
  { regex: /jumptown/i,   badge: { label: 'Jumptown',  color: 'text-orange-400 bg-orange-950/40 border-orange-800' } },
];

function detectEvent(className: string | null): EventBadge | null {
  if (!className) return null;
  for (const { regex, badge } of EVENT_PATTERNS) {
    if (regex.test(className)) return badge;
  }
  return null;
}

// ── PaintCard ────────────────────────────────────────────────────────────────

function PaintCard({ p, index }: { p: PaintListItem; index: number }) {
  const event = detectEvent(p.paint_class_name);
  return (
    <motion.div
      key={p.paint_uuid}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.015, 0.3) }}
    >
      <div className="sci-panel px-3 py-2.5 hover:border-cyan-800 transition-colors h-full">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-sm shrink-0 border border-cyan-800/50 bg-linear-to-br from-cyan-900/60 to-blue-900/60 flex items-center justify-center">
            <Palette size={11} className="text-cyan-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-rajdhani font-semibold text-slate-200 truncate flex-1">
                {p.paint_name}
              </p>
              {event && (
                <span className={`shrink-0 text-[9px] font-mono-sc px-1.5 py-0.5 rounded-sm border ${event.color}`}>
                  {event.label}
                </span>
              )}
            </div>
            <p className="text-[10px] font-mono-sc text-slate-700 truncate mt-0.5">
              {p.paint_class_name}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Collapsible ship group ────────────────────────────────────────────────────

function ShipGroup({ shipName, shipUuid, paints }: { shipName: string; shipUuid: string; paints: PaintListItem[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-sm hover:bg-white/[0.02] transition-colors group mb-1"
      >
        {open ? <ChevronDown size={13} className="text-slate-600" /> : <ChevronRight size={13} className="text-slate-600" />}
        <Link
          href={`/ships/${shipUuid}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-rajdhani font-bold text-cyan-500 hover:text-cyan-300 transition-colors truncate"
        >
          {shipName}
        </Link>
        <span className="text-[10px] font-mono-sc text-slate-600 ml-1">
          {paints.length} paint{paints.length !== 1 ? 's' : ''}
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5 pl-4">
          {paints.map((p, i) => (
            <PaintCard key={p.paint_uuid} p={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Manufacturer section ──────────────────────────────────────────────────────

function ManufacturerSection({ group }: { group: PaintManufacturerGroup }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 w-full text-left py-2 border-b border-border mb-3 hover:border-slate-600 transition-colors"
      >
        {open ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        <span className="font-orbitron text-sm text-slate-300 uppercase tracking-wide">{group.manufacturerName}</span>
        <span className="text-xs font-mono-sc text-slate-600 ml-1">
          {group.paintCount} paint{group.paintCount !== 1 ? 's' : ''} · {group.shipCount} ship{group.shipCount !== 1 ? 's' : ''}
        </span>
      </button>
      {open && group.ships.map((s) => (
        <ShipGroup key={s.shipUuid || s.shipName} shipName={s.shipName} shipUuid={s.shipUuid} paints={s.paints} />
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PaintsPage() {
  const { env } = useEnv();
  const { search, debouncedSearch, updateSearch } = useListQueryState();
  const [selectedManufacturer, setSelectedManufacturer] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['paints.groups', env, debouncedSearch, selectedManufacturer],
    queryFn: () => api.paints.groups({ env, search: debouncedSearch || undefined, manufacturer: selectedManufacturer || undefined }),
  });

  const hasFilters = !!selectedManufacturer;

  return (
    <PageShell>
      <PageHeader
        title="Paints"
        count={data?.total}
        countLabel="paints"
        search={search}
        searchPlaceholder="Search paint or ship…"
        onSearch={updateSearch}
      />

      {data && data.manufacturerOptions.length > 0 && (
        <ListFilterBar>
          <ListFilterSelect
            value={selectedManufacturer}
            onChange={setSelectedManufacturer}
            allLabel="All manufacturers"
            options={data.manufacturerOptions.map((option) => ({
              value: option.value,
              label: option.label,
              count: option.count,
            }))}
          />
          {hasFilters && (
            <ListFilterResetButton onClick={() => setSelectedManufacturer('')} />
          )}
        </ListFilterBar>
      )}

      {isLoading ? (
        <LoadingGrid message="LOADING PAINTS…" />
      ) : error ? (
        <ErrorState error={error as Error} onRetry={() => void refetch()} />
      ) : !data?.groups.length ? (
        <EmptyState icon="🎨" title="No paints found" />
      ) : (
        data.groups.map((g) => (
          <ManufacturerSection key={g.manufacturerName} group={g} />
        ))
      )}
    </PageShell>
  );
}
