import { describe, it, expect } from 'vitest';
import {
  fNumber,
  fMass,
  fSpeed,
  fDistance,
  fCredits,
  fDate,
  fDateTime,
  fSize,
  fTime,
  fDimension,
} from '@/utils/formatters';

// Note : les tests de formatage utilisent la locale fr-FR du processus Node.
// L'espace utilisé par fr-FR peut être une espace fine insécable (U+202F) ou une espace normale.
// On utilise .replace(/\s/g, ' ') pour normaliser dans les comparaisons.
const norm = (s: string) => s.replace(/\u202f/g, ' ').replace(/\u00a0/g, ' ');

describe('fNumber', () => {
  it('retourne — si null', () => {
    expect(fNumber(null)).toBe('—');
  });
  it('retourne — si undefined', () => {
    expect(fNumber(undefined)).toBe('—');
  });
  it('formate un entier', () => {
    expect(fNumber(0)).toBe('0');
    expect(fNumber(42)).toBe('42');
  });
  it('formate avec séparateur de milliers fr-FR', () => {
    // 1000 → "1 000" en fr-FR
    expect(norm(fNumber(1000))).toBe('1 000');
    expect(norm(fNumber(1_000_000))).toBe('1 000 000');
  });
  it('respecte le paramètre decimals', () => {
    expect(norm(fNumber(3.14159, 2))).toBe('3,14');
    expect(norm(fNumber(1234.5678, 0))).toBe('1 235');
  });
});

describe('fMass', () => {
  it('retourne — si null/undefined', () => {
    expect(fMass(null)).toBe('—');
    expect(fMass(undefined)).toBe('—');
  });
  it('formate en kg si < 1 000', () => {
    expect(norm(fMass(500))).toContain('kg');
    expect(norm(fMass(999))).toContain('kg');
  });
  it('formate en t si >= 1 000', () => {
    expect(fMass(1000)).toContain('t');
    expect(fMass(5000)).toContain('t');
  });
  it('formate en kt si >= 1 000 000', () => {
    expect(fMass(1_000_000)).toContain('kt');
    expect(fMass(2_500_000)).toContain('kt');
  });
});

describe('fSpeed', () => {
  it('retourne — si null/undefined', () => {
    expect(fSpeed(null)).toBe('—');
    expect(fSpeed(undefined)).toBe('—');
  });
  it('formate en m/s', () => {
    expect(fSpeed(0)).toBe('0 m/s');
    expect(norm(fSpeed(150))).toBe('150 m/s');
    expect(norm(fSpeed(1200))).toContain('m/s');
  });
});

describe('fDistance', () => {
  it('retourne — si null/undefined', () => {
    expect(fDistance(null)).toBe('—');
    expect(fDistance(undefined)).toBe('—');
  });
  it('formate en m si < 1 000', () => {
    expect(norm(fDistance(500))).toBe('500 m');
  });
  it('formate en km si >= 1 000', () => {
    expect(fDistance(1000)).toContain('km');
    expect(fDistance(50000)).toContain('km');
  });
  it('formate en Gm si >= 1 000 000', () => {
    expect(fDistance(1_000_000)).toContain('Gm');
    expect(fDistance(2_500_000)).toContain('Gm');
  });
});

describe('fCredits', () => {
  it('retourne — si null/undefined', () => {
    expect(fCredits(null)).toBe('—');
    expect(fCredits(undefined)).toBe('—');
  });
  it('formate en aUEC si < 1 000', () => {
    expect(fCredits(500)).toContain('aUEC');
    expect(fCredits(500)).not.toContain('k');
    expect(fCredits(500)).not.toContain('M');
  });
  it('formate en k aUEC si >= 1 000', () => {
    expect(fCredits(1000)).toContain('k aUEC');
    expect(fCredits(25000)).toContain('k aUEC');
  });
  it('formate en M aUEC si >= 1 000 000', () => {
    expect(fCredits(1_000_000)).toContain('M aUEC');
    expect(fCredits(2_500_000)).toContain('M aUEC');
  });
});

describe('fDate', () => {
  it('retourne — si null/undefined/vide', () => {
    expect(fDate(null)).toBe('—');
    expect(fDate(undefined)).toBe('—');
    expect(fDate('')).toBe('—');
  });
  it('formate une date ISO valide', () => {
    const result = fDate('2024-01-15T00:00:00Z');
    expect(result).not.toBe('—');
    expect(result).toContain('2024');
  });
});

describe('fDateTime', () => {
  it('retourne — si null/undefined/vide', () => {
    expect(fDateTime(null)).toBe('—');
    expect(fDateTime(undefined)).toBe('—');
    expect(fDateTime('')).toBe('—');
  });
  it('formate un datetime ISO valide', () => {
    const result = fDateTime('2024-06-15T10:30:00Z');
    expect(result).not.toBe('—');
    expect(result).toContain('2024');
  });
});

describe('fSize', () => {
  it('retourne — si null/undefined', () => {
    expect(fSize(null)).toBe('—');
    expect(fSize(undefined)).toBe('—');
  });
  it('préfixe avec S', () => {
    expect(fSize(1)).toBe('S1');
    expect(fSize(3)).toBe('S3');
    expect(fSize(10)).toBe('S10');
  });
});

describe('fTime', () => {
  it('retourne — si null/undefined', () => {
    expect(fTime(null)).toBe('—');
    expect(fTime(undefined)).toBe('—');
  });
  it('formate en secondes si < 60', () => {
    expect(fTime(0)).toBe('0s');
    expect(fTime(45)).toBe('45s');
    expect(fTime(59)).toBe('59s');
  });
  it('formate en minutes si >= 60', () => {
    expect(fTime(60)).toBe('1.0min');
    expect(fTime(90)).toBe('1.5min');
    expect(fTime(120)).toBe('2.0min');
  });
});

describe('fDimension', () => {
  it('retourne — si null/undefined', () => {
    expect(fDimension(null)).toBe('—');
    expect(fDimension(undefined)).toBe('—');
  });
  it('formate en mètres avec 1 décimale', () => {
    // maximumFractionDigits=1 → pas de zéro final sur un entier
    expect(norm(fDimension(10))).toBe('10 m');
    // décimale conservée pour les flottants
    expect(norm(fDimension(25.55))).toContain('m');
    expect(norm(fDimension(1.5))).toBe('1,5 m');
  });
});
