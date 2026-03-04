/**
 * CargoGrid — Visualisation de la capacité cargo en grille 2D
 * Approximation visuelle : 1 cellule = blockSize SCU
 * Les dimensions réelles de soute ne sont pas dans la DB,
 * on calcule une géométrie plausible basée sur le SCU total.
 */

interface Props {
  scu: number;
}

/** Trouve cols×rows avec ratio proche de 2:1 (soutes sont souvent plus larges que hautes) */
function gridLayout(scu: number): { cols: number; rows: number; blockSize: number } {
  // On vise ~40 cellules max affichées
  const MAX_CELLS = 40;
  const blockSize = Math.max(1, Math.ceil(scu / MAX_CELLS));
  const cells = Math.ceil(scu / blockSize);

  // Ratio cible : ~2.5 cols pour 1 row
  const RATIO = 2.5;
  const cols = Math.max(1, Math.round(Math.sqrt(cells * RATIO)));
  const rows = Math.max(1, Math.ceil(cells / cols));

  return { cols, rows, blockSize };
}

export function CargoGrid({ scu }: Props) {
  if (scu <= 0) return null;

  const { cols, rows, blockSize } = gridLayout(scu);
  const totalCells = cols * rows;
  const filledCells = Math.ceil(scu / blockSize);

  return (
    <div className="space-y-2.5">
      {/* En-tête */}
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Cargo hold</span>
        <div className="flex items-baseline gap-2">
          {blockSize > 1 && (
            <span className="text-[9px] font-mono-sc text-slate-700">1 cell = {blockSize} SCU</span>
          )}
          <span className="text-sm font-orbitron font-bold text-emerald-400 tabular-nums">
            {scu.toLocaleString('en-US')}
            <span className="text-[10px] text-emerald-700 ml-0.5">SCU</span>
          </span>
        </div>
      </div>

      {/* Grille */}
      <div
        className="grid gap-px rounded-sm overflow-hidden border border-slate-800/80"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {Array.from({ length: totalCells }).map((_, i) => {
          const filled = i < filledCells;
          const isLast = i === filledCells - 1;
          const partialPct = isLast && scu % blockSize !== 0
            ? Math.round(((scu % blockSize) / blockSize) * 100)
            : 100;

          return (
            <div
              key={i}
              title={filled ? `${Math.min(blockSize, scu - i * blockSize)} SCU` : 'Empty'}
              className={`
                relative h-4 transition-colors
                ${filled
                  ? 'bg-emerald-900/70 hover:bg-emerald-800/80'
                  : 'bg-slate-900/40'
                }
              `}
            >
              {/* Barre de remplissage partielle pour la dernière cellule */}
              {isLast && partialPct < 100 && (
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-900/70"
                  style={{ width: `${partialPct}%` }}
                />
              )}
              {/* Bordure intérieure pour donner l'effet "boîte" */}
              {filled && (
                <div className="absolute inset-0 border border-emerald-700/20 pointer-events-none rounded-[1px]" />
              )}
            </div>
          );
        })}
      </div>

      {/* Infos layout */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono-sc text-slate-800">
          {cols} × {rows} grid
        </span>
        <span className="text-[9px] font-mono-sc text-slate-800">
          {filledCells} / {totalCells} cells
        </span>
      </div>
    </div>
  );
}
