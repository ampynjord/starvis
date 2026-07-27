import { describe, expect, it } from 'vitest';
import { isDevelopmentAsset } from '../src/extractors/component-extractor.js';

/**
 * Le filtre décide de ce qui entre en base. Trop large, il fait disparaître des
 * composants réels sans laisser de trace : ils n'existent simplement pas, et les
 * loadouts qui les portent paraissent incomplets.
 */
describe('isDevelopmentAsset', () => {
  it("n'écarte pas le missile Tempest", () => {
    // Le cas qui a motivé la correction : monté sur 160 ports de vaisseaux, et
    // rejeté parce que « tempest » commence par « temp ».
    expect(isDevelopmentAsset('MISL_S02_CS_FSKI_Tempest')).toBe(false);
  });

  it('écarte toujours un provisoire véritable', () => {
    expect(isDevelopmentAsset('BEHR_Laser_Temp')).toBe(true);
    expect(isDevelopmentAsset('Temp_Shield_Generator')).toBe(true);
    expect(isDevelopmentAsset('WEAPON_temp_01')).toBe(true);
  });

  it('écarte les autres marqueurs de développement', () => {
    expect(isDevelopmentAsset('Test_Rig')).toBe(true);
    expect(isDevelopmentAsset('Shield_Template_S1')).toBe(true);
    expect(isDevelopmentAsset('Cooler_Debug')).toBe(true);
    expect(isDevelopmentAsset('Turret_Placeholder')).toBe(true);
    expect(isDevelopmentAsset('Wall_Indestructible')).toBe(true);
    expect(isDevelopmentAsset('Gun_NPC_only_Variant')).toBe(true);
    expect(isDevelopmentAsset('Display_Screen_Radar')).toBe(true);
  });

  it('laisse passer un nom qui contient un marqueur au milieu d’un mot', () => {
    // C'est toute la différence entre une sous-chaîne et un segment : ces noms
    // sont légitimes et étaient perdus.
    expect(isDevelopmentAsset('AEGS_Testudo_Shield')).toBe(false);
    expect(isDevelopmentAsset('KLWE_Attrition_S3')).toBe(false);
    expect(isDevelopmentAsset('Contested_Zone_Armor')).toBe(false);
  });

  it('laisse passer les composants ordinaires', () => {
    expect(isDevelopmentAsset('KLWE_LaserRepeater_S3')).toBe(false);
    expect(isDevelopmentAsset('Bengal_BallisticCannon_S7')).toBe(false);
  });
});
