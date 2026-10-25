import { describe, expect, it } from 'vitest';
import { LocalizationService } from '../src/services/localization-service.js';

describe('LocalizationService (bilingual EN + FR)', () => {
  it('resolves English and French component and vehicle names and descriptions', () => {
    const loc = new LocalizationService();

    const enIni = Buffer.from(
      [
        '@item_NameBEHR_LaserRepeater_S2=Attrition-2 Repeater',
        '@item_DescBEHR_LaserRepeater_S2=Size 2 laser repeater by Behring.',
        '@vehicle_Name_AEGS_Gladius=Aegis Gladius',
        '@hud_mining_rock_name_1=Quantanium Deposit',
      ].join('\n'),
      'utf8',
    );

    const frIni = Buffer.from(
      [
        '@item_NameBEHR_LaserRepeater_S2=Répéteur Attrition-2',
        '@item_DescBEHR_LaserRepeater_S2=Répéteur laser de taille 2 fabriqué par Behring.',
        '@vehicle_Name_AEGS_Gladius=Gladius Aegis',
        '@hud_mining_rock_name_1=Gisement de Quantanium',
      ].join('\n'),
      'utf8',
    );

    loc.parseGlobalIni(enIni, undefined, 'en');
    loc.parseGlobalIni(frIni, undefined, 'fr');

    expect(loc.isLoaded).toBe(true);
    expect(loc.isFrenchLoaded).toBe(true);

    expect(loc.resolveComponentName('BEHR_LaserRepeater_S2', 'en')).toBe('Attrition-2 Repeater');
    expect(loc.resolveComponentName('BEHR_LaserRepeater_S2', 'fr')).toBe('Répéteur Attrition-2');

    expect(loc.resolveDescription('BEHR_LaserRepeater_S2', 'en')).toBe('Size 2 laser repeater by Behring.');
    expect(loc.resolveDescription('BEHR_LaserRepeater_S2', 'fr')).toBe('Répéteur laser de taille 2 fabriqué par Behring.');

    expect(loc.resolveShipName('AEGS_Gladius', 'en')).toBe('Aegis Gladius');
    expect(loc.resolveShipName('AEGS_Gladius', 'fr')).toBe('Gladius Aegis');

    expect(loc.resolveKey('@hud_mining_rock_name_1', 'en')).toBe('Quantanium Deposit');
    expect(loc.resolveKey('@hud_mining_rock_name_1', 'fr')).toBe('Gisement de Quantanium');
  });
});
