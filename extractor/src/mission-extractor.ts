/**
 * MissionExtractor — ContractTemplate records from DataForge
 *
 * Extracts mission/contract definitions:
 *   - Mission type derived from class_name
 *   - Shareable / solo flags
 *   - Legal status (criminal missions)
 *   - Completion time limit
 *   - Title / description from LOC keys
 */
import type { DataForgeService } from './dataforge-service.js';
import logger from './logger.js';

export interface MissionRecord {
  uuid: string;
  className: string;
  title: string | null;
  description: string | null;
  missionType: string;
  canBeShared: boolean;
  onlyOwnerComplete: boolean;
  isLegal: boolean;
  completionTimeSecs: number | null;
  notForRelease: boolean;
  workInProgress: boolean;
  // SCMDB parity
  rewardMin: number | null;
  rewardMax: number | null;
  rewardCurrency: string | null;
  faction: string | null;
  missionGiver: string | null;
  locationSystem: string | null;
  locationPlanet: string | null;
  locationName: string | null;
  dangerLevel: number | null;
  requiredReputation: number | null;
  reputationReward: number | null;
}

const TYPE_PATTERNS: [RegExp, string][] = [
  [/bounty|headhunt|assassin/i, 'Bounty'],
  [/eliminat|assault|combat|attack|ambush|intercept|uwf|ugf|lawful|unlawful.*target/i, 'Combat'],
  [/deliver|package|courier|cargo(?!_drone)|smuggl/i, 'Delivery'],
  [/escort/i, 'Escort'],
  [/infiltrat|hack|sabotage|plant_bomb/i, 'Infiltration'],
  [/salvage/i, 'Salvage'],
  [/mining/i, 'Mining'],
  [/investigat|scan|probe|recon|survey|gather_intel/i, 'Investigation'],
  [/patrol/i, 'Patrol'],
  [/race/i, 'Race'],
  [/spy|espionage/i, 'Espionage'],
  [/recover|retriev|rescue/i, 'Recovery'],
  [/siege/i, 'Siege'],
  [/trade|buy|sell|purchase/i, 'Trade'],
  [/construct|build|repair/i, 'Construction'],
];

function deriveMissionType(className: string): string {
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(className)) return type;
  }
  return 'Misc';
}

function isLocEmpty(s: string | null | undefined): boolean {
  if (!s) return true;
  if (s.startsWith('@LOC_UNINIT') || s === '@LOC_EMPTY' || s === '@LOC_') return true;
  // Also catch the resolved placeholder string from global.ini
  const t = s.trim();
  return t.includes('UNINITIALIZED') || t === '<= UNINITIALIZED =>' || t.startsWith('<= UNINITIALIZED');
}

