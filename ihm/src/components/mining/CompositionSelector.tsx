import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useEnv } from '@/contexts/EnvContext';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { api } from '@/services/api';
import type { MiningComposition } from '@/types/api';
import {
  getCompositionDisplayName,
  mapCompositionToView,
  type MiningCompositionView,
} from '@/types/mining';

export interface CompositionSelectorProps {
  compositions: MiningComposition[] | undefined;
  selected: string;
  onChange: (compositionId: string, data: MiningCompositionView) => void;
  onLoadingChange?: (loading: boolean) => void;
}

export function CompositionSelector({
  compositions,
  selected,
  onChange,
  onLoadingChange,
}: CompositionSelectorProps) {
  const { env } = useEnv();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const current = compositions?.find((c) => c.uuid === selected);

  const filtered = useMemo(() => {
    if (!compositions) return [];
    const q = search.trim().toLowerCase();
    if (!q) return compositions;
    return compositions.filter((c) => {
      const displayName = getCompositionDisplayName(c).toLowerCase();
      return displayName.includes(q) || (c.class_name || '').toLowerCase().includes(q);
    });
  }, [compositions, search]);

  const handleSelect = useCallback(
    async (comp: MiningComposition) => {
      const optimisticData: MiningCompositionView = {
        id: comp.uuid,
        name: getCompositionDisplayName(comp),
        className: comp.class_name || '',
        minDistinctElements: comp.min_distinct_elements ?? undefined,
        elements: [],
      };

      onChange(comp.uuid, optimisticData);
      setOpen(false);
      setSearch('');
      setLoadingDetail(comp.uuid);
      onLoadingChange?.(true);

      try {
        const detail = await api.mining.composition(comp.uuid, env);
        const data = mapCompositionToView(detail);
        onChange(comp.uuid, data);
      } catch {
        // Keep optimistic selection if detail loading fails.
        onChange(comp.uuid, optimisticData);
      } finally {
        setLoadingDetail(null);
        onLoadingChange?.(false);
      }
    },
    [env, onChange, onLoadingChange],
  );

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          setSearch('');
        }}
        disabled={loadingDetail != null}
        className="sci-input w-full flex items-center justify-between gap-2 pr-3 text-left"
      >
        <span
          className={`font-rajdhani font-semibold text-sm ${current ? 'text-slate-100' : 'text-slate-500'}`}
        >
          {loadingDetail != null
            ? 'Loading composition…'
            : current
              ? getCompositionDisplayName(current)
              : 'Select a rock composition…'}
        </span>
        <ChevronDown
          size={14}
          className={`text-slate-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 top-full mt-1 left-0 right-0 bg-panel border border-border rounded shadow-xl"
          >
            <div className="sticky top-0 bg-panel border-b border-border p-2">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search deposit…"
                  className="sci-input w-full pl-7 text-xs py-1.5"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-600 text-center">No results</p>
              ) : (
                filtered.map((comp) => (
                  <button
                    key={comp.uuid}
                    onClick={() => handleSelect(comp)}
                    disabled={loadingDetail === comp.uuid}
                    className={`w-full px-3 py-2 text-left hover:bg-white/5 transition-colors flex items-center gap-2 ${
                      comp.uuid === selected ? 'text-cyan-400' : 'text-slate-300'
                    } ${loadingDetail === comp.uuid ? 'opacity-50' : ''}`}
                  >
                    <span className="font-rajdhani font-semibold text-sm flex-1">
                      {getCompositionDisplayName(comp)}
                    </span>
                    {comp.element_count != null && (
                      <GlowBadge color="slate" size="xs">
                        {comp.element_count} minerals
                      </GlowBadge>
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
