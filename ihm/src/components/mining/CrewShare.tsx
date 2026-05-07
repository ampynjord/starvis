import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Users } from 'lucide-react';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { CREW_ROLES } from '@/data/mining-static';

interface CrewMember {
  id: number;
  name: string;
  role: string;
  shares: number;
}

let _mid = 0;
function newId() {
  return ++_mid;
}

export function CrewShare() {
  const [totalValue, setTotalValue] = useState<string>('500000');
  const [members, setMembers] = useState<CrewMember[]>([
    { id: newId(), name: 'Player 1', role: 'miner', shares: 2 },
    { id: newId(), name: 'Player 2', role: 'pilot', shares: 1 },
  ]);

  const total = Number(totalValue) || 0;

  const addMember = () => {
    setMembers((prev) => [
      ...prev,
      { id: newId(), name: `Player ${prev.length + 1}`, role: 'other', shares: 1 },
    ]);
  };

  const removeMember = (id: number) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const updateMember = (id: number, field: keyof CrewMember, value: string | number) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const totalShares = useMemo(() => members.reduce((s, m) => s + Math.max(0, m.shares), 0), [members]);

  const results = useMemo(() => {
    if (totalShares === 0) return members.map((m) => ({ ...m, cut: 0, pct: 0 }));
    return members.map((m) => {
      const memberShares = Math.max(0, m.shares);
      const pct = memberShares / totalShares;
      return { ...m, cut: total * pct, pct };
    });
  }, [members, total, totalShares]);

  const fmt = (v: number) => Math.round(v).toLocaleString();

  return (
    <div className="space-y-4">
      {/* Total value input */}
      <ScifiPanel title="Session Profit" subtitle="Enter total aUEC to distribute among the crew">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">
              Total Value (aUEC)
            </label>
            <input
              type="number"
              min={0}
              value={totalValue}
              onChange={(e) => setTotalValue(e.target.value)}
              className="sci-input w-full"
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="border border-slate-800/60 rounded-sm p-3 flex-1 text-center">
              <div className="text-[9px] uppercase tracking-widest text-slate-600 font-mono-sc">Total Shares</div>
              <div className="font-orbitron text-lg font-bold text-cyan-400 mt-0.5">{totalShares}</div>
            </div>
            <div className="border border-slate-800/60 rounded-sm p-3 flex-1 text-center">
              <div className="text-[9px] uppercase tracking-widest text-slate-600 font-mono-sc">Crew Size</div>
              <div className="font-orbitron text-lg font-bold text-slate-300 mt-0.5">{members.length}</div>
            </div>
            <div className="border border-slate-800/60 rounded-sm p-3 flex-1 text-center">
              <div className="text-[9px] uppercase tracking-widest text-slate-600 font-mono-sc">Value/Share</div>
              <div className="font-orbitron text-sm font-bold text-amber-400 mt-0.5">
                {totalShares > 0 ? fmt(total / totalShares) : '—'} aUEC
              </div>
            </div>
          </div>
        </div>
      </ScifiPanel>

      {/* Crew members */}
      <ScifiPanel
        title="Crew Members"
        subtitle="Assign roles and share weights"
        actions={
          <button
            type="button"
            onClick={addMember}
            className="sci-btn sci-btn-primary flex items-center gap-1.5 text-xs px-2 py-1"
          >
            <Plus size={12} />
            Add Member
          </button>
        }
      >
        <div className="space-y-2">
          {members.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="sci-panel px-3 py-2"
            >
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 items-center">
                {/* Name */}
                <input
                  type="text"
                  value={m.name}
                  onChange={(e) => updateMember(m.id, 'name', e.target.value)}
                  placeholder="Name"
                  className="sci-input text-xs col-span-1"
                />

                {/* Role */}
                <select
                  value={m.role}
                  onChange={(e) => {
                    const role = CREW_ROLES.find((r) => r.id === e.target.value);
                    updateMember(m.id, 'role', e.target.value);
                    if (role) updateMember(m.id, 'shares', role.defaultShares);
                  }}
                  className="sci-select text-xs col-span-1"
                >
                  {CREW_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>

                {/* Shares */}
                <div className="flex items-center gap-1.5 col-span-1">
                  <label className="text-[9px] text-slate-600 font-mono-sc uppercase shrink-0">Shares</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={m.shares}
                    onChange={(e) => updateMember(m.id, 'shares', Number(e.target.value))}
                    className="sci-input text-xs w-16"
                  />
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  className="text-red-500/70 hover:text-red-400 justify-self-end col-span-1 sm:col-span-1"
                  aria-label="Remove member"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          ))}

          {members.length === 0 && (
            <div className="text-center py-6 text-slate-600 text-xs font-mono-sc">
              No crew members. Click "Add Member".
            </div>
          )}
        </div>
      </ScifiPanel>

      {/* Distribution results */}
      {members.length > 0 && total > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <ScifiPanel title="Payout Distribution">
            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  {/* Name + role */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-rajdhani font-semibold text-sm text-slate-100 truncate">{r.name}</span>
                      <span className="text-[9px] text-slate-600 uppercase font-mono-sc shrink-0">{r.role}</span>
                      <span className="text-[9px] text-cyan-600 font-mono-sc shrink-0">{r.shares} share{r.shares !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cyan-600"
                        style={{ width: `${(r.pct * 100).toFixed(1)}%` }}
                      />
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <div className="font-orbitron text-sm font-bold text-green-400">{fmt(r.cut)} aUEC</div>
                    <div className="text-[9px] text-slate-600 font-mono-sc">{(r.pct * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </ScifiPanel>
        </motion.div>
      )}

      {members.length === 0 && (
        <div className="text-center py-10 text-slate-600">
          <Users size={40} className="mx-auto mb-3 opacity-15" />
          <p className="text-xs font-mono-sc uppercase tracking-widest">Add crew members to split the profit</p>
        </div>
      )}
    </div>
  );
}
