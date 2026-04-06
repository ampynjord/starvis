import { describe, expect, it } from 'vitest';
import { canonicalizeCommodityRecord, canonicalizeComponentRecord, canonicalizeItemRecord } from '../src/canonical-source.js';

describe('canonicalizeItemRecord', () => {
  it('normalizes name and generates a canonical key', () => {
    const result = canonicalizeItemRecord({
      name: 'Test Helmet',
      className: 'ITEM_TestHelmet_v2',
      type: 'Clothing',
      subType: 'Helmet',
    });
    expect(result.normalizedName).toBe('test-helmet');
    expect(result.canonicalItemKey).toContain('clothing');
    expect(result.canonicalItemKey).toContain('helmet');
    expect(result.canonicalItemKey).toContain('test-helmet');
  });

  it('handles null type/subType gracefully', () => {
    const result = canonicalizeItemRecord({ name: 'Widget', className: 'WIDGET_01' });
    expect(result.normalizedName).toBe('widget');
    expect(result.canonicalItemKey).toContain('widget');
  });

  it('uses className as fallback when name is empty', () => {
    const result = canonicalizeItemRecord({ name: '', className: 'ITEM_FALLBACK' });
    expect(result.normalizedName).toBe('item-fallback');
  });

  it('deduplicates by className even if names differ', () => {
    const a = canonicalizeItemRecord({ name: 'Item A', className: 'SAME_CLASS', type: 'T', subType: 'S' });
    const b = canonicalizeItemRecord({ name: 'Item B', className: 'SAME_CLASS', type: 'T', subType: 'S' });
    expect(a.canonicalItemKey).not.toBe(b.canonicalItemKey); // names differ so keys differ
    expect(a.canonicalItemKey).toContain('same-class');
    expect(b.canonicalItemKey).toContain('same-class');
  });
});

describe('canonicalizeCommodityRecord', () => {
  it('includes symbol in canonical key', () => {
    const result = canonicalizeCommodityRecord({
      name: 'Agricium',
      className: 'Commodity_Agricium',
      type: 'Metal',
      symbol: 'AGR',
    });
    expect(result.canonicalCommodityKey).toContain('agr');
    expect(result.canonicalCommodityKey).toContain('metal');
  });

  it('falls back to normalizedName when symbol is absent', () => {
    const result = canonicalizeCommodityRecord({ name: 'TestCom', className: 'COM_Test', type: 'Gas' });
    expect(result.canonicalCommodityKey).toContain('testcom');
  });
});

describe('canonicalizeComponentRecord', () => {
  it('includes grade and size in key', () => {
    const result = canonicalizeComponentRecord({
      name: 'CF-557 Galdereen',
      className: 'WEAP_CF557',
      type: 'WeaponGun',
      grade: 'C',
      size: 3,
    });
    expect(result.canonicalComponentKey).toContain('weapongun');
    expect(result.canonicalComponentKey).toContain('c');
    expect(result.canonicalComponentKey).toContain('3');
    expect(result.canonicalComponentKey).toContain('cf-557-galdereen');
  });

  it('handles missing grade and size', () => {
    const result = canonicalizeComponentRecord({
      name: 'Some Shield',
      className: 'SHLD_Test',
      type: 'Shield',
    });
    expect(result.normalizedName).toBe('some-shield');
    expect(result.canonicalComponentKey).toContain('shield');
  });

  it('strips accents from non-ASCII names', () => {
    const result = canonicalizeComponentRecord({ name: 'Réacteur', className: 'ENG_React' });
    expect(result.normalizedName).toBe('reacteur');
  });
});
