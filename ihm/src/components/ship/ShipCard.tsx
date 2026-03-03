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
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider truncate">
                {ship.manufacturer_code}
              </p>
              <h3 className="font-orbitron text-sm font-bold text-slate-200 truncate mt-0.5 leading-tight">
                {ship.name}
              </h3>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
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
          </div>

          {/* Role/Career */}
          <div className="flex flex-wrap gap-1 mb-3">
            {ship.career && (
              <GlowBadge color="cyan" size="xs">{ship.career}</GlowBadge>
            )}
            {ship.role && ship.role !== ship.career && (
              <GlowBadge color="slate" size="xs">{ship.role}</GlowBadge>
            )}
            {ship.size && (
              <GlowBadge color="slate" size="xs">S{ship.size}</GlowBadge>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatCell
              icon={<Users size={10} />}
              label="Crew"
              value={
                ship.crew_min != null && ship.crew_max != null
                  ? ship.crew_min === ship.crew_max
                    ? String(ship.crew_min)
                    : `${ship.crew_min}–${ship.crew_max}`
                  : '—'
              }
            />
            <StatCell
              icon={<Zap size={10} />}
              label="SCM"
              value={fSpeed(ship.scm_speed)}
            />
            <StatCell
              icon={<Maximize2 size={10} />}
              label="Long."
              value={fDimension(ship.length)}
            />
          </div>

          {/* Bottom border glow */}
          <div className="mt-3 pt-2 border-t border-border/50">
            <p className="text-xs text-slate-600 font-mono-sc truncate">
              {ship.has_sm_link ? (
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
