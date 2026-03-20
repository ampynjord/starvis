import { describe, expect, it } from 'vitest';
import { API_BASE, COMPONENT_TYPE_COLORS, VARIANT_TYPE_COLORS, VARIANT_TYPE_LABELS } from '@/utils/constants';

describe('API_BASE', () => {
  it('equals /api/v1', () => {
    expect(API_BASE).toBe('/api/v1');
  });
});

describe('VARIANT_TYPE_LABELS', () => {
  it('contains the 4 variant types', () => {
    expect(VARIANT_TYPE_LABELS.standard).toBe('Standard');
    expect(VARIANT_TYPE_LABELS.collector).toBe('Collector');
    expect(VARIANT_TYPE_LABELS.npc).toBe('NPC');
    expect(VARIANT_TYPE_LABELS.pyam_exec).toBe('PyAM / Exec');
  });
});

describe('VARIANT_TYPE_COLORS', () => {
  it('contains an entry for each type', () => {
    expect(VARIANT_TYPE_COLORS.standard).toBeDefined();
    expect(VARIANT_TYPE_COLORS.collector).toContain('amber');
    expect(VARIANT_TYPE_COLORS.npc).toContain('red');
    expect(VARIANT_TYPE_COLORS.pyam_exec).toContain('purple');
  });
});

describe('COMPONENT_TYPE_COLORS', () => {
  const expectedTypes = ['WeaponGun', 'WeaponMissile', 'Shield', 'QuantumDrive', 'PowerPlant', 'Cooler'];
  it.each(expectedTypes)('has a color for %s', (type) => {
    expect(COMPONENT_TYPE_COLORS[type]).toBeDefined();
    expect(typeof COMPONENT_TYPE_COLORS[type]).toBe('string');
  });
});
