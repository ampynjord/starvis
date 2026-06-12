export type FormationType = 'line' | 'wedge' | 'box' | 'v' | 'echelon' | 'diamond' | 'circle';

export const FORMATION_LABELS: Record<FormationType, string> = {
  line: 'Line',
  wedge: 'Wedge',
  box: 'Box',
  v: 'V-shape',
  echelon: 'Echelon',
  diamond: 'Diamond',
  circle: 'Circle',
};

export interface FormationPoint {
  gridX: number;
  gridZ: number;
}

function center(points: FormationPoint[]) {
  if (points.length === 0) return points;
  const minX = Math.min(...points.map((point) => point.gridX));
  const maxX = Math.max(...points.map((point) => point.gridX));
  const minZ = Math.min(...points.map((point) => point.gridZ));
  const maxZ = Math.max(...points.map((point) => point.gridZ));
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return points.map((point) => ({ gridX: point.gridX - centerX, gridZ: point.gridZ - centerZ }));
}

function buildWedge(total: number, gap: number) {
  const points: FormationPoint[] = [];
  let row = 0;
  while (points.length < total) {
    const rowWidth = row + 1;
    for (let col = 0; col < rowWidth && points.length < total; col += 1) {
      points.push({
        gridX: (col - (rowWidth - 1) / 2) * gap,
        gridZ: row * gap * 1.05,
      });
    }
    row += 1;
  }
  return center(points);
}

function buildV(total: number, gap: number) {
  if (total <= 1) return [{ gridX: 0, gridZ: 0 }];
  const points: FormationPoint[] = [{ gridX: 0, gridZ: -gap * 0.9 }];
  let rank = 1;
  while (points.length < total) {
    if (total - points.length === 1) {
      points.push({ gridX: 0, gridZ: rank * gap * 0.95 });
      break;
    }
    points.push({ gridX: -rank * gap * 0.9, gridZ: rank * gap * 0.78 });
    if (points.length < total) points.push({ gridX: rank * gap * 0.9, gridZ: rank * gap * 0.78 });
    rank += 1;
  }
  return center(points);
}

function buildDiamond(total: number, gap: number) {
  if (total <= 1) return [{ gridX: 0, gridZ: 0 }];
  const points: FormationPoint[] = [
    { gridX: 0, gridZ: -gap },
    { gridX: gap, gridZ: 0 },
    { gridX: 0, gridZ: gap },
    { gridX: -gap, gridZ: 0 },
  ].slice(0, total);
  let ring = 2;
  while (points.length < total) {
    const ringPoints = [
      { gridX: 0, gridZ: -ring * gap },
      { gridX: ring * gap, gridZ: 0 },
      { gridX: 0, gridZ: ring * gap },
      { gridX: -ring * gap, gridZ: 0 },
    ];
    for (const point of ringPoints) {
      if (points.length >= total) break;
      points.push(point);
    }
    ring += 1;
  }
  return center(points);
}

function buildCircle(total: number, gap: number) {
  if (total <= 1) return [{ gridX: 0, gridZ: 0 }];
  const radius = Math.max(gap, (total * gap) / (2 * Math.PI));
  return Array.from({ length: total }, (_, index) => {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    return { gridX: Math.cos(angle) * radius, gridZ: Math.sin(angle) * radius };
  });
}

export function formationPositions(total: number, spacing: number, formation: FormationType): FormationPoint[] {
  const count = Math.max(0, Math.floor(total));
  const gap = Math.max(spacing, 22);
  if (count === 0) return [];

  if (formation === 'line') {
    return Array.from({ length: count }, (_, index) => ({ gridX: (index - (count - 1) / 2) * gap, gridZ: 0 }));
  }
  if (formation === 'box') {
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    return Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      return {
        gridX: (col - (cols - 1) / 2) * gap,
        gridZ: (row - (rows - 1) / 2) * gap,
      };
    });
  }
  if (formation === 'v') return buildV(count, gap);
  if (formation === 'echelon') {
    return center(
      Array.from({ length: count }, (_, index) => ({
        gridX: index * gap,
        gridZ: index * gap * 0.65,
      })),
    );
  }
  if (formation === 'diamond') return buildDiamond(count, gap);
  if (formation === 'circle') return buildCircle(count, gap);
  return buildWedge(count, gap);
}

export function formationPosition(index: number, total: number, spacing: number, formation: FormationType, offsetX = 0, offsetZ = 0) {
  const point = formationPositions(total, spacing, formation)[index] ?? { gridX: 0, gridZ: 0 };
  return { gridX: point.gridX + offsetX, gridZ: point.gridZ + offsetZ };
}
