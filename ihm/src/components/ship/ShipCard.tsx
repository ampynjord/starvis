import { motion } from 'framer-motion';
import { Users, Maximize2, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ShipListItem } from '@/types/api';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { fSpeed, fDimension } from '@/utils/formatters';
import { VARIANT_TYPE_LABELS } from '@/utils/constants';

interface Props {
  ship: ShipListItem;
  index?: number;
}

export function ShipCard({ ship, index = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4) }}
    >
      <Link to={`/ships/${ship.uuid}`} className="block">
        {/* Carte horizontale à hauteur fixe */}
        <div className="holo-card flex h-28 overflow-hidden">
          {/* Thumbnail — largeur fixe, hauteur 100% */}
          <div className="relative w-36 flex-shrink-0 bg-slate-900/80">
            {ship.thumbnail ? (
              <img
                src={ship.thumbnail}
                alt={ship.name}
                className="w-full h-full object-cover opacity-90"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="font-orbitron text-lg font-black text-slate-700 select-none">
                  {ship.manufacturer_code ?? ship.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            {/* Gradient fondu vers la droite */}
            <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-[#0A1628] pointer-events-none" />
          </div>

          {/* Contenu */}
          <div className="flex-1 min-w-0 flex flex-col justify-between p-3 pl-2">
            {/* Haut : fabricant + nom + badge variante */}
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-1">
                <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider truncate">
                  {ship.manufacturer_code}
                </p>
                {ship.variant_type && ship.variant_type !== 'standard' && (
                  <GlowBadge
                    color={
                      ship.variant_type === 'collector' ? 'amber' :
                      ship.variant_type === 'npc' ? 'red' :
                      ship.variant_type === 'pyam_exec' ? 'purple' : 'slate'
                    }
                  >
                    {VARIANT_TYPE_LABELS[ship.variant_type] ?? ship.variant_type}
                  </GlowBadge>
                )}
              </div>
              <h3 className="font-orbitron text-xs font-bold text-slate-200 truncate leading-tight mt-0.5">
                {ship.name}
              </h3>
            </div>

            {/* Milieu : stats */}
            <div className="flex gap-2">
              <StatCell icon={<Users size={9} />} label="Crew" value={ship.crew_size != null ? String(ship.crew_size) : '—'} />
              <StatCell icon={<Zap size={9} />} label="SCM" value={fSpeed(ship.scm_speed)} />
              <StatCell icon={<Maximize2 size={9} />} label="Long." value={fDimension(ship.cross_section_z)} />
            </div>

            {/* Bas : badge career/role + RSI status */}
            <div className="flex items-center justify-between gap-1">
              <div className="flex gap-1 min-w-0 flex-wrap">
                {ship.career && (
                  <GlowBadge color="cyan" size="xs">{ship.career}</GlowBadge>
                )}
                {ship.role && ship.role !== ship.career && (
                  <GlowBadge color="slate" size="xs">{ship.role}</GlowBadge>
                )}
              </div>
              <p className="text-xs font-mono-sc flex-shrink-0">
                {ship.ship_matrix_id != null
                  ? <span className="text-green-500">◆ RSI</span>
                  : <span className="text-slate-700">◇</span>
                }
              </p>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="sci-panel px-1.5 py-1 text-center flex-1">
      <div className="flex items-center justify-center gap-0.5 text-slate-600 mb-0.5">
        {icon}
        <span className="text-[9px] font-mono-sc uppercase">{label}</span>
      </div>
      <p className="text-[10px] font-mono-sc text-slate-300 leading-tight">{value}</p>
    </div>
  );
}
