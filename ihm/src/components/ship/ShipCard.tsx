import { motion } from 'framer-motion';
import { Users, Package, Zap, Gauge } from 'lucide-react';
import Link from 'next/link';
import type { ShipListItem } from '@/types/api';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { MarketSummary } from '@/components/economy/MarketSummary';
import { fSpeed } from '@/utils/formatters';
import { VARIANT_TYPE_LABELS } from '@/utils/constants';

interface Props {
  ship: ShipListItem;
  index?: number;
}

function crewLabel(ship: ShipListItem): string {
  if (ship.min_crew != null)
    return ship.max_crew != null && ship.max_crew !== ship.min_crew
      ? `${ship.min_crew}–${ship.max_crew}`
      : String(ship.min_crew);
  return ship.crew_size != null ? String(ship.crew_size) : '—';
}

export function ShipCard({ ship, index = 0 }: Props) {
  const isGround = ship.vehicle_category === 'ground' || ship.vehicle_category === 'gravlev';
  const isInConcept = ship.production_status === 'in-concept';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4) }}
    >
      <Link href={`/ships/${ship.uuid}`} className="block">
        <div className="holo-card flex flex-col overflow-hidden">
          {/* Thumbnail */}
          <div className="relative h-28 shrink-0 bg-slate-900/80">
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
            {(isInConcept || (ship.variant_type && ship.variant_type !== 'standard')) && (
              <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
                {isInConcept && <GlowBadge color="amber">In Concept</GlowBadge>}
                {ship.variant_type && ship.variant_type !== 'standard' && (
                  <GlowBadge
                    color={
                      ship.variant_type === 'collector'
                        ? 'amber'
                        : ship.variant_type === 'wikelo'
                          ? 'green'
                          : ship.variant_type === 'pyam_exec'
                            ? 'purple'
                            : 'slate'
                    }
                  >
                    {VARIANT_TYPE_LABELS[ship.variant_type] ?? ship.variant_type}
                  </GlowBadge>
                )}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-[#0A1628] to-transparent pointer-events-none" />
          </div>

          {/* Infos */}
          <div className="flex flex-col gap-3 px-4 py-4">
            {/* Manufacturer + name */}
            <div className="min-w-0">
              <p className="text-xs font-mono-sc text-cyan-700 uppercase tracking-wider truncate leading-none">
                {ship.manufacturer_code}
              </p>
              <h3 className="font-orbitron text-sm font-bold text-slate-200 truncate leading-tight mt-2">
                {ship.name}
              </h3>
            </div>

            {/* Stats — adapted by category */}
            <div className="flex gap-3">
              <StatCell icon={<Users size={9} />} label="Crew" value={crewLabel(ship)} />
              {isGround ? (
                <>
                  <StatCell
                    icon={<Gauge size={9} />}
                    label="Speed"
                    value={fSpeed(ship.max_speed ?? ship.scm_speed)}
                  />
                  <StatCell icon={<Package size={9} />} label="Cargo" value={ship.cargo_capacity ? `${ship.cargo_capacity} SCU` : '—'} />
                </>
              ) : (
                <>
                  <StatCell icon={<Zap size={9} />} label="SCM" value={fSpeed(ship.scm_speed)} />
                  <StatCell icon={<Package size={9} />} label="Cargo" value={ship.cargo_capacity ? `${ship.cargo_capacity} SCU` : '—'} />
                </>
              )}
            </div>

            <MarketSummary item={ship} />

            {/* Badges */}
            <div className="flex gap-2 min-w-0 overflow-hidden">
              {ship.career && (
                <GlowBadge color="cyan" size="xs">{ship.career}</GlowBadge>
              )}
              {ship.role && ship.role !== ship.career && (
                <GlowBadge color="slate" size="xs">{ship.role}</GlowBadge>
              )}
              {ship.vehicle_category && ship.vehicle_category !== 'ship' && (
                <GlowBadge color="slate" size="xs">{ship.vehicle_category}</GlowBadge>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="sci-panel px-3 py-2 text-center flex-1">
      <div className="flex items-center justify-center gap-1 text-slate-600 mb-1.5">
        {icon}
        <span className="text-[9px] font-mono-sc uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xs font-mono-sc text-slate-300">{value}</p>
    </div>
  );
}
