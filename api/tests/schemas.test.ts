/**
 * STARVIS - API Unit Tests
 * Tests zod schemas, route helpers, and asyncHandler
 */
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { arrayToCsv, CommodityQuery, ComponentQuery, ItemQuery, LoadoutBody, qInt, qStr, ShipQuery } from '../src/schemas.js';

// ── Tests ──

describe('qStr', () => {
  it('accepts undefined → undefined', () => {
    expect(qStr.parse(undefined)).toBeUndefined();
  });

  it('accepts a plain string', () => {
    expect(qStr.parse('AEGS')).toBe('AEGS');
  });

  it('picks first element from array (Express query array)', () => {
    expect(qStr.parse(['AEGS', 'RSI'])).toBe('AEGS');
  });

  it('coerces empty string to undefined', () => {
    expect(qStr.parse('')).toBeUndefined();
  });
});

describe('qInt', () => {
  const page = qInt(1);
  const limit = qInt(50, 200);

  it('defaults to fallback for undefined', () => {
    expect(page.parse(undefined)).toBe(1);
    expect(limit.parse(undefined)).toBe(50);
  });

  it('parses valid string numbers', () => {
    expect(page.parse('3')).toBe(3);
    expect(limit.parse('100')).toBe(100);
  });

  it('defaults for non-numeric input', () => {
    expect(page.parse('abc')).toBe(1);
    expect(limit.parse('')).toBe(50);
  });

  it('clamps to min(1)', () => {
    // negative → catch → default
    expect(page.parse('-1')).toBe(1);
    expect(page.parse('0')).toBe(1);
  });

  it('clamps to max when specified', () => {
    // 300 exceeds max=200 → catch → default
    expect(limit.parse('300')).toBe(50);
  });

  it('handles array input (Express multi-value)', () => {
    expect(page.parse(['5', '10'])).toBe(5);
  });
});

describe('ShipQuery', () => {
  it('parses empty query with defaults', () => {
    const result = ShipQuery.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.manufacturer).toBeUndefined();
  });

  it('parses a full query', () => {
    const result = ShipQuery.parse({
      manufacturer: 'AEGS',
      role: 'Light Fighter',
      career: 'Combat',
      page: '2',
      limit: '10',
      sort: 'name',
      order: 'desc',
    });
    expect(result.manufacturer).toBe('AEGS');
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.sort).toBe('name');
    expect(result.order).toBe('desc');
  });

  it('passes through unknown keys (passthrough)', () => {
    const result = ShipQuery.parse({ custom: 'value' });
    expect((result as Record<string, unknown>).custom).toBe('value');
  });
});

describe('ComponentQuery', () => {
  it('parses empty query with defaults', () => {
    const result = ComponentQuery.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('handles component-specific filters', () => {
    const result = ComponentQuery.parse({
      type: 'WeaponGun',
      sub_type: 'Laser',
      size: '3',
      grade: 'A',
      manufacturer: 'BEHR',
    });
    expect(result.type).toBe('WeaponGun');
    expect(result.sub_type).toBe('Laser');
    expect(result.size).toBe('3');
    expect(result.grade).toBe('A');
    expect(result.manufacturer).toBe('BEHR');
  });
});

describe('ItemQuery', () => {
  it('parses empty query with defaults', () => {
    const result = ItemQuery.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.type).toBeUndefined();
    expect(result.sub_type).toBeUndefined();
  });

  it('parses a full query', () => {
    const result = ItemQuery.parse({
      type: 'FPS_Weapon',
      sub_type: 'Assault_Rifle',
      manufacturer: 'BEHR',
      search: 'laser',
      sort: 'name',
      order: 'asc',
      page: '3',
      limit: '25',
    });
    expect(result.type).toBe('FPS_Weapon');
    expect(result.sub_type).toBe('Assault_Rifle');
    expect(result.manufacturer).toBe('BEHR');
    expect(result.search).toBe('laser');
    expect(result.page).toBe(3);
    expect(result.limit).toBe(25);
  });

  it('passes through unknown keys', () => {
    const result = ItemQuery.parse({ extra: 'value' });
    expect((result as Record<string, unknown>).extra).toBe('value');
  });
});

describe('CommodityQuery', () => {
  it('parses empty query with defaults', () => {
    const result = CommodityQuery.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.type).toBeUndefined();
  });

  it('parses a full query', () => {
    const result = CommodityQuery.parse({
      type: 'Food',
      search: 'rice',
      sort: 'name',
      order: 'desc',
      page: '2',
      limit: '100',
    });
    expect(result.type).toBe('Food');
    expect(result.search).toBe('rice');
    expect(result.page).toBe(2);
    expect(result.limit).toBe(100);
  });

  it('passes through unknown keys', () => {
    const result = CommodityQuery.parse({ custom: 'test' });
    expect((result as Record<string, unknown>).custom).toBe('test');
  });
});