export function extractMissions(ctx: DataForgeService, locService?: { resolveKey(key: string): string | null }): MissionRecord[] {
  const records = ctx.searchByStructType('^ContractTemplate$', 99999);
  if (!records.length) {
    logger.warn('ContractTemplate: no records found in DataForge');
    return [];
  }

  const results: MissionRecord[] = [];

  for (const r of records) {
    try {
      const data = ctx.readRecordByGuid(r.uuid, 4) as Record<string, unknown>;
      if (!data) continue;

      const className = r.name.replace(/^ContractTemplate\./, '');
      const notForRelease = !!(data.notForRelease as boolean);
      const workInProgress = !!(data.workInProgress as boolean);

      const cc = (data.contractClass as Record<string, unknown>) ?? {};
      const params = (cc.additionalParams as Record<string, unknown>) ?? {};
      const autoFinish = (cc.autoFinishSettings as Record<string, unknown>) ?? {};

      const canBeShared = !!(params.canBeShared as boolean);
      const onlyOwnerComplete = !!(params.onlyOwnerCanComplete as boolean);
      // Missions that fail when you become criminal = legal missions
      const isLegal = (autoFinish.failIfBecameCriminal as boolean) !== false;

      const deadline = (autoFinish.contractDeadline as Record<string, unknown>) ?? {};
      const completionTimeSecs =
        typeof deadline.missionCompletionTime === 'number' && (deadline.missionCompletionTime as number) > 0
          ? (deadline.missionCompletionTime as number)
          : null;

      // ── Rewards ──
      const rewards = (data.contractRewards ?? data.rewards ?? cc.contractRewards) as Record<string, unknown> | undefined;
      let rewardMin: number | null = null;
      let rewardMax: number | null = null;
      let rewardCurrency: string | null = null;
      if (rewards) {
        const money = (rewards.moneyReward ?? rewards.currencyReward ?? rewards.paymentReward) as Record<string, unknown> | undefined;
        if (money) {
          const min = money.min ?? money.minimum ?? money.amount;
          const max = money.max ?? money.maximum ?? money.amount;
          if (typeof min === 'number' && min > 0) rewardMin = min;
          if (typeof max === 'number' && max > 0) rewardMax = max;
          if (typeof money.currency === 'string') rewardCurrency = money.currency;
        }
        // Flat reward fallback
        if (rewardMin == null) {
          const flat = rewards.rewardAmount ?? rewards.flatReward;
          if (typeof flat === 'number' && flat > 0) {
            rewardMin = flat;
            rewardMax = flat;
          }
        }
      }
      if (!rewardCurrency && (rewardMin || rewardMax)) rewardCurrency = 'aUEC';

      // ── Faction / Mission Giver ──
      let faction: string | null = null;
      let missionGiver: string | null = null;
      const giver = (data.missionGiver ?? data.contractGiver ?? cc.missionGiver) as Record<string, unknown> | string | undefined;
      if (typeof giver === 'string') {
        missionGiver = giver;
      } else if (giver && typeof giver === 'object') {
        missionGiver = (giver.name ?? giver.displayName ?? giver.entityName ?? null) as string | null;
      }
      const factionRaw = (data.faction ?? cc.faction ?? params.faction) as string | Record<string, unknown> | undefined;
      if (typeof factionRaw === 'string') {
        faction = factionRaw;
      } else if (factionRaw && typeof factionRaw === 'object') {
        faction = (factionRaw.name ?? factionRaw.factionName ?? null) as string | null;
      }

      // ── Location ──
      let locationSystem: string | null = null;
      let locationPlanet: string | null = null;
      let locationName: string | null = null;
      const location = (data.contractLocation ?? data.location ?? cc.targetLocation ?? params.location) as Record<string, unknown> | string | undefined;
      if (typeof location === 'string') {
        locationName = location;
      } else if (location && typeof location === 'object') {
        locationSystem = (location.system ?? location.starSystem ?? null) as string | null;
        locationPlanet = (location.planet ?? location.celestialBody ?? null) as string | null;
        locationName = (location.name ?? location.locationName ?? location.objectContainer ?? null) as string | null;
      }

      // ── Difficulty / Reputation ──
      let dangerLevel: number | null = null;
      let requiredReputation: number | null = null;
      let reputationReward: number | null = null;
      const danger = data.dangerLevel ?? data.difficultyLevel ?? data.threatLevel ?? params.dangerLevel;
      if (typeof danger === 'number' && danger > 0) dangerLevel = danger;

      const repReq = (data.reputationRequirements ?? data.requiredReputation ?? cc.reputationRequirements) as Record<string, unknown> | number | undefined;
      if (typeof repReq === 'number') {
        requiredReputation = repReq;
      } else if (repReq && typeof repReq === 'object') {
        const minRep = repReq.minimumReputation ?? repReq.minRep ?? repReq.requiredLevel;
        if (typeof minRep === 'number') requiredReputation = minRep;
      }

      const repReward = (data.reputationReward ?? rewards?.reputationReward) as Record<string, unknown> | number | undefined;
      if (typeof repReward === 'number') {
        reputationReward = repReward;
      } else if (repReward && typeof repReward === 'object') {
        const val = repReward.amount ?? repReward.value;
        if (typeof val === 'number') reputationReward = val;
      }

      // Resolve title / description
      const displayInfo = (data.contractDisplayInfo as Record<string, unknown>) ?? {};
      const displayStrings: string[] = Array.isArray(displayInfo.displayString) ? (displayInfo.displayString as string[]) : [];

      const rawTitle = displayStrings[0] ?? null;
      const rawDesc = displayStrings[2] ?? null;

      const resolveStr = (raw: string | null) => {
        if (!raw) return null;
        if (locService && raw.startsWith('@')) return locService.resolveKey(raw);
        return raw;
      };

      const resTitle = resolveStr(rawTitle);
      const resDesc = resolveStr(rawDesc);

      const title = isLocEmpty(resTitle)
        ? className
            .replace(/_/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .trim()
        : resTitle;

      const description = isLocEmpty(resDesc) ? null : resDesc;

      results.push({
        uuid: r.uuid,
        className,
        title,
        description,
        missionType: deriveMissionType(className),
        canBeShared,
        onlyOwnerComplete,
        isLegal,
        completionTimeSecs,
        notForRelease,
        workInProgress,
        rewardMin,
        rewardMax,
        rewardCurrency,
        faction,
        missionGiver,
        locationSystem,
        locationPlanet,
        locationName,
        dangerLevel,
        requiredReputation,
        reputationReward,
      });
    } catch (e) {
      logger.debug(`Mission extract error [${r.name}]: ${(e as Error).message}`);
    }
  }

  logger.info(`Extracted ${results.length} mission templates from ${records.length} ContractTemplate records`);
  return results;
}
