import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart3, BookOpen, Package, Rocket, Settings2, Shield, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import { ScifiPanel } from '@/components/ui/ScifiPanel';
import { LoadingGrid } from '@/components/ui/LoadingGrid';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { fDateTime } from '@/utils/formatters';

const STAT_CARDS = [
  { key: 'ships',         label: 'Ships',         icon: Rocket,    color: 'text-cyan-400',   to: '/ships' },
  { key: 'components',    label: 'Components',    icon: Settings2, color: 'text-blue-400',   to: '/components' },
  { key: 'items',         label: 'Items',         icon: Shield,    color: 'text-green-400',  to: '/items' },
  { key: 'manufacturers', label: 'Manufacturers', icon: Zap,       color: 'text-amber-400',  to: '/manufacturers' },
  { key: 'commodities',   label: 'Commodities',   icon: Package,   color: 'text-purple-400', to: '/commodities' },
  { key: 'paints',        label: 'Paints',        icon: BarChart3, color: 'text-pink-400',   to: '/ships' },
] as const;

export default function HomePage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats.overview'],
    queryFn: api.stats.overview,
  });
  const { data: version } = useQuery({
    queryKey: ['version'],
    queryFn: api.stats.version,
  });
  const { data: changelog } = useQuery({
    queryKey: ['changelog.list', { limit: 8 }],
    queryFn: () => api.changelog.list({ limit: 8 }),
  });
  const { data: changelogSummary } = useQuery({
    queryKey: ['changelog.summary'],
    queryFn: api.changelog.summary,
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="sci-panel p-6 border-cyan-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-orbitron text-2xl font-black text-cyan-400 glow-text tracking-widest">
              STARVIS
            </h1>
            <p className="text-slate-500 text-sm mt-1 font-rajdhani">
              Star Citizen database — ships, components, items
            </p>
          </div>
          {version && (
            <div className="sci-panel p-3 text-right flex-shrink-0">
              <p className="text-xs font-mono-sc text-slate-600 uppercase">Game version</p>
              <p className="font-orbitron text-cyan-400 text-sm mt-0.5">{version.game_version}</p>
              <p className="text-xs text-slate-600 mt-0.5">{fDateTime(version.extracted_at)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      {statsLoading ? (
        <LoadingGrid rows={1} cols={6} message="LOADING STATS…" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAT_CARDS.map(({ key, label, icon: Icon, color, to }, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <Link to={to} className="block">
                <div className="holo-card text-center py-4">
                  <Icon size={20} className={`${color} mx-auto mb-2`} />
                  <p className="font-orbitron text-xl font-bold text-slate-200">
                    {stats ? (stats[key as keyof typeof stats] ?? 0).toLocaleString('en-US') : '—'}
                  </p>
                  <p className="text-xs font-rajdhani text-slate-500 uppercase tracking-wide mt-0.5">
                    {label}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick links */}
        <ScifiPanel title="Quick nav" className="lg:col-span-1">
          <div className="space-y-1.5">
            {STAT_CARDS.map(({ to, icon: Icon, label, color }) => (
              <Link
                key={label}
                to={to}
                className="flex items-center gap-3 px-3 py-2.5 rounded border border-transparent hover:border-border hover:bg-white/5 transition-all group"
              >
                <Icon size={14} className={color} />
                <span className="font-rajdhani font-semibold text-sm text-slate-400 group-hover:text-slate-200 uppercase tracking-wide transition-colors">
                  {label}
                </span>
              </Link>
            ))}
            <Link
              to="/compare"
              className="flex items-center gap-3 px-3 py-2.5 rounded border border-transparent hover:border-border hover:bg-white/5 transition-all group"
            >
              <BarChart3 size={14} className="text-amber-400" />
              <span className="font-rajdhani font-semibold text-sm text-slate-400 group-hover:text-slate-200 uppercase tracking-wide transition-colors">
                Compare
              </span>
            </Link>
          </div>
        </ScifiPanel>

        {/* Changelog */}
        <ScifiPanel
          title="Latest changes"
          subtitle={changelogSummary ? `${changelogSummary.total} entries total` : undefined}
          className="lg:col-span-2"
          actions={
            <Link to="/changelog" className="sci-btn-ghost py-1 px-2 text-xs">
              <BookOpen size={11} /> View all
            </Link>
          }
        >
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {changelog?.data.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 transition-colors">
                <GlowBadge
                  color={
                    entry.change_type === 'added' ? 'green' :
                    entry.change_type === 'removed' ? 'red' : 'amber'
                  }
                  size="xs"
                >
                  {entry.change_type}
                </GlowBadge>
                <span className="flex-1 text-sm text-slate-400 truncate">{entry.entity_name}</span>
                <span className="text-xs font-mono-sc text-slate-600 flex-shrink-0">
                  {entry.entity_type}
                </span>
                <span className="text-xs font-mono-sc text-slate-700 flex-shrink-0 hidden md:block">
                  {fDateTime(entry.created_at)}
                </span>
              </div>
            ))}
            {!changelog && <LoadingGrid rows={2} cols={4} message="" />}
          </div>
        </ScifiPanel>
      </div>
    </div>
  );
}
