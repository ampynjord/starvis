import { useMemo, useState } from 'react';
import { ChevronDown, Search, Zap, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { MiningLaserInfo } from '@/types/api';

export interface LaserSelectorProps {
  lasers: MiningLaserInfo[];
  selectedLaserUuid: string | undefined;
  selectedGadgetUuids: string[];
  onLaserChange: (uuid: string | undefined) => void;
  onGadgetsChange: (uuids: string[]) => void;
}

export function LaserSelector({
  lasers,
  selectedLaserUuid,
  selectedGadgetUuids,
  onLaserChange,
  onGadgetsChange,
}: LaserSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Separate lasers (typically size >= 1) from gadgets (size 0 or consumables)
  const { miningLasers, miningGadgets } = useMemo(() => {
    const miningLasers: MiningLaserInfo[] = [];
    const miningGadgets: MiningLaserInfo[] = [];
    for (const l of lasers) {
      if (l.size === 0 || l.name.toLowerCase().includes('module')) {
        miningGadgets.push(l);
      } else {
        miningLasers.push(l);
      }
    }
    return { miningLasers, miningGadgets };
  }, [lasers]);

  const filteredLasers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return miningLasers;
    return miningLasers.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.manufacturerCode ?? '').toLowerCase().includes(q),
    );
  }, [miningLasers, search]);

  const selectedLaser = miningLasers.find((l) => l.uuid === selectedLaserUuid);

  const handleGadgetToggle = (uuid: string) => {
    if (selectedGadgetUuids.includes(uuid)) {
      onGadgetsChange(selectedGadgetUuids.filter((u) => u !== uuid));
    } else if (selectedGadgetUuids.length < 3) {
      onGadgetsChange([...selectedGadgetUuids, uuid]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mining Laser Selector */}
      <div>
        <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">Mining Laser</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded text-xs font-mono-sc text-slate-300 hover:border-cyan-600/30 transition-colors"
          >
            <span className={selectedLaser ? 'text-cyan-400' : 'text-slate-600'}>
              {selectedLaser ? `${selectedLaser.name} (S${selectedLaser.size})` : 'No laser selected'}
            </span>
            <ChevronDown size={14} className={`text-slate-600 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-20 mt-1 w-full bg-slate-900 border border-slate-700/50 rounded shadow-xl max-h-48 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800">
                  <Search size={12} className="text-slate-600" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search lasers..."
                    className="bg-transparent text-xs text-slate-300 outline-none w-full font-mono-sc"
                  />
                </div>
                <div className="overflow-y-auto max-h-36">
                  <button
                    type="button"
                    onClick={() => {
                      onLaserChange(undefined);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono-sc text-slate-500 hover:bg-slate-800/50"
                  >
                    None
                  </button>
                  {filteredLasers.map((l) => (
                    <button
                      key={l.uuid}
                      type="button"
                      onClick={() => {
                        onLaserChange(l.uuid);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-mono-sc flex items-center justify-between hover:bg-slate-800/50 ${
                        l.uuid === selectedLaserUuid ? 'text-cyan-400 bg-cyan-950/20' : 'text-slate-300'
                      }`}
                    >
                      <span>
                        {l.name} <span className="text-slate-600">S{l.size}</span>
                      </span>
                      <span className="text-[10px] text-slate-600">{l.miningSpeed.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Laser Stats */}
        {selectedLaser && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 grid grid-cols-2 gap-1.5">
            <StatBadge label="Speed" value={selectedLaser.miningSpeed.toFixed(2)} />
            <StatBadge label="Range" value={`${selectedLaser.miningRange.toFixed(0)}m`} />
            <StatBadge label="Resist" value={selectedLaser.miningResistance.toFixed(3)} good={selectedLaser.miningResistance > 0} />
            <StatBadge label="Instab" value={selectedLaser.miningInstability.toFixed(3)} bad={selectedLaser.miningInstability > 0} />
          </motion.div>
        )}
      </div>

      {/* Mining Gadgets */}
      {miningGadgets.length > 0 && (
        <div>
          <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">
            Gadgets <span className="text-cyan-600">({selectedGadgetUuids.length}/3)</span>
          </label>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {miningGadgets.map((g) => {
              const isSelected = selectedGadgetUuids.includes(g.uuid);
              return (
                <button
                  key={g.uuid}
                  type="button"
                  onClick={() => handleGadgetToggle(g.uuid)}
                  disabled={!isSelected && selectedGadgetUuids.length >= 3}
                  className={`w-full text-left px-2 py-1 rounded text-xs font-mono-sc flex items-center gap-2 transition-colors ${
                    isSelected
                      ? 'bg-amber-950/30 border border-amber-600/30 text-amber-400'
                      : 'bg-slate-900/50 border border-slate-700/30 text-slate-400 hover:border-slate-600/50 disabled:opacity-40'
                  }`}
                >
                  <Zap size={10} className={isSelected ? 'text-amber-400' : 'text-slate-600'} />
                  <span className="flex-1 truncate">{g.name}</span>
                  {isSelected && <X size={10} className="text-amber-500" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  let color = 'text-slate-400';
  if (good) color = 'text-emerald-400';
  if (bad) color = 'text-red-400';
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-slate-600">{label}</div>
      <div className={`text-xs font-semibold ${color}`}>{value}</div>
    </div>
  );
}
