import { describe, expect, it } from 'vitest';
import { fCredits, fDate, fDateTime, fDimension, fDistance, fMass, fNumber, fSize, fSpeed, fTime } from '@/utils/formatters';

// en-US locale: thousands separator is ',' and decimal separator is '.'

describe('fNumber', () => {
  it('returns — for null', () => {
    expect(fNumber(null)).toBe('—');
  });
  it('returns — for undefined', () => {
    expect(fNumber(undefined)).toBe('—');
  });
  it('formats an integer', () => {
    expect(fNumber(0)).toBe('0');
    expect(fNumber(42)).toBe('42');
  });
  it('formats with en-US thousands separator', () => {
    expect(fNumber(1000)).toBe('1,000');
    expect(fNumber(1_000_000)).toBe('1,000,000');
  });
  it('respects decimals parameter', () => {
    expect(fNumber(Math.PI, 2)).toBe('3.14');
    expect(fNumber(1234.5678, 0)).toBe('1,235');
  });
});

describe('fMass', () => {
  it('returns — for null/undefined', () => {
    expect(fMass(null)).toBe('—');
    expect(fMass(undefined)).toBe('—');
  });
  it('formats in kg if < 1,000', () => {
    expect(fMass(500)).toContain('kg');
    expect(fMass(999)).toContain('kg');
  });
  it('formats in t if >= 1,000', () => {
    expect(fMass(1000)).toContain('t');
    expect(fMass(5000)).toContain('t');
  });
  it('formats in kt if >= 1,000,000', () => {
    expect(fMass(1_000_000)).toContain('kt');
    expect(fMass(2_500_000)).toContain('kt');
  });
});

describe('fSpeed', () => {
  it('returns — for null/undefined', () => {
    expect(fSpeed(null)).toBe('—');
    expect(fSpeed(undefined)).toBe('—');
  });
  it('formats in m/s', () => {
    expect(fSpeed(0)).toBe('0 m/s');
    expect(fSpeed(150)).toBe('150 m/s');
    expect(fSpeed(1200)).toContain('m/s');
  });
});

describe('fDistance', () => {
  it('returns — for null/undefined', () => {
    expect(fDistance(null)).toBe('—');
    expect(fDistance(undefined)).toBe('—');
  });
  it('formats in m if < 1,000', () => {
    expect(fDistance(500)).toBe('500 m');
  });
  it('formats in km if >= 1,000', () => {
    expect(fDistance(1000)).toContain('km');
    expect(fDistance(50000)).toContain('km');
  });
  it('formats in Gm if >= 1,000,000', () => {
    expect(fDistance(1_000_000)).toContain('Gm');
    expect(fDistance(2_500_000)).toContain('Gm');
  });
});

describe('fCredits', () => {
  it('returns — for null/undefined', () => {
    expect(fCredits(null)).toBe('—');
    expect(fCredits(undefined)).toBe('—');
  });
  it('formats in aUEC if < 1,000', () => {
    expect(fCredits(500)).toContain('aUEC');
    expect(fCredits(500)).not.toContain('k');
    expect(fCredits(500)).not.toContain('M');
  });
  it('formats in k aUEC if >= 1,000', () => {
    expect(fCredits(1000)).toContain('k aUEC');
    expect(fCredits(25000)).toContain('k aUEC');
  });
  it('formats in M aUEC if >= 1,000,000', () => {
    expect(fCredits(1_000_000)).toContain('M aUEC');
    expect(fCredits(2_500_000)).toContain('M aUEC');
  });
});

describe('fDate', () => {
  it('returns — for null/undefined/empty', () => {
    expect(fDate(null)).toBe('—');
    expect(fDate(undefined)).toBe('—');
    expect(fDate('')).toBe('—');
  });
  it('formats a valid ISO date', () => {
    const result = fDate('2024-01-15T00:00:00Z');
    expect(result).not.toBe('—');
    expect(result).toContain('2024');
  });
});

describe('fDateTime', () => {
  it('returns — for null/undefined/empty', () => {
    expect(fDateTime(null)).toBe('—');
    expect(fDateTime(undefined)).toBe('—');
    expect(fDateTime('')).toBe('—');
  });
  it('formats a valid ISO datetime', () => {
    const result = fDateTime('2024-06-15T10:30:00Z');
    expect(result).not.toBe('—');
    expect(result).toContain('2024');
  });
});

describe('fSize', () => {
  it('returns — for null/undefined', () => {
    expect(fSize(null)).toBe('—');
    expect(fSize(undefined)).toBe('—');
  });
  it('prefixes with S', () => {
    expect(fSize(1)).toBe('S1');
    expect(fSize(3)).toBe('S3');
    expect(fSize(10)).toBe('S10');
  });
});

describe('fTime', () => {
  it('returns — for null/undefined', () => {
    expect(fTime(null)).toBe('—');
    expect(fTime(undefined)).toBe('—');
  });
  it('formats in seconds if < 60', () => {
    expect(fTime(0)).toBe('0s');
    expect(fTime(45)).toBe('45s');
    expect(fTime(59)).toBe('59s');
  });
  it('formats in minutes if >= 60', () => {
    expect(fTime(60)).toBe('1.0min');
    expect(fTime(90)).toBe('1.5min');
    expect(fTime(120)).toBe('2.0min');
  });
});

describe('fDimension', () => {
  it('returns — for null/undefined', () => {
    expect(fDimension(null)).toBe('—');
    expect(fDimension(undefined)).toBe('—');
  });
  it('formats in meters with 1 decimal (en-US)', () => {
    expect(fDimension(10)).toBe('10 m');
    expect(fDimension(25.55)).toContain('m');
    expect(fDimension(1.5)).toBe('1.5 m');
  });
});
