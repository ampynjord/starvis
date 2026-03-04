/**
 * CargoGrid — SCU count + iframe sc-cargo.space pré-sélectionné sur le vaisseau
 * Format URL sc-cargo : nom lowercase + "-official"
 * ex: "Avenger Titan" → "#/v1/viewer/avenger%20titan-official"
 */
export function CargoGrid({ scu, shipName }: { scu: number; shipName: string }) {
  if (scu <= 0) return null;

  const scCargoSlug = encodeURIComponent(shipName.toLowerCase()) + '-official';
  const iframeSrc = `https://sc-cargo.space/#/v1/viewer/${scCargoSlug}`;

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
          key={iframeSrc}
          src={iframeSrc}
          title="sc-cargo viewer"
          className="w-full"
          style={{ height: 260, border: 'none', display: 'block' }}
          loading="lazy"
        />
      </div>

      <p className="text-[9px] font-mono-sc text-slate-800 text-right">
        via&nbsp;<a
          href={iframeSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-700 hover:text-slate-500 underline underline-offset-2"
        >sc-cargo.space</a>
      </p>
    </div>
  );
}
