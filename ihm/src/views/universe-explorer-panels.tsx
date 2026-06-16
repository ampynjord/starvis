import type { ReactNode } from 'react';

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800/60 py-2">
      <span className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-400">{label}</span>
      <span className="text-right text-sm text-slate-100">{value}</span>
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-slate-700/80 bg-slate-950/85 px-2 py-2">
      <p className="font-mono-sc text-[9px] uppercase text-slate-400">{label}</p>
      <p className="font-orbitron text-sm text-cyan-300">{value}</p>
    </div>
  );
}

export function HudMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-sm border border-slate-700/80 bg-slate-950/85 px-2 py-2">
      <p className="flex items-center gap-1 font-mono-sc text-[9px] uppercase tracking-widest text-slate-400">
        <span className="text-cyan-300">{icon}</span>
        {label}
      </p>
      <p className="mt-0.5 font-orbitron text-sm text-slate-50">{value}</p>
    </div>
  );
}

export function InfoTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-sm border border-slate-700/80 bg-slate-950/85 px-3 py-2">
      <p className="flex items-center gap-1 font-mono-sc text-[9px] uppercase tracking-widest text-slate-400">
        <span className="text-cyan-300">{icon}</span>
        {label}
      </p>
      <p className="mt-1 font-orbitron text-sm text-slate-50">{value}</p>
    </div>
  );
}

export function StatBar({ icon, label, value, color }: { icon: ReactNode; label: string; value: number | null; color: string }) {
  const clamped = value == null ? null : Math.max(0, Math.min(10, value));
  const segments = Array.from({ length: 10 }, (_, index) => ({
    key: `${label}-${index}`,
    filled: clamped != null && index < Math.round(clamped),
  }));
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1 font-mono-sc text-[9px] uppercase tracking-widest text-slate-400">
          <span className="text-cyan-300">{icon}</span>
          {label}
        </span>
        <span className="font-orbitron text-[10px] text-slate-100">{clamped == null ? 'N/A' : clamped.toFixed(1)}</span>
      </div>
      <div className="flex h-1.5 gap-0.5">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="flex-1 rounded-[1px]"
            style={{ backgroundColor: segment.filled ? color : 'rgba(30,41,59,0.85)' }}
          />
        ))}
      </div>
    </div>
  );
}
