import { describe, expect, it } from 'vitest';
import { loadExternalCanonicalData } from '../src/source-adapters.js';

describe('source-adapters', () => {
  it('always returns empty maps because canonical overrides are disabled', async () => {
    const data = await loadExternalCanonicalData();
    expect(data.items.size).toBe(0);
    expect(data.commodities.size).toBe(0);
    expect(data.components.size).toBe(0);
    expect(data.shops.size).toBe(0);
  });
});
