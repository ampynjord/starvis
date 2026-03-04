/**
 * CargoGrid — Visualisation isométrique 3D de la soute
 * Chaque cube représente blockSize SCU.
 * Layout calculé automatiquement : largeur × profondeur × étages.
 */

const COS30 = Math.sqrt(3) / 2; // ≈ 0.866

/** Projection isométrique 3D → coordonnées SVG (y vers le bas) */
function iso(c: number, r: number, z: number, s: number): [number, number] {
  return [
    (c - r) * s * COS30,
    (c + r) * s * 0.5 - z * s,
  ];
}

/** Convertit un tableau de points en string SVG polygon */
function polyStr(pts: [number, number][]): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

/** Calcule un layout w×d×h plausible pour le nombre de blocs donné */
function computeLayout(scu: number): { w: number; d: number; h: number; blockSize: number } {
  const MAX_BLOCKS = 64;
  const blockSize = Math.max(1, Math.ceil(scu / MAX_BLOCKS));
  const blocks = Math.ceil(scu / blockSize);

  // Préférer les layouts plats (h petit), w ≈ 2×d
  const h = Math.min(4, Math.max(1, Math.round(Math.pow(blocks, 1 / 3))));
  const base = Math.ceil(blocks / h);
  const d = Math.max(1, Math.round(Math.sqrt(base / 2)));
  const w = Math.max(d, Math.ceil(base / d));

  return { w, d, h: Math.max(1, Math.ceil(blocks / (w * d))), blockSize };
}

interface CubeEntry { c: number; r: number; z: number; filled: boolean; idx: number }

export function CargoGrid({ scu }: { scu: number }) {
  if (scu <= 0) return null;

  const { w, d, h, blockSize } = computeLayout(scu);
  const filledBlocks = Math.ceil(scu / blockSize);
  const totalBlocks = w * d * h;

  // Construire la liste des cubes (ordre d'itération définit l'index)
  const cubes: CubeEntry[] = [];
  let idx = 0;
  for (let z = 0; z < h; z++)
    for (let r = 0; r < d; r++)
      for (let c = 0; c < w; c++)
        cubes.push({ c, r, z, filled: idx < filledBlocks, idx: idx++ });

  // Algorithme du peintre : trier par profondeur décroissante (c+r-z)
  // Les cubes "au fond" (grande valeur) sont dessinés en premier
  cubes.sort((a, b) => (b.c + b.r - b.z) - (a.c + a.r - a.z));

  // Taille d'un cube en pixels (s'adapte au layout)
  const S = Math.max(10, Math.min(24, Math.floor(200 / Math.max(w + d, (h + 1) * 2))));
  const PAD = 6;

  const svgW = Math.ceil((w + d) * S * COS30 + PAD * 2);
  const svgH = Math.ceil((w + d) * S * 0.5 + h * S + PAD * 2);
  // Origine : décale pour que (0,0,0) soit visible
  const ox = d * S * COS30 + PAD;
  const oy = h * S + PAD;

  /** Coordonnée SVG d'un sommet du cube */
  const pt = (c: number, r: number, z: number): [number, number] => {
    const [x, y] = iso(c, r, z, S);
    return [x + ox, y + oy];
  };

  return (
    <div className="space-y-2">

      {/* En-tête */}
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Cargo hold</span>
        <div className="flex items-baseline gap-2">
          {blockSize > 1 && (
            <span className="text-[9px] font-mono-sc text-slate-700">1 cube = {blockSize} SCU</span>
          )}
          <span className="text-sm font-orbitron font-bold text-emerald-400 tabular-nums">
            {scu.toLocaleString('en-US')}
            <span className="text-[10px] text-emerald-700 ml-0.5">SCU</span>
          </span>
        </div>
      </div>

      {/* Rendu isométrique */}
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxHeight: 200 }}>
        {cubes.map(({ c, r, z, filled, idx: i }) => {
          // 3 faces visibles d'un cube isométrique vu de dessus-droite
          const topFace: [number, number][] = [
            pt(c, r, z + 1), pt(c + 1, r, z + 1), pt(c + 1, r + 1, z + 1), pt(c, r + 1, z + 1),
          ];
          const rightFace: [number, number][] = [   // face côté +col (droite écran)
            pt(c + 1, r, z), pt(c + 1, r, z + 1), pt(c + 1, r + 1, z + 1), pt(c + 1, r + 1, z),
          ];
          const leftFace: [number, number][] = [    // face côté +row (gauche écran)
            pt(c, r + 1, z), pt(c, r + 1, z + 1), pt(c + 1, r + 1, z + 1), pt(c + 1, r + 1, z),
          ];

          if (!filled) {
            // Cube vide — contour fantôme très discret
            return (
              <g key={i} opacity={0.12}>
                <polygon points={polyStr(topFace)}   fill="none" stroke="#334155" strokeWidth={0.6} />
                <polygon points={polyStr(rightFace)} fill="none" stroke="#334155" strokeWidth={0.6} />
                <polygon points={polyStr(leftFace)}  fill="none" stroke="#334155" strokeWidth={0.6} />
              </g>
            );
          }

          // Centroïde de la face du dessus pour le label
          const cx = topFace.reduce((s, [x]) => s + x, 0) / 4;
          const cy = topFace.reduce((s, [, y]) => s + y, 0) / 4;
          const showLabel = S >= 16;

          return (
            <g key={i}>
              {/* Face du dessus : la plus claire */}
              <polygon
                points={polyStr(topFace)}
                fill="#065f46"
                stroke="#10b981"
                strokeWidth={0.5}
                strokeOpacity={0.4}
              />
              {/* Face droite */}
              <polygon
                points={polyStr(rightFace)}
                fill="#064e3b"
                stroke="#10b981"
                strokeWidth={0.5}
                strokeOpacity={0.4}
              />
              {/* Face gauche : la plus sombre */}
              <polygon
                points={polyStr(leftFace)}
                fill="#022c22"
                stroke="#10b981"
                strokeWidth={0.5}
                strokeOpacity={0.4}
              />
              {/* Numéro de cube */}
              {showLabel && (
                <text
                  x={cx}
                  y={cy + 0.5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={S * 0.32}
                  fill="#6ee7b7"
                  opacity={0.65}
                  fontFamily="monospace"
                >
                  {i + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Pied de page */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono-sc text-slate-800">{w}×{d}×{h} layout</span>
        <span className="text-[9px] font-mono-sc text-slate-800">{filledBlocks}/{totalBlocks} cubes</span>
      </div>
    </div>
  );
}
