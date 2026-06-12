import { describe, expect, it } from 'vitest';
import { type FormationType, formationPositions } from '@/lib/tacticsFormations';

const roundedShape = (formation: FormationType, total = 4) =>
  formationPositions(total, 50, formation).map((point) => [Math.round(point.gridX), Math.round(point.gridZ)]);

describe('tactics formations', () => {
  it('builds distinct silhouettes for wedge, v and diamond formations', () => {
    const wedge = roundedShape('wedge');
    const v = roundedShape('v');
    const diamond = roundedShape('diamond');

    expect(v).not.toEqual(wedge);
    expect(diamond).not.toEqual(wedge);
    expect(diamond).not.toEqual(v);
  });

  it('places a V formation with a lead ship and symmetric wings', () => {
    expect(roundedShape('v')).toEqual([
      [0, -70],
      [-45, 14],
      [45, 14],
      [0, 70],
    ]);
  });

  it('places a diamond formation on four cardinal points', () => {
    expect(roundedShape('diamond')).toEqual([
      [0, -50],
      [50, 0],
      [0, 50],
      [-50, 0],
    ]);
  });
});
