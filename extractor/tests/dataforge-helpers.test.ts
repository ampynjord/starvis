/**
 * Tests for DataForge utility helpers
 */
import { describe, expect, it } from 'vitest';
import { resolveComponentName, resolveLocKey, scUuidToDataForgeUuid } from '../src/dataforge/dataforge-utils.js';

// ── resolveLocKey ──
describe('resolveLocKey', () => {
  it('resolves known career keys', () => {
    expect(resolveLocKey('@vehicle_focus_combat', 'career')).toBe('Combat');
    expect(resolveLocKey('@vehicle_focus_exploration', 'career')).toBe('Exploration');
    expect(resolveLocKey('@vehicle_focus_industrial', 'career')).toBe('Industrial');
    expect(resolveLocKey('@vehicle_focus_transporter', 'career')).toBe('Transporter');
  });

  it('resolves known role keys', () => {
    expect(resolveLocKey('@vehicle_class_lightfighter', 'role')).toBe('Light Fighter');
    expect(resolveLocKey('@vehicle_class_heavyfighter', 'role')).toBe('Heavy Fighter');
    expect(resolveLocKey('@vehicle_class_pathfinder', 'role')).toBe('Pathfinder');
    expect(resolveLocKey('@vehicle_class_mediumfreight', 'role')).toBe('Medium Freight');
  });

  it('handles CIG typos in role keys', () => {
    expect(resolveLocKey('@vehicle_class_mediumfreightgunshio', 'role')).toBe('Medium Freight / Gun Ship');
  });

  it('falls back to cleaned key for unknown keys', () => {
    const result = resolveLocKey('@vehicle_class_newUnknownRole', 'role');
    expect(result).toBeTruthy();
    expect(result).not.toContain('@');
  });

  it('returns empty string for empty/null keys', () => {
    expect(resolveLocKey('', 'career')).toBe('');
    expect(resolveLocKey('', 'role')).toBe('');
  });

  it('passes through non-@ keys as-is', () => {
    expect(resolveLocKey('Combat', 'career')).toBe('Combat');
  });
});

// ── resolveComponentName ──
describe('resolveComponentName', () => {
  it('strips manufacturer prefix', () => {
    expect(resolveComponentName('KLWE_LaserRepeater_S3')).not.toContain('KLWE');
  });

  it('strips _SCItem suffix', () => {
    expect(resolveComponentName('BEHR_LaserCannon_SCItem')).not.toContain('SCItem');
  });

  it('strips category prefixes (POWR_, COOL_, etc.)', () => {
    expect(resolveComponentName('POWR_AEGS_PowerPlant_S1')).not.toContain('POWR');
    expect(resolveComponentName('SHLD_GAMA_Shield_S3')).not.toContain('SHLD');
  });

  it('converts underscores to spaces', () => {
    const result = resolveComponentName('KLWE_Laser_Repeater_S3');
    expect(result).toContain(' ');
    expect(result).not.toContain('_');
  });

  it('inserts spaces between camelCase', () => {
    const result = resolveComponentName('BEHR_LaserRepeater');
    expect(result).toContain('Laser Repeater');
  });
});

// ── scUuidToDataForgeUuid ──
// UEX exposes vehicle UUIDs in the byte-reordered "SC" form. They must be re-ordered
// to match game.ships.uuid (DataForge form) before joining UEX prices to our ships.
describe('scUuidToDataForgeUuid', () => {
  it('reorders a UEX ship uuid to its DataForge form (Origin 100i)', () => {
    expect(scUuidToDataForgeUuid('6135a874-4cb1-4f49-9f29-5781e5991f2b')).toBe('4cb14f49-a874-6135-2b1f-99e58157299f');
  });

  it('is case-insensitive on input and lowercases output', () => {
    expect(scUuidToDataForgeUuid('6135A874-4CB1-4F49-9F29-5781E5991F2B')).toBe('4cb14f49-a874-6135-2b1f-99e58157299f');
  });

  it('returns the input unchanged for malformed uuids', () => {
    expect(scUuidToDataForgeUuid('not-a-uuid')).toBe('not-a-uuid');
    expect(scUuidToDataForgeUuid('')).toBe('');
  });
});

// ── MANUFACTURER_CODES (legacy) ──
// MANUFACTURER_CODES is kept for backward compatibility but is no longer the source of truth.
// Manufacturer data is now extracted directly from the DataForge (Manufacturer struct records).
