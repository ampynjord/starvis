import type { TacticalMarker, TacticalVector } from '@/components/holo/fleet-tactics-types';
import type { FormationType } from '@/lib/tacticsFormations';
import type { ShipListItem } from '@/types/api';

export interface FleetItem {
  id: number;
  shipUuid: string | null;
  itemClassName: string;
  availableForTactics: boolean;
  addedBy: { id: number; username: string } | null;
}

export interface Corp {
  id: number;
  name: string;
  tag: string;
}

export interface TacticalShip {
  id: number;
  fleetItemId: number;
  shipUuid: string;
  label: string;
  owner: string | null;
  group: string;
  gridX: number;
  gridZ: number;
}

export interface Strategy {
  id: string;
  name: string;
  ships: TacticalShip[];
  markers: TacticalMarker[];
  vectors: TacticalVector[];
  updatedAt: string;
}

export interface FormationPreset {
  id: string;
  name: string;
  type: FormationType;
  composition?: Record<string, number>;
  quantity?: number;
  spacing: number;
}

export const PRESETS_STORAGE_KEY = 'starvis-formation-presets';

export const getShipUuid = (item: FleetItem) => item.shipUuid?.trim() || null;
export const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
export const nowIso = () => new Date().toISOString();

export const defaultStrategy = (): Strategy => ({
  id: makeId(),
  name: 'New strategy',
  ships: [],
  markers: [],
  vectors: [],
  updatedAt: nowIso(),
});

export const presetShipCount = (preset: FormationPreset) =>
  Object.values(preset.composition ?? {}).reduce((sum, qty) => sum + qty, 0) || preset.quantity || 0;

export function estimateFormationGap(ship: ShipListItem | undefined, fallbackSpacing: number) {
  const size = Math.max(
    Number((ship as { size_x?: number | null })?.size_x ?? 0),
    Number((ship as { size_z?: number | null })?.size_z ?? 0),
    Number((ship as { size_y?: number | null })?.size_y ?? 0),
    Number(ship?.cross_section_x ?? 0),
    Number(ship?.cross_section_z ?? 0),
    Number(ship?.cross_section_y ?? 0),
    24,
  );
  return Math.max(fallbackSpacing, size * 3.6, 78);
}

export function boundsOfPositions(positions: Array<{ gridX: number; gridZ: number }>, padding: number) {
  if (!positions.length) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return {
    minX: Math.min(...positions.map((pos) => pos.gridX)) - padding,
    maxX: Math.max(...positions.map((pos) => pos.gridX)) + padding,
    minZ: Math.min(...positions.map((pos) => pos.gridZ)) - padding,
    maxZ: Math.max(...positions.map((pos) => pos.gridZ)) + padding,
  };
}