describe('LoadoutBody', () => {
  it('requires shipUuid', () => {
    expect(() => LoadoutBody.parse({})).toThrow(ZodError);
    expect(() => LoadoutBody.parse({ shipUuid: '' })).toThrow(ZodError);
  });

  it('defaults swaps to empty array', () => {
    const result = LoadoutBody.parse({
      shipUuid: 'abc-123-def-456',
    });
    expect(result.swaps).toEqual([]);
  });

  it('parses full body with swaps', () => {
    const result = LoadoutBody.parse({
      shipUuid: 'abc-123-def-456',
      swaps: [
        { portName: 'hardpoint_weapon_gun_class3_left', componentUuid: 'comp-uuid-1' },
        { portName: 'hardpoint_weapon_gun_class3_right', componentUuid: 'comp-uuid-2' },
      ],
    });
    expect(result.swaps).toHaveLength(2);
    expect(result.swaps[0].portName).toBe('hardpoint_weapon_gun_class3_left');
  });

  it('rejects empty portName or componentUuid in swaps', () => {
    expect(() =>
      LoadoutBody.parse({
        shipUuid: 'abc',
        swaps: [{ portName: '', componentUuid: 'xyz' }],
      }),
    ).toThrow(ZodError);
  });
});

describe('arrayToCsv', () => {
  it('returns empty string for empty array', () => {
    expect(arrayToCsv([])).toBe('');
  });

  it('generates valid CSV with headers', () => {
    const csv = arrayToCsv([
      { name: 'Aurora', manufacturer: 'RSI' },
      { name: 'Gladius', manufacturer: 'AEGS' },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,manufacturer');
    expect(lines[1]).toBe('Aurora,RSI');
    expect(lines[2]).toBe('Gladius,AEGS');
  });

  it('quotes fields with commas', () => {
    const csv = arrayToCsv([{ name: 'Cutlass Black, Drake' }]);
    expect(csv).toContain('"Cutlass Black, Drake"');
  });

  it('escapes double quotes', () => {
    const csv = arrayToCsv([{ desc: 'He said "hello"' }]);
    expect(csv).toContain('"He said ""hello"""');
  });

  it('handles null values as empty', () => {
    const csv = arrayToCsv([{ name: 'Aurora', value: null }]);
    expect(csv).toBe('name,value\nAurora,');
  });
});

describe('cleanName', () => {
  // Import from service would be ideal, but cleanName is a private module-scope function
  // in game-data-service.ts — re-implement for isolated testing
  function cleanName(name: string, type: string): string {
    if (!name) return '—';
    let c = name;
    if (['Shield', 'QuantumDrive', 'PowerPlant', 'Cooler', 'Radar', 'Missile'].includes(type)) c = c.replace(/^S\d{2}\s+/, '');
    if (type === 'Countermeasure') {
      const m = c.match(/(CML\s+.+)/i);
      if (m) c = m[1];
    }
    c = c.replace(/\s*SCItem.*$/i, '').replace(/\s*_Resist.*$/i, '');
    return c.trim() || '—';
  }

  it('returns — for empty name', () => {
    expect(cleanName('', 'WeaponGun')).toBe('—');
  });

  it('strips size prefix for shields', () => {
    expect(cleanName('S03 Shimmer Shield', 'Shield')).toBe('Shimmer Shield');
  });

  it('strips SCItem suffix', () => {
    expect(cleanName('Behring Laser SCItem_V2', 'WeaponGun')).toBe('Behring Laser');
  });

  it('extracts CML prefix for countermeasures', () => {
    expect(cleanName('ORIG Pioneer CML Noise Chaff', 'Countermeasure')).toBe('CML Noise Chaff');
  });

  it('keeps weapon names intact', () => {
    expect(cleanName('CF-117 Bulldog', 'WeaponGun')).toBe('CF-117 Bulldog');
  });
});
