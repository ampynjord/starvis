/**
 * Les missions telles que le courtier les propose.
 *
 * `game.missions` vient de `ContractTemplate` : 494 enregistrements, aucune
 * récompense, et sept colonnes vides en permanence dont `required_reputation` et
 * les quatre colonnes de lieu. Elles existent parce que quelqu'un savait que la
 * donnée devait s'y trouver.
 *
 * Elle s'y trouve, mais ailleurs : `MissionBrokerEntry` porte 2 584
 * enregistrements — 1 978 publiables — et **toutes ont une récompense**, une
 * légalité, une difficulté, un donneur et des prérequis de réputation.
 *
 * ── Ce que cet extracteur ne fait pas ────────────────────────────────────────
 *
 * Remplir `game.missions`. Les deux structures décrivent des choses
 * différentes — un contrat générique d'un côté, une offre de courtier de
 * l'autre — et les confondre produirait des lignes moitié vides. Elles vivent
 * donc côte à côte.
 */
import type { DataForgeContext } from '../dataforge/dataforge-utils.js';
import logger from '../logger.js';

export interface MissionBrokerRecord {
  className: string;
  titleLocKey: string | null;
  title: string | null;
  /**
   * Le jeu compose certains titres à l'exécution : « ~mission(Contractor|
   * BountyTitle) » n'est pas un libellé, c'est un gabarit. Le distinguer
   * empêche de l'afficher tel quel.
   */
  titleIsTemplate: boolean;
  descriptionLocKey: string | null;
  description: string | null;
  giverLocKey: string | null;
  giver: string | null;
  missionModule: string | null;
  missionType: string | null;
  rewardAmount: number | null;
  rewardMax: number | null;
  rewardCurrency: string | null;
  /** -1 signifie « non fixée » dans la donnée du jeu ; on rend null. */
  difficulty: number | null;
  isLawful: boolean;
  onceOnly: boolean;
  isTutorial: boolean;
  maxInstances: number | null;
  deadlineSeconds: number | null;
  availableInPrison: boolean;
  failIfBecameCriminal: boolean;
  minRequiredMissions: number | null;
  rawJson: Record<string, unknown>;
}

interface LocAdapter {
  resolveKey(key: string): string | null;
}

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
/**
 * Un gabarit peut se trouver n'importe ou dans le titre, pas seulement en tete :
 * « Secure Bounty: ~mission(TargetName) (VHRT) » est aussi peu affichable que
 * « ~mission(Contractor|BountyTitle) ». Ancrer le motif au debut laissait passer
 * le premier.
 */
const RUNTIME_TEMPLATE = /~\w+\(/;

const text = (value: unknown): string | null => (typeof value === 'string' && value && value !== '@LOC_UNINITIALIZED' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const bool = (value: unknown): boolean => value === true;

function refGuid(value: unknown): string | null {
  const ref = (value as { __ref?: unknown } | null)?.__ref;
  return typeof ref === 'string' && ref !== EMPTY_GUID ? ref : null;
}

/** Résout une clé de localisation en gardant la clé, qui reste la seule identité stable. */
function localized(raw: unknown, loc: LocAdapter): { key: string | null; value: string | null } {
  const key = text(raw);
  if (!key) return { key: null, value: null };
  if (!key.startsWith('@')) return { key: null, value: key };
  const resolved = loc.resolveKey(key);
  return { key, value: resolved && resolved !== '<= UNINITIALIZED =>' ? resolved : null };
}

export function extractMissionBrokers(df: DataForgeContext, loc: LocAdapter): MissionBrokerRecord[] {
  const dfData = df.getDfData();
  if (!dfData) return [];

  const structIdx = dfData.structDefs.findIndex((def: { name: string }) => def.name === 'MissionBrokerEntry');
  if (structIdx === -1) {
    logger.warn('DataForge: no "MissionBrokerEntry" struct found', { module: 'mission-broker-extractor' });
    return [];
  }

  const records: MissionBrokerRecord[] = [];
  let skipped = 0;

  for (const record of dfData.records) {
    if (record.structIndex !== structIdx) continue;
    const data = df.readInstance(record.structIndex, record.instanceIndex, 0, 4) as Record<string, unknown> | null;
    if (!data) continue;

    // `notForRelease` est la déclaration du jeu lui-même : ces entrées ne sont
    // pas jouables, et les servir reviendrait à publier du contenu mort.
    if (data.notForRelease === true) {
      skipped++;
      continue;
    }

    const className = String(record.name ?? '').replace(/^MissionBrokerEntry\./i, '');
    if (!className) continue;

    const title = localized(data.title, loc);
    const description = localized(data.description, loc);
    const giver = localized(data.missionGiver, loc);
    const reward = (data.missionReward ?? null) as Record<string, unknown> | null;
    const deadline = (data.missionDeadline ?? null) as Record<string, unknown> | null;
    const difficulty = num(data.missionDifficulty);

    records.push({
      className,
      titleLocKey: title.key,
      title: title.value,
      titleIsTemplate: title.value != null && RUNTIME_TEMPLATE.test(title.value),
      descriptionLocKey: description.key,
      description: description.value,
      giverLocKey: giver.key,
      giver: giver.value,
      missionModule: text(data.missionModule),
      missionType: refGuid(data.type) ? (df.resolveGuid(refGuid(data.type) as string) ?? null) : null,
      rewardAmount: num(reward?.reward),
      rewardMax: num(reward?.max),
      rewardCurrency: text(reward?.currencyType),
      difficulty: difficulty != null && difficulty >= 0 ? difficulty : null,
      isLawful: bool(data.lawfulMission),
      onceOnly: bool(data.onceOnly),
      isTutorial: bool(data.tutorial),
      maxInstances: num(data.maxInstances),
      deadlineSeconds: num(deadline?.missionCompletionTime),
      availableInPrison: bool(data.availableInPrison),
      failIfBecameCriminal: bool(data.failIfBecameCriminal),
      minRequiredMissions: num(data.minRequiredMissions),
      rawJson: { className, notForRelease: false },
    });
  }

  logger.info(`MissionBrokerEntry: ${records.length} releasable (${skipped} not for release)`, {
    module: 'mission-broker-extractor',
  });
  return records;
}
