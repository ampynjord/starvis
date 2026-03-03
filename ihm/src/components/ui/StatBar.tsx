import { motion } from 'framer-motion';

interface Props {
  value: number;
  max?: number;
  color?: 'cyan' | 'amber' | 'green' | 'red';
  label?: string;
  displayValue?: string;
  animate?: boolean;
}

const COLOR_MAP = {
  cyan:  'from-cyan-500 to-cyan-700',
  amber: 'from-amber-400 to-amber-600',
  green: 'from-green-400 to-green-600',
  red:   'from-red-400 to-red-600',
};

const GLOW_MAP = {
  cyan:  '0 0 6px rgba(0,212,255,0.4)',
  amber: '0 0 6px rgba(255,184,0,0.4)',
  green: '0 0 6px rgba(0,255,136,0.4)',
  red:   '0 0 6px rgba(255,68,68,0.4)',
};

export function StatBar({ value, max = 100, color = 'cyan', label, displayValue, animate = true }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="space-y-1">
      {(label ?? displayValue) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="text-slate-500 font-rajdhani uppercase tracking-wide">{label}</span>}
          {displayValue && <span className="font-mono-sc text-slate-300">{displayValue}</span>}
        </div>
      )}
      <div className="stat-bar-track">
        <motion.div
          className={`stat-bar-fill bg-gradient-to-r ${COLOR_MAP[color]}`}
          style={{ boxShadow: GLOW_MAP[color] }}
          initial={animate ? { width: '0%' } : { width: `${pct}%` }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
