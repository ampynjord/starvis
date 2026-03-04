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
        {/* Rectangle horizontal : hauteur fixe, plus large que haute */}
        <div className="holo-card h-56 flex flex-col overflow-hidden">
          {/* Thumbnail — haut, hauteur fixe */}
          <div className="relative h-28 flex-shrink-0 bg-slate-900/80">
            {ship.thumbnail ? (
              <img
                src={ship.thumbnail}
                alt={ship.name}
                className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="font-orbitron text-xl font-black text-slate-700 select-none">
                  {ship.manufacturer_code ?? ship.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            {/* Badge variante overlay */}
            {ship.variant_type && ship.variant_type !== 'standard' && (
              <div className="absolute top-1.5 right-1.5">
                <GlowBadge
                  color={
                    ship.variant_type === 'collector' ? 'amber' :
                    ship.variant_type === 'npc' ? 'red' :
                    ship.variant_type === 'pyam_exec' ? 'purple' : 'slate'
                  }
                >
                  {VARIANT_TYPE_LABELS[ship.variant_type] ?? ship.variant_type}
                </GlowBadge>
              </div>
            )}
            {/* Gradient fondu vers le bas */}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0A1628] to-transparent pointer-events-none" />
          </div>

          {/* Infos — bas */}
          <div className="flex-1 flex flex-col justify-between px-4 py-3 min-h-0">
            {/* Fabricant + nom */}
            <div className="min-w-0">
              <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider truncate leading-none">
                {ship.manufacturer_code}
              </p>
              <h3 className="font-orbitron text-sm font-bold text-slate-200 truncate leading-tight mt-1">
                {ship.name}
              </h3>
            </div>

            {/* Stats */}
            <div className="flex gap-2">
              <StatCell icon={<Users size={9} />} label="Crew" value={ship.crew_size != null ? String(ship.crew_size) : '—'} />
              <StatCell icon={<Zap size={9} />} label="SCM" value={fSpeed(ship.scm_speed)} />
              <StatCell icon={<Maximize2 size={9} />} label="Long." value={fDimension(ship.cross_section_z)} />
            </div>

            {/* Career + RSI badge */}
            <div className="flex items-center justify-between gap-1">
              <div className="flex gap-1 min-w-0 overflow-hidden">
                {ship.career && (
                  <GlowBadge color="cyan" size="xs">{ship.career}</GlowBadge>
                )}
                {ship.role && ship.role !== ship.career && (
                  <GlowBadge color="slate" size="xs">{ship.role}</GlowBadge>
                )}
              </div>
              <span className="text-xs font-mono-sc flex-shrink-0">
                {ship.ship_matrix_id != null
                  ? <span className="text-green-500">◆ RSI</span>
                  : <span className="text-slate-700">◇</span>
                }
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="sci-panel px-2 py-1.5 text-center flex-1">
      <div className="flex items-center justify-center gap-1 text-slate-600 mb-1">
        {icon}
        <span className="text-[9px] font-mono-sc uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xs font-mono-sc text-slate-300">{value}</p>
    </div>
  );
}
