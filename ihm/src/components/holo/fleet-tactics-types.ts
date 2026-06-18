export interface FleetShip {
  id: number;
  shipUuid: string;
  name: string;
  className: string;
  manufacturerCode?: string | null;
  role?: string | null;
  career?: string | null;
  sizeX?: number | null;
  sizeY?: number | null;
  sizeZ?: number | null;
  crewSize?: number | null;
  scmSpeed?: number | null;
  isConceptOnly?: boolean;
  thumbnailUrl?: string | null;
  ctmUrl: string | null;
  declaredBy?: string | null;
  group?: string | null;
  team?: string | null;
  gridX?: number | null;
  gridZ?: number | null;
  rotationY?: number | null;
  elevation?: number | null;
}

export interface TacticalMarker {
  id: string;
  type: 'objective' | 'poi' | 'obstacle';
  label: string;
  gridX: number;
  gridZ: number;
  rotation?: number;
}

export interface TacticalVector {
  id: string;
  sourceType: 'ship' | 'group';
  sourceId: number | string;
  endX: number;
  endZ: number;
  controlX: number;
  controlZ: number;
}
