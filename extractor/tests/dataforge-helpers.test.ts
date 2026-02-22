/**
 * Tests for DataForge utility helpers
 */
import { describe, expect, it } from 'vitest';
import { MANUFACTURER_CODES, resolveComponentName, resolveLocKey } from '../src/dataforge-utils.js';

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

// ── MANUFACTURER_CODES ──
describe('MANUFACTURER_CODES', () => {
  it('contains all major ship manufacturers', () => {
    const requiredCodes = ['AEGS', 'ANVL', 'ARGO', 'CNOU', 'CRUS', 'DRAK', 'MISC', 'ORIG', 'RSI'];
    for (const code of requiredCodes) {
      expect(MANUFACTURER_CODES).toHaveProperty(code);
      expect(MANUFACTURER_CODES[code]).toBeTruthy();
    }
  });

  it('contains all major component manufacturers', () => {
    const componentCodes = ['BEHR', 'KLWE', 'GATS', 'MXOX', 'HRST'];
    for (const code of componentCodes) {
      expect(MANUFACTURER_CODES).toHaveProperty(code);
    }
  });

  it('maps codes to full names (not abbreviations)', () => {
    expect(MANUFACTURER_CODES['AEGS']).toBe('Aegis Dynamics');
    expect(MANUFACTURER_CODES['RSI']).toBe('Roberts Space Industries');
    expect(MANUFACTURER_CODES['BEHR']).toBe('Behring Applied Technology');
  });
});
