import { describe, expect, it } from 'vitest';
import {
  humanizeWorkshopClassName,
  looksLikeWorkshopShipName,
  resolveGameShipName,
  stripManufacturerPrefix,
} from '../src/services/ship-naming.js';

describe('stripManufacturerPrefix', () => {
  it('retire la raison sociale complète', () => {
    expect(stripManufacturerPrefix('Aegis Idris-P Wikelo War Special', 'Aegis Dynamics', 'AEGS')).toBe('Idris-P Wikelo War Special');
  });

  it('retire le premier mot de la raison sociale', () => {
    // Le jeu écrit « Anvil », la table porte « Anvil Aerospace ».
    expect(stripManufacturerPrefix('Anvil Asgard Wikelo War Special', 'Anvil Aerospace', 'ANVL')).toBe('Asgard Wikelo War Special');
  });

  it('retire le code quand la raison sociale ne ressemble pas au nom écrit', () => {
    // MISC s'écrit « Musashi Industrial & Starflight Concern » en toutes lettres :
    // ni la raison sociale ni son premier mot ne permettent de reconnaître le
    // préfixe, seul le code le fait.
    expect(stripManufacturerPrefix('MISC Prospector Wikelo Work Special', 'Musashi Industrial & Starflight Concern', 'MISC')).toBe(
      'Prospector Wikelo Work Special',
    );
  });

  it('retire une marque que ni le code ni la raison sociale ne donnent', () => {
    expect(stripManufacturerPrefix('Vanduul Mauler Destroyer', null, 'VNCL')).toBe('Mauler Destroyer');
  });

  it('laisse intact un nom qui commence par autre chose', () => {
    expect(stripManufacturerPrefix('Dragonfly Star Kitten', 'Drake Interplanetary', 'DRAK')).toBe('Dragonfly Star Kitten');
  });

  it('ne coupe pas un mot qui commence comme le constructeur', () => {
    // « Aegisborn » n'est pas « Aegis » suivi d'un nom : l'espace est exigé.
    expect(stripManufacturerPrefix('Aegisborn', 'Aegis Dynamics', 'AEGS')).toBe('Aegisborn');
  });
});

describe('resolveGameShipName', () => {
  const loc = (entries: Record<string, string>) =>
    ({
      resolveKey: (key: string) => entries[key] ?? null,
    }) as never;

  it('lit la clé sans séparateur, forme réellement utilisée par global.ini', () => {
    expect(resolveGameShipName(loc({ vehicle_NameDRAK_Dragonfly_Pink: 'Dragonfly Star Kitten' }), 'DRAK_Dragonfly_Pink')).toBe(
      'Dragonfly Star Kitten',
    );
  });

  it('nettoie les retours à la ligne littéraux du jeu', () => {
    // Relevé tel quel dans global.ini pour le CSV-SM.
    expect(resolveGameShipName(loc({ vehicle_NameRSI_CSV_Cargo: 'CSV-SM\\n' }), 'RSI_CSV_Cargo')).toBe('CSV-SM');
  });

  it('renvoie null quand le jeu ne nomme pas le vaisseau', () => {
    expect(resolveGameShipName(loc({}), 'ARGO_ATLS_GEO_Collector_Grad01')).toBeNull();
  });
});

describe('looksLikeWorkshopShipName', () => {
  it('détecte les restes de nomenclature DataForge', () => {
    expect(looksLikeWorkshopShipName('Pulse Collector Civ')).toBe(true);
    expect(looksLikeWorkshopShipName('Corsair Exec StealthIndustrial')).toBe(true);
    expect(looksLikeWorkshopShipName('ANVL_Arrow')).toBe(true);
    expect(looksLikeWorkshopShipName('Cutlass Black Exec Military')).toBe(true);
  });

  it('laisse passer les noms humains du jeu', () => {
    expect(looksLikeWorkshopShipName('S-65 Stingray')).toBe(false);
    expect(looksLikeWorkshopShipName('Arrow')).toBe(false);
    expect(looksLikeWorkshopShipName('A2 Hercules Starlifter Wikelo War Special')).toBe(false);
  });
});

describe('humanizeWorkshopClassName', () => {
  it('produit un libellé lisible depuis le class_name', () => {
    expect(humanizeWorkshopClassName('MRAI_Pulse_Collector_Civ', 'MRAI')).toBe('Pulse (Civilian)');
    expect(humanizeWorkshopClassName('DRAK_Corsair_Exec_Military', 'DRAK')).toBe('Corsair (Military)');
    expect(looksLikeWorkshopShipName(humanizeWorkshopClassName('MRAI_Pulse_Collector_Civ', 'MRAI'))).toBe(false);
  });
});
