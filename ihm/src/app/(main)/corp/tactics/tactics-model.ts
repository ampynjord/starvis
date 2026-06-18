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
  team?: string | null;
  gridX: number;
  gridZ: number;
  rotationY?: number;
  elevation?: number;
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

// ── Teams / camps ────────────────────────────────────────────────────────────
// A ship can be assigned to a colored team (camp) independently from its
// squadron (group). The selection ring and movement vector take the team color.
export interface TeamStyle {
  key: string;
  label: string;
  color: number; // THREE hex
  css: string; // CSS color for the UI swatch
}

export const TEAMS: TeamStyle[] = [
  { key: 'blue', label: 'Blue', color: 0x2f9bff, css: '#2f9bff' },
  { key: 'red', label: 'Red', color: 0xff4d4d, css: '#ff4d4d' },
  { key: 'green', label: 'Green', color: 0x3ddc84, css: '#3ddc84' },
  { key: 'yellow', label: 'Yellow', color: 0xfacc15, css: '#facc15' },
  { key: 'purple', label: 'Purple', color: 0xb46bff, css: '#b46bff' },
  { key: 'orange', label: 'Orange', color: 0xff9d3d, css: '#ff9d3d' },
];

export const teamStyle = (key: string | null | undefined): TeamStyle | null =>
  key ? (TEAMS.find((team) => team.key === key) ?? null) : null;

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
