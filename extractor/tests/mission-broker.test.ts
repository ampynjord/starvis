import { describe, expect, it } from 'vitest';
import { extractMissionBrokers } from '../src/extractors/mission-broker-extractor.js';

/**
 * Deux arbitrages de cet extracteur méritent d'être figés.
 *
 * Une difficulté de -1 veut dire « non fixée » dans la donnée du jeu ; la rendre
 * telle quelle ferait classer ces missions comme les plus faciles.
 *
 * Et le jeu compose certains titres à l'exécution. Le gabarit peut se trouver au
 * milieu — « Secure Bounty: ~mission(TargetName) (VHRT) » — ce qu'un motif ancré
 * en tête laissait passer : quatre-vingt-dix titres étaient annoncés lisibles à
 * tort.
 */
function fakeContext(entries: Record<string, unknown>[]) {
  return {
    getDfData: () => ({
      structDefs: [{ name: 'MissionBrokerEntry' }],
      records: entries.map((_, i) => ({ structIndex: 0, instanceIndex: i, name: `MissionBrokerEntry.Mission_${i}` })),
    }),
    readInstance: (_s: number, instanceIndex: number) => entries[instanceIndex],
    resolveGuid: () => undefined,
  } as never;
}

const loc = { resolveKey: (key: string) => (key === '@paid' ? 'Secure Bounty: ~mission(TargetName) (VHRT)' : `résolu:${key}`) };

describe('extractMissionBrokers', () => {
  it('écarte ce que le jeu déclare non publiable', () => {
    const out = extractMissionBrokers(fakeContext([{ notForRelease: true }, { notForRelease: false }]), loc);
    expect(out).toHaveLength(1);
    expect(out[0].className).toBe('Mission_1');
  });

  it('repère un gabarit même au milieu du titre', () => {
    const out = extractMissionBrokers(fakeContext([{ title: '@paid' }]), loc);
    expect(out[0].title).toBe('Secure Bounty: ~mission(TargetName) (VHRT)');
    expect(out[0].titleIsTemplate).toBe(true);
  });

  it('rend null une difficulté non fixée plutôt que -1', () => {
    const out = extractMissionBrokers(fakeContext([{ missionDifficulty: -1 }, { missionDifficulty: 3 }]), loc);
    expect(out[0].difficulty).toBeNull();
    expect(out[1].difficulty).toBe(3);
  });

  it('lit le montant et la devise dans la récompense', () => {
    const out = extractMissionBrokers(
      fakeContext([{ missionReward: { reward: 1890, max: 0, currencyType: 'UEC' }, lawfulMission: true }]),
      loc,
    );
    expect(out[0]).toMatchObject({ rewardAmount: 1890, rewardMax: 0, rewardCurrency: 'UEC', isLawful: true });
  });

  it('garde la clé de localisation à côté de la valeur résolue', () => {
    // La clé reste la seule identité stable : un libellé change d'un patch à
    // l'autre, la clé non.
    const out = extractMissionBrokers(fakeContext([{ title: '@mission_title' }]), loc);
    expect(out[0].titleLocKey).toBe('@mission_title');
    expect(out[0].title).toBe('résolu:@mission_title');
  });
});
