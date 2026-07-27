import { describe, expect, it } from 'vitest';
import { dataForgeUuidToScUuid, scUuidToDataForgeUuid } from '../src/dataforge/dataforge-utils.js';

/**
 * Un même vaisseau porte deux identifiants selon la source : la forme
 * « standard » chez UEX, le wiki communautaire et les outils tiers, la forme
 * réordonnée de DataForge dans nos tables. Sans conversion fiable dans les deux
 * sens, aucun tiers ne peut joindre les données Starvis à celles des autres
 * projets.
 */
describe('formes d’UUID Star Citizen', () => {
  // Vérifié le 27/07/2026 contre star-citizen.wiki et finder.cstone.space, qui
  // référencent tous deux le Dragonfly Star Kitten sous la forme standard.
  const STANDARD = 'd868dfb9-5bcd-4f7b-a40a-3aa5bbf7d705';
  const DATAFORGE = '5bcd4f7b-dfb9-d868-05d7-f7bba53a0aa4';

  it('convertit la forme standard vers la forme DataForge', () => {
    expect(scUuidToDataForgeUuid(STANDARD)).toBe(DATAFORGE);
  });

  it('reconvertit la forme DataForge vers la forme standard', () => {
    expect(dataForgeUuidToScUuid(DATAFORGE)).toBe(STANDARD);
  });

  it("n'est pas sa propre inverse, contrairement à ce que la documentation affirmait", () => {
    // Le piège que ce test fige : réappliquer la conversion aller ne ramène pas
    // à l'origine, et échoue en silence — l'UUID obtenu reste bien formé.
    expect(scUuidToDataForgeUuid(DATAFORGE)).not.toBe(STANDARD);
  });

  it('fait l’aller-retour sur des identifiants arbitraires', () => {
    // Motif fixe plutôt qu'aléatoire : un test qui échoue une fois sur mille
    // n'est pas un test.
    for (let i = 0; i < 256; i++) {
      const hex = Array.from({ length: 32 }, (_, j) => '0123456789abcdef'[(i * 7 + j * 5 + 3) % 16]).join('');
      const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      expect(dataForgeUuidToScUuid(scUuidToDataForgeUuid(uuid))).toBe(uuid);
    }
  });

  it('laisse passer ce qui n’est pas un UUID', () => {
    expect(scUuidToDataForgeUuid('concept-71')).toBe('concept-71');
    expect(dataForgeUuidToScUuid('')).toBe('');
  });
});
