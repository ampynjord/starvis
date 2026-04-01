'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Anchor,
  Asterisk,
  Building2,
  ChevronDown,
  ChevronRight,
  Coffee,
  Globe,
  Globe2,
  MapPin,
  Package,
  Pickaxe,
  Radio,
  Search,
  Shield,
  TriangleAlert,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Location } from '@/types/api';
import { api } from '@/services/api';
import { useEnv } from '@/contexts/EnvContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { useDebounce } from '@/hooks/useDebounce';

// ── Type meta ─────────────────────────────────────────────────────────────────

type BadgeColor = 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate';
interface TypeMeta { color: BadgeColor; icon: React.ReactNode; label: string }

const TYPE_META: Record<string, TypeMeta> = {
  system:         { color: 'cyan',   icon: <Globe2 size={14} />,        label: 'System' },
  star:           { color: 'amber',  icon: <Asterisk size={13} />,      label: 'Star' },
  planet:         { color: 'green',  icon: <Globe size={13} />,         label: 'Planet' },
  moon:           { color: 'slate',  icon: <Globe size={12} />,         label: 'Moon' },
  landing_zone:   { color: 'cyan',   icon: <Building2 size={12} />,     label: 'City / LZ' },
  station:        { color: 'purple', icon: <Anchor size={12} />,        label: 'Station' },
  rest_stop:      { color: 'amber',  icon: <Coffee size={12} />,        label: 'Rest Stop' },
  outpost:        { color: 'slate',  icon: <MapPin size={11} />,        label: 'Outpost' },
  comm_array:     { color: 'cyan',   icon: <Radio size={11} />,         label: 'Comm Array' },
  asteroid_field: { color: 'amber',  icon: <Wifi size={11} />,          label: 'Asteroid Field' },
  jump_point:     { color: 'purple', icon: <Zap size={11} />,           label: 'Jump Point' },
  mining_claim:   { color: 'slate',  icon: <Pickaxe size={11} />,       label: 'Mining Claim' },
  junk_site:      { color: 'red',    icon: <TriangleAlert size={11} />, label: 'Junk Site' },
  warehouse:      { color: 'amber',  icon: <Package size={11} />,       label: 'Warehouse' },
  cave:           { color: 'slate',  icon: <MapPin size={11} />,        label: 'Cave' },
  ruins:          { color: 'red',    icon: <Building2 size={11} />,     label: 'Ruins' },
  bunker:         { color: 'red',    icon: <Shield size={11} />,        label: 'Bunker / UGF' },
};

const TYPE_ORDER = [
  'system', 'star', 'planet', 'moon',
  'landing_zone', 'station', 'rest_stop',
  'outpost', 'comm_array', 'asteroid_field', 'jump_point',
  'cave', 'junk_site', 'warehouse', 'ruins', 'mining_claim', 'bunker',
];

const COLOR_ICON: Record<BadgeColor, string> = {
  cyan: 'text-cyan-400', amber: 'text-amber-400', green: 'text-green-400',
  red: 'text-red-400', purple: 'text-purple-400', slate: 'text-slate-400',
};
const COLOR_DIM: Record<BadgeColor, string> = {
  cyan: 'text-cyan-700', amber: 'text-amber-700', green: 'text-green-700',
  red: 'text-red-700', purple: 'text-purple-700', slate: 'text-slate-600',
};

function getTypeMeta(type: string): TypeMeta {
  return TYPE_META[type] ?? { color: 'slate', icon: <MapPin size={11} />, label: type };
}

// ── Tree building ─────────────────────────────────────────────────────────────

interface TreeData {
  byId: Map<string, Location>;
  childrenOf: Map<string | null, Location[]>;
  roots: Location[];
}

