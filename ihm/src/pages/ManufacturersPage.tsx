import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Rocket, Settings2, Zap } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/services/api';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { ErrorState } from '@/components/ui/ErrorState';
import { ShipCard } from '@/components/ship/ShipCard';
import type { Manufacturer } from '@/types/api';

export default function ManufacturersPage() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data: manufacturers, isLoading, error, refetch } = useQuery({
    queryKey: ['manufacturers.list'],
    queryFn: api.manufacturers.list,
  });
  const { data: shipsByMfr } = useQuery({
    queryKey: ['manufacturers.ships', selected],
    queryFn: () => api.manufacturers.ships(selected!),
    enabled: !!selected,
  });
  const selectedMfr = manufacturers?.find((m: Manufacturer) => m.code === selected);

  if (isLoading) return <LoadingGrid message="LOADING…" />;
  if (error)     return <ErrorState error={error as Error} onRetry={() => void refetch()} />;

  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      <h1 className="font-orbitron text-xl font-bold text-cyan-400 tracking-widest uppercase">Manufacturers</h1>

      <div className="flex gap-6">
        {/* List */}
        <div className="w-64 flex-shrink-0">
          <div className="sci-panel overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-mono-sc text-slate-600 uppercase">
                {manufacturers?.length ?? 0} manufacturers
              </p>
            </div>
            <div className="space-y-0.5 p-1.5 max-h-[calc(100vh-200px)] overflow-y-auto">
              {manufacturers?.map((m: Manufacturer) => (
                <button
                  key={m.code}
                  onClick={() => setSelected(m.code === selected ? null : m.code)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-left transition-all ${
                    m.code === selected
                      ? 'bg-cyan-950/60 border border-cyan-800 text-cyan-400'
                      : 'hover:bg-white/5 text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-orbitron text-xs font-bold truncate">{m.code}</p>
                    <p className="text-xs text-slate-600 truncate">{m.name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-xs font-mono-sc text-slate-600">{m.ship_count}</span>
                    <ChevronRight size={10} className="text-slate-700" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Detail */}
        <div className="flex-1 min-w-0 space-y-4">
          {selectedMfr ? (
            <>
              <ScifiPanel>
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-widest">{selectedMfr.code}</p>
                    <h2 className="font-orbitron text-xl text-slate-100 mt-0.5">{selectedMfr.name}</h2>
                    {selectedMfr.known_for && (
                      <p className="text-sm text-slate-500 mt-1 italic">{selectedMfr.known_for}</p>
                    )}
                    {selectedMfr.description && (
                      <p className="text-sm text-slate-400 mt-2 leading-relaxed">{selectedMfr.description}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 flex-shrink-0">
                    <div className="sci-panel p-3 text-center">
                      <Rocket size={16} className="text-cyan-400 mx-auto mb-1" />
                      <p className="font-orbitron text-lg text-slate-200">{selectedMfr.ship_count}</p>
                      <p className="text-xs text-slate-600">Ships</p>
                    </div>
                    <div className="sci-panel p-3 text-center">
                      <Settings2 size={16} className="text-blue-400 mx-auto mb-1" />
                      <p className="font-orbitron text-lg text-slate-200">{selectedMfr.component_count}</p>
                      <p className="text-xs text-slate-600">Components</p>
                    </div>
                  </div>
                </div>
              </ScifiPanel>

              {shipsByMfr && shipsByMfr.length > 0 && (
                <ScifiPanel title="Ships" subtitle={`${shipsByMfr.length} ships`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {shipsByMfr.map((s, i) => <ShipCard key={s.uuid} ship={s} index={i} />)}
                  </div>
                </ScifiPanel>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-700">
              <Zap size={32} />
              <p className="font-orbitron text-sm tracking-widest">Select a manufacturer</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
