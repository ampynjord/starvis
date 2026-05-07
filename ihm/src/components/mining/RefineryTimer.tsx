import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Plus, Trash2, CheckCircle2, Timer } from 'lucide-react';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { BASE_REFINERY_MINUTES_PER_SCU, REFINERY_LOCATIONS, REFINERY_METHODS } from '@/data/mining-static';

interface RefineryJob {
  id: number;
  label: string;
  locationId: string;
  methodId: string;
  scu: number;
  startedAt: number; // epoch ms
  durationMs: number;
  done: boolean;
}

let _jid = 0;
function newId() {
  return ++_jid;
}

function calcDuration(scu: number, timeMultiplier: number): number {
  const minutes = scu * BASE_REFINERY_MINUTES_PER_SCU * timeMultiplier;
  return Math.round(minutes * 60 * 1000); // ms
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'COMPLETE';
  const totalS = Math.floor(ms / 1000);
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function RefineryTimer() {
  const [jobs, setJobs] = useState<RefineryJob[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newLocation, setNewLocation] = useState(REFINERY_LOCATIONS[0].id);
  const [newMethod, setNewMethod] = useState('cormack');
  const [newScu, setNewScu] = useState<string>('10');
  const [now, setNow] = useState(Date.now);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every second for live countdown
  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const addJob = useCallback(() => {
    const scu = Math.max(0.1, Number(newScu) || 1);
    const method = REFINERY_METHODS.find((m) => m.id === newMethod) ?? REFINERY_METHODS[1];
    const location = REFINERY_LOCATIONS.find((l) => l.id === newLocation) ?? REFINERY_LOCATIONS[0];
    const durationMs = calcDuration(scu, method.timeMultiplier);
    const startedAt = Date.now();
    setJobs((prev) => [
      ...prev,
      {
        id: newId(),
        label: newLabel.trim() || `${location.name} — ${method.name}`,
        locationId: newLocation,
        methodId: newMethod,
        scu,
        startedAt,
        durationMs,
        done: false,
      },
    ]);
    setNewLabel('');
    setNewScu('10');
  }, [newLabel, newLocation, newMethod, newScu]);

  const removeJob = useCallback((id: number) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const markDone = useCallback((id: number) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, done: true } : j)));
  }, []);

  const jobsWithProgress = useMemo(() => {
    return jobs.map((j) => {
      const elapsed = now - j.startedAt;
      const remaining = Math.max(0, j.durationMs - elapsed);
      const progress = j.done ? 1 : Math.min(1, elapsed / j.durationMs);
      const done = j.done || remaining === 0;
      return { ...j, elapsed, remaining, progress, done };
    });
  }, [jobs, now]);

  const activeJobs = jobsWithProgress.filter((j) => !j.done);
  const completedJobs = jobsWithProgress.filter((j) => j.done);

  const method = REFINERY_METHODS.find((m) => m.id === newMethod) ?? REFINERY_METHODS[1];
  const previewScu = Math.max(0.1, Number(newScu) || 1);
  const previewMs = calcDuration(previewScu, method.timeMultiplier);

  return (
    <div className="space-y-4">
      {/* New job form */}
      <ScifiPanel title="New Refinery Order" subtitle="Start a timer for a refinery job">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">Label (optional)</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="My ore run"
              className="sci-input w-full text-xs"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">Location</label>
            <select
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              className="sci-select w-full text-xs"
            >
              {REFINERY_LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.system})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">Method</label>
            <select
              value={newMethod}
              onChange={(e) => setNewMethod(e.target.value)}
              className="sci-select w-full text-xs"
            >
              {REFINERY_METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({(m.yieldPct * 100).toFixed(0)}% yield)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-600 block mb-1">Amount (SCU)</label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={newScu}
              onChange={(e) => setNewScu(e.target.value)}
              className="sci-input w-full text-xs"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[10px] font-mono-sc text-slate-600">
            Est. duration:{' '}
            <span className="text-cyan-400">{formatCountdown(previewMs)}</span>
            {' · '}Completes at{' '}
            <span className="text-cyan-400">{formatTime(Date.now() + previewMs)}</span>
          </div>
          <button
            type="button"
            onClick={addJob}
            className="sci-btn sci-btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 shrink-0"
          >
            <Plus size={12} />
            Start Timer
          </button>
        </div>
      </ScifiPanel>

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <ScifiPanel
          title="Active Orders"
          subtitle={`${activeJobs.length} job${activeJobs.length !== 1 ? 's' : ''} in progress`}
        >
          <div className="space-y-3">
            {activeJobs.map((job) => {
              const loc = REFINERY_LOCATIONS.find((l) => l.id === job.locationId);
              const meth = REFINERY_METHODS.find((m) => m.id === job.methodId);
              const finishAt = job.startedAt + job.durationMs;
              const isAlmostDone = job.remaining < 5 * 60 * 1000 && !job.done;
              return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`sci-panel px-3 py-3 ${isAlmostDone ? 'border-amber-500/50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="font-rajdhani font-semibold text-sm text-slate-100">{job.label}</div>
                      <div className="text-[10px] font-mono-sc text-slate-600 mt-0.5">
                        {loc?.name} · {meth?.name} · {job.scu} SCU
                      </div>
                      <div className="text-[10px] font-mono-sc text-slate-600">
                        Started {formatTime(job.startedAt)} → Finishes {formatTime(finishAt)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-orbitron font-bold text-base ${isAlmostDone ? 'text-amber-400 animate-pulse' : 'text-cyan-400'}`}>
                        {formatCountdown(job.remaining)}
                      </div>
                      <div className="text-[9px] text-slate-600 font-mono-sc">remaining</div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all ${isAlmostDone ? 'bg-amber-500' : 'bg-cyan-600'}`}
                      style={{ width: `${(job.progress * 100).toFixed(2)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-600 font-mono-sc">
                      {(job.progress * 100).toFixed(1)}% complete
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => markDone(job.id)}
                        className="text-[10px] text-green-500/70 hover:text-green-400 font-mono-sc flex items-center gap-1"
                      >
                        <CheckCircle2 size={11} /> Mark Done
                      </button>
                      <button
                        type="button"
                        onClick={() => removeJob(job.id)}
                        className="text-red-500/60 hover:text-red-400"
                        aria-label="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ScifiPanel>
      )}

      {/* Completed jobs */}
      {completedJobs.length > 0 && (
        <ScifiPanel title="Completed Orders" subtitle="Refinery orders ready for pickup">
          <div className="space-y-2">
            {completedJobs.map((job) => {
              const loc = REFINERY_LOCATIONS.find((l) => l.id === job.locationId);
              const meth = REFINERY_METHODS.find((m) => m.id === job.methodId);
              return (
                <div
                  key={job.id}
                  className="sci-panel px-3 py-2 border-green-600/20 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                      <span className="font-rajdhani font-semibold text-sm text-slate-300">{job.label}</span>
                    </div>
                    <div className="text-[10px] font-mono-sc text-slate-600 mt-0.5 ml-5">
                      {loc?.name} · {meth?.name} · {job.scu} SCU
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeJob(job.id)}
                    className="text-slate-600 hover:text-red-400 shrink-0"
                    aria-label="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </ScifiPanel>
      )}

      {jobs.length === 0 && (
        <div className="text-center py-12 text-slate-600">
          <Timer size={40} className="mx-auto mb-3 opacity-15" />
          <p className="text-xs font-mono-sc uppercase tracking-widest">No active refinery orders</p>
          <p className="text-[10px] text-slate-700 mt-1">Start a timer above to track your refinery jobs</p>
        </div>
      )}

      <div className="text-[10px] text-slate-700 font-mono-sc text-center">
        Timer durations are estimates based on {BASE_REFINERY_MINUTES_PER_SCU} min/SCU base rate. Actual in-game times vary.
      </div>
    </div>
  );
}