function buildTree(locs: Location[]): TreeData {
  const byId = new Map(locs.map((l) => [l.uuid, l]));
  const childrenOf = new Map<string | null, Location[]>();

  // Map system_code → system record UUID
  const systemUuidByCode = new Map<string, string>();
  for (const loc of locs) {
    if (loc.type === 'system') {
      const m = loc.class_name.match(/^([A-Za-z]+)SolarSystem$/i);
      if (m) systemUuidByCode.set(m[1].toUpperCase(), loc.uuid);
    }
  }

  // Build a map: star UUID → system UUID (so we can skip stars)
  const starRemap = new Map<string, string | null>();
  for (const loc of locs) {
    if (loc.type === 'star') {
      const sysId = (loc.parent_uuid && byId.has(loc.parent_uuid))
        ? loc.parent_uuid
        : (loc.system_code ? (systemUuidByCode.get(loc.system_code) ?? null) : null);
      starRemap.set(loc.uuid, sysId);
    }
  }

  for (const loc of locs) {
    // Skip stars — they are transparent nodes
    if (loc.type === 'star') continue;

    let pid = loc.parent_uuid && byId.has(loc.parent_uuid) ? loc.parent_uuid : null;

    // If parent is a star, skip it and use the star's system instead
    if (pid && starRemap.has(pid)) {
      pid = starRemap.get(pid) ?? null;
    }

    // Re-parent root orphans (non-system) under their system via system_code
    if (pid === null && loc.type !== 'system' && loc.system_code) {
      pid = systemUuidByCode.get(loc.system_code) ?? null;
    }

    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid)!.push(loc);
  }

  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => {
      const ao = TYPE_ORDER.indexOf(a.type);
      const bo = TYPE_ORDER.indexOf(b.type);
      const diff = (ao === -1 ? 99 : ao) - (bo === -1 ? 99 : bo);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
  }

  return { byId, childrenOf, roots: childrenOf.get(null) ?? [] };
}

function getAncestors(uuids: Set<string>, byId: Map<string, Location>): Set<string> {
  const result = new Set<string>();
  for (const uuid of uuids) {
    let loc = byId.get(uuid);
    while (loc?.parent_uuid) {
      if (result.has(loc.parent_uuid)) break;
      result.add(loc.parent_uuid);
      loc = byId.get(loc.parent_uuid);
    }
  }
  return result;
}

// ── TreeNode ──────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  loc: Location;
  childrenOf: Map<string | null, Location[]>;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (uuid: string) => void;
  matchIds: Set<string> | null;
  visibleIds: Set<string> | null;
}

