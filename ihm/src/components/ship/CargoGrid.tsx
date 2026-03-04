/**
 * CargoGrid — SCU count + iframe sc-cargo.space
 */
export function CargoGrid({ scu }: { scu: number }) {
  if (scu <= 0) return null;

  return (
    <div className="space-y-2">
      {/* En-tête SCU */}
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Cargo hold</span>
        <span className="text-sm font-orbitron font-bold text-emerald-400 tabular-nums">
          {scu.toLocaleString('en-US')}
          <span className="text-[10px] text-emerald-700 ml-0.5">SCU</span>
        </span>
      </div>

      {/* Viewer 3D sc-cargo.space */}
      <div className="rounded border border-slate-800/80 overflow-hidden bg-slate-950">
        <iframe
          src="https://sc-cargo.space/"
          title="sc-cargo viewer"
          className="w-full"
          style={{ height: 260, border: 'none', display: 'block' }}
          loading="lazy"
        />
      </div>

      <p className="text-[9px] font-mono-sc text-slate-800 text-right">
        via&nbsp;sc-cargo.space
      </p>
    </div>
  );
}
