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
        <div className="holo-card h-full">
          {/* Thumbnail */}
          <div className="relative w-full aspect-video mb-3 rounded overflow-hidden bg-slate-900/80 border border-border/40">
            {ship.thumbnail ? (
              <img
                src={ship.thumbnail}
                alt={ship.name}
                className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="font-orbitron text-2xl font-black text-slate-700 select-none">
                  {ship.manufacturer_code ?? ship.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            {/* Variant badge overlay */}
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
          </div>

          {/* Header */}
          <div className="mb-2">
            <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider truncate">
              {ship.manufacturer_code}
            </p>
            <h3 className="font-orbitron text-sm font-bold text-slate-200 truncate mt-0.5 leading-tight">
              {ship.name}
            </h3>
          </div>

          {/* Role/Career */}
          <div className="flex flex-wrap gap-1 mb-3">
            {ship.career && (
              <GlowBadge color="cyan" size="xs">{ship.career}</GlowBadge>
            )}
            {ship.role && ship.role !== ship.career && (
              <GlowBadge color="slate" size="xs">{ship.role}</GlowBadge>
            )}
            {ship.vehicle_category && (
              <GlowBadge color="slate" size="xs">{ship.vehicle_category}</GlowBadge>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatCell
              icon={<Users size={10} />}
              label="Crew"
              value={ship.crew_size != null ? String(ship.crew_size) : '—'}
            />
            <StatCell
              icon={<Zap size={10} />}
              label="SCM"
              value={fSpeed(ship.scm_speed)}
            />
            <StatCell
              icon={<Maximize2 size={10} />}
              label="Long."
              value={fDimension(ship.cross_section_z)}
            />
          </div>

          {/* Bottom border glow */}
          <div className="mt-3 pt-2 border-t border-border/50">
            <p className="text-xs text-slate-600 font-mono-sc truncate">
              {ship.ship_matrix_id != null ? (
                <span className="text-cyan-800">◆ RSI linked</span>
              ) : (
                <span className="text-slate-700">◇ Source: game data</span>
              )}
            </p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="sci-panel p-1.5 text-center">
      <div className="flex items-center justify-center gap-1 text-slate-600 mb-0.5">
        {icon}
        <span className="text-xs font-mono-sc uppercase">{label}</span>
      </div>
      <p className="text-xs font-mono-sc text-slate-300">{value}</p>
    </div>
  );
}
