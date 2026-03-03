import { describe, it, expect } from 'vitest';
import {
  API_BASE,
  VARIANT_TYPE_LABELS,
  VARIANT_TYPE_COLORS,
  CAREER_ICONS,
  SIZE_LABELS,
  COMPONENT_TYPE_COLORS,
  CHANGE_TYPE_COLORS,
} from '@/utils/constants';

describe('API_BASE', () => {
  it('vaut /api/v1', () => {
    expect(API_BASE).toBe('/api/v1');
  });
});

describe('VARIANT_TYPE_LABELS', () => {
  it('contient les 4 types de variante', () => {
    expect(VARIANT_TYPE_LABELS.standard).toBe('Standard');
    expect(VARIANT_TYPE_LABELS.collector).toBe('Collector');
    expect(VARIANT_TYPE_LABELS.npc).toBe('NPC');
    expect(VARIANT_TYPE_LABELS.pyam_exec).toBe('PyAM / Exec');
  });
});

describe('VARIANT_TYPE_COLORS', () => {
  it('contient une entrée pour chaque type', () => {
    expect(VARIANT_TYPE_COLORS.standard).toBeDefined();
    expect(VARIANT_TYPE_COLORS.collector).toContain('amber');
    expect(VARIANT_TYPE_COLORS.npc).toContain('red');
    expect(VARIANT_TYPE_COLORS.pyam_exec).toContain('purple');
  });
});

describe('CAREER_ICONS', () => {
  it('contient des icones pour les carrières', () => {
    expect(CAREER_ICONS.Combat).toBe('⚔');
    expect(CAREER_ICONS.Transport).toBe('📦');
    expect(CAREER_ICONS.Exploration).toBe('🔭');
    expect(CAREER_ICONS.Racing).toBe('🏁');
  });
});

describe('SIZE_LABELS', () => {
  it('contient les tailles S1 à S9', () => {
    for (let i = 1; i <= 9; i++) {
      expect(SIZE_LABELS[i]).toBe(`S${i}`);
    }
  });
  it('label Capital pour taille 10', () => {
    expect(SIZE_LABELS[10]).toBe('Capital');
  });
});

describe('COMPONENT_TYPE_COLORS', () => {
  const expectedTypes = ['WeaponGun', 'WeaponMissile', 'Shield', 'QuantumDrive', 'PowerPlant', 'Cooler'];
  it.each(expectedTypes)('possède une couleur pour %s', (type) => {
    expect(COMPONENT_TYPE_COLORS[type]).toBeDefined();
    expect(typeof COMPONENT_TYPE_COLORS[type]).toBe('string');
  });
});

describe('CHANGE_TYPE_COLORS', () => {
  it('contient added, removed et modified', () => {
    expect(CHANGE_TYPE_COLORS.added).toBeDefined();
    expect(CHANGE_TYPE_COLORS.removed).toBeDefined();
    expect(CHANGE_TYPE_COLORS.modified).toBeDefined();
    expect(CHANGE_TYPE_COLORS.removed).toContain('red');
    expect(CHANGE_TYPE_COLORS.added).toContain('green');
  });
});