function TreeNode({ loc, childrenOf, depth, expandedIds, onToggle, matchIds, visibleIds }: TreeNodeProps) {
  const allChildren = childrenOf.get(loc.uuid) ?? [];
  const visibleChildren = visibleIds ? allChildren.filter((c) => visibleIds.has(c.uuid)) : allChildren;
  const isExpanded = expandedIds.has(loc.uuid);
  const hasChildren = visibleChildren.length > 0;
  const isMatch = matchIds?.has(loc.uuid) ?? false;
  const meta = getTypeMeta(loc.type);

  const isSystem = loc.type === 'system';
  const isStar = loc.type === 'star';
  const isPlanet = loc.type === 'planet';
  const isMoon = loc.type === 'moon';
  const indentPx = depth * 16 + 8;

  return (
    <div>
      <div
        className={[
          'flex items-center gap-1.5 transition-colors select-none group',
          hasChildren ? 'cursor-pointer' : 'cursor-default',
          isSystem
            ? 'py-2.5 pr-3 border-b border-slate-700/60 bg-slate-800/40 hover:bg-slate-700/40'
            : isPlanet
            ? 'py-1.5 pr-2 border-b border-slate-800/30 hover:bg-slate-800/30'
            : isMoon
            ? 'py-1 pr-2 hover:bg-slate-800/20'
            : isStar
            ? 'py-0.5 pr-2 opacity-50 hover:opacity-80'
            : 'py-0.5 pr-2 hover:bg-slate-800/20',
          isMatch ? 'bg-cyan-950/40 !opacity-100' : '',
        ].join(' ')}
        style={{ paddingLeft: `${indentPx}px` }}
        onClick={() => hasChildren && onToggle(loc.uuid)}
      >
        {/* Chevron */}
        <span className="w-3 shrink-0 text-slate-600">
          {hasChildren
            ? isExpanded
              ? <ChevronDown size={11} />
              : <ChevronRight size={11} />
            : null}
        </span>

        {/* Icon */}
        <span className={isSystem || isPlanet ? COLOR_ICON[meta.color] : COLOR_DIM[meta.color]}>
          {meta.icon}
        </span>

        {/* Name */}
        <span
          className={[
            'flex-1 leading-tight truncate',
            isSystem
              ? 'font-orbitron text-sm font-bold text-cyan-300 tracking-widest uppercase'
              : isPlanet
              ? 'font-rajdhani font-semibold text-sm text-slate-100'
              : isMoon
              ? 'font-rajdhani font-semibold text-xs text-slate-300'
              : isStar
              ? 'font-mono text-[11px] text-slate-600 italic'
              : 'font-rajdhani text-xs text-slate-400',
          ].join(' ')}
        >
          {loc.name}
        </span>

        {/* Type badge — visible on hover or when matched */}
        {!isStar && !isSystem && (
          <span className={`text-[10px] shrink-0 transition-opacity ${isMatch ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}>
            <GlowBadge color={meta.color}>{meta.label}</GlowBadge>
          </span>
        )}

        {/* Child count badge when collapsed */}
        {hasChildren && !isExpanded && (
          <span className="text-[10px] text-slate-700 font-mono shrink-0 tabular-nums ml-1">
            {visibleChildren.length}
          </span>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div
          className={
            isSystem
              ? 'border-l-2 border-slate-700/50 ml-5'
              : isPlanet
              ? 'border-l border-slate-700/40 ml-5'
              : 'border-l border-slate-800/30 ml-5'
          }
        >
          {visibleChildren.map((child) => (
            <TreeNode
              key={child.uuid}
              loc={child}
              childrenOf={childrenOf}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              matchIds={matchIds}
              visibleIds={visibleIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LocationsPage() {
  const { env } = useEnv();
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const debouncedSearch = useDebounce(search, 250);

  const { data: rawLocs, isLoading, error } = useQuery({
    queryKey: ['locations-all', env],
    queryFn: () => api.locations.all(env),
    staleTime: 5 * 60_000,
  });

  const allLocs: Location[] = rawLocs ?? [];
  const { byId, childrenOf, roots } = useMemo(() => buildTree(allLocs), [allLocs]);

  // Auto-expand systems on first load
  useEffect(() => {
    if (!allLocs.length || initialized) return;
    setExpandedIds(new Set(allLocs.filter((l) => l.type === 'system').map((l) => l.uuid)));
    setInitialized(true);
  }, [allLocs, initialized]);

  // Search filter: find matches + ancestors
  const { visibleIds, matchIds } = useMemo<{
    visibleIds: Set<string> | null;
    matchIds: Set<string> | null;
  }>(() => {
    if (!debouncedSearch) return { visibleIds: null, matchIds: null };
    const q = debouncedSearch.toLowerCase();
    const matched = new Set(
      allLocs
        .filter((l) => l.name.toLowerCase().includes(q) || l.class_name.toLowerCase().includes(q))
        .map((l) => l.uuid),
    );
    const ancestors = getAncestors(matched, byId);
    return { visibleIds: new Set([...matched, ...ancestors]), matchIds: matched };
  }, [debouncedSearch, allLocs, byId]);

  // Expand ancestors of search matches automatically
  const effectiveExpandedIds = useMemo(() => {
    if (!debouncedSearch || !matchIds) return expandedIds;
    return new Set([...expandedIds, ...getAncestors(matchIds, byId)]);
  }, [debouncedSearch, matchIds, byId, expandedIds]);

  const toggle = (uuid: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(uuid) ? next.delete(uuid) : next.add(uuid);
      return next;
    });

  const expandAll = () =>
    setExpandedIds(new Set(Array.from(childrenOf.keys()).filter((k): k is string => k !== null)));

  const collapseAll = () =>
    setExpandedIds(new Set());

  const filteredRoots = useMemo(
    () => (visibleIds ? roots.filter((l) => visibleIds.has(l.uuid)) : roots),
    [roots, visibleIds],
  );

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">
          Locations
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Systems, planets, stations and points of interest in the verse.
        </p>
      </div>

      {/* Search + tree controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            placeholder="Search locations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-2 bg-slate-900/60 border border-border rounded-sm text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-700"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex gap-2 text-[11px] font-mono-sc shrink-0">
          <button type="button" onClick={expandAll} className="text-slate-500 hover:text-slate-300 transition-colors">
            expand all
          </button>
          <span className="text-slate-700">·</span>
          <button type="button" onClick={collapseAll} className="text-slate-500 hover:text-slate-300 transition-colors">
            collapse
          </button>
        </div>
      </div>

      {/* Tree */}
      {isLoading && <LoadingGrid rows={8} cols={1} />}
      {error && <ErrorState error={error as Error} />}

      {!isLoading && !error && (
        <div className="sci-panel overflow-hidden divide-y-0">
          {filteredRoots.length === 0 ? (
            <p className="text-sm text-slate-600 text-center py-10">No locations found.</p>
          ) : (
            filteredRoots.map((root) => (
              <TreeNode
                key={root.uuid}
                loc={root}
                childrenOf={childrenOf}
                depth={0}
                expandedIds={effectiveExpandedIds}
                onToggle={toggle}
                matchIds={matchIds}
                visibleIds={visibleIds}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
