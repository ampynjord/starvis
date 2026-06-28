import { type ReactNode } from 'react';
import { GlowBadge } from './GlowBadge';
import { Shield, Zap, Flame, EyeOff, Rocket, Target, DollarSign, Activity } from 'lucide-react';

export type SmartTagId = 
  | 'fastest' | 'tank' | 'glass-cannon' | 'best-value' | 'meta'
  | 'high-alpha' | 'dps-monster' | 'stealth' | 'power-hungry' | 'overheats';

export interface SmartTagProps {
  id: SmartTagId;
  label: string;
  className?: string;
  size?: 'xs' | 'sm';
}

const TAG_CONFIG: Record<SmartTagId, { color: 'cyan' | 'amber' | 'green' | 'red' | 'purple' | 'slate'; icon: ReactNode }> = {
  'fastest': { color: 'cyan', icon: <Rocket className="w-3 h-3 mr-1 inline-block" /> },
  'tank': { color: 'slate', icon: <Shield className="w-3 h-3 mr-1 inline-block" /> },
  'glass-cannon': { color: 'red', icon: <Target className="w-3 h-3 mr-1 inline-block" /> },
  'best-value': { color: 'green', icon: <DollarSign className="w-3 h-3 mr-1 inline-block" /> },
  'meta': { color: 'purple', icon: <Activity className="w-3 h-3 mr-1 inline-block" /> },
  'high-alpha': { color: 'red', icon: <Target className="w-3 h-3 mr-1 inline-block" /> },
  'dps-monster': { color: 'amber', icon: <Flame className="w-3 h-3 mr-1 inline-block" /> },
  'stealth': { color: 'slate', icon: <EyeOff className="w-3 h-3 mr-1 inline-block" /> },
  'power-hungry': { color: 'amber', icon: <Zap className="w-3 h-3 mr-1 inline-block" /> },
  'overheats': { color: 'red', icon: <Flame className="w-3 h-3 mr-1 inline-block" /> },
};

export function SmartTag({ id, label, className = '', size = 'xs' }: SmartTagProps) {
  const config = TAG_CONFIG[id];
  if (!config) return null;

  return (
    <GlowBadge color={config.color} size={size} className={`inline-flex items-center ${className}`}>
      {config.icon}
      {label}
    </GlowBadge>
  );
}
