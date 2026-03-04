/**
 * CargoGrid — SCU count + iframe sc-cargo.space pré-sélectionné sur le vaisseau
 * Format URL sc-cargo : nom lowercase + "-official"
 * ex: "Avenger Titan" → "#/v1/viewer/avenger%20titan-official"
 */
import { useState } from 'react';
import { Maximize2, X } from 'lucide-react';

export function CargoGrid({ scu, shipName }: { scu: number; shipName: string }) {
  if (scu <= 0) return null;

  const [fullscreen, setFullscreen] = useState(false);
  const scCargoSlug = encodeURIComponent(shipName.toLowerCase()) + '-official';
  const iframeSrc = `https://sc-cargo.space/#/v1/viewer/${scCargoSlug}`;

  return (
    <>
      <div className="space-y-2">
        {/* En-tête SCU */}
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-mono-sc text-slate-600 uppercase tracking-widest">Cargo hold</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-orbitron font-bold text-emerald-400 tabular-nums">
              {scu.toLocaleString('en-US')}
              <span className="text-[10px] text-emerald-700 ml-0.5">SCU</span>
            </span>
            <button
              onClick={() => setFullscreen(true)}
              title="Plein écran"
              className="flex items-center justify-center w-5 h-5 rounded border border-slate-700 bg-slate-900 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-colors"
            >
              <Maximize2 size={10} />
            </button>
          </div>
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

        {/* Crédits */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono-sc text-slate-800">
            Made by the community · © sc-cargo.space
          </span>
          <a
            href={`https://sc-cargo.space/#/v1/viewer/${scCargoSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] font-mono-sc text-slate-700 hover:text-slate-500 underline underline-offset-2"
          >
            ouvrir ↗
          </a>
        </div>
      </div>

      {/* Overlay plein écran */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={(e) => { if (e.target === e.currentTarget) setFullscreen(false); }}
        >
          {/* Barre de titre */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono-sc text-slate-500 uppercase tracking-widest">Cargo hold</span>
              <span className="font-orbitron font-bold text-emerald-400 text-sm tabular-nums">
                {scu.toLocaleString('en-US')}
                <span className="text-[10px] text-emerald-700 ml-0.5">SCU</span>
              </span>
              <span className="text-[10px] font-mono-sc text-slate-700">— {shipName}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-mono-sc text-slate-700">
                Made by the community ·{' '}
                <a
                  href="https://sc-cargo.space"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 hover:text-slate-400 underline underline-offset-2"
                >
                  sc-cargo.space
                </a>
              </span>
              <button
                onClick={() => setFullscreen(false)}
                className="flex items-center justify-center w-6 h-6 rounded border border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* iframe pleine hauteur */}
          <iframe
            key={iframeSrc + '-fs'}
            src={iframeSrc}
            title="sc-cargo viewer fullscreen"
            className="flex-1 w-full"
            style={{ border: 'none', display: 'block' }}
          />
        </div>
      )}
    </>
  );
}
