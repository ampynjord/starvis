import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('FleetHoloViewer source ordering', () => {
  it('declares vector geometry helpers before vector entries are created', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/ship/FleetHoloViewer.tsx'), 'utf8');

    const ribbonHelper = source.indexOf('const makeFlatVectorRibbon');
    const arrowHelper = source.indexOf('const makeFlatArrowHead');
    const vectorEntry = source.indexOf('const makeVectorEntry');

    expect(ribbonHelper).toBeGreaterThan(-1);
    expect(arrowHelper).toBeGreaterThan(-1);
    expect(vectorEntry).toBeGreaterThan(-1);
    expect(ribbonHelper).toBeLessThan(vectorEntry);
    expect(arrowHelper).toBeLessThan(vectorEntry);
  });
});
