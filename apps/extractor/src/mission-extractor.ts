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

interface MissionLocalizationAdapter {
  resolveKey(key: string): string | null;
  resolveComponentName?(className: string): string | null;
}

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
  baseXp: number | null;
  category: string | null;
  isUnique: boolean;
  hasBlueprintReward: boolean;
  blueprintRewardUuid: string | null;
  buyInAmount: number | null;
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

/** Derive high-level category from contract className (SCMDB parity) */
const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/^Story_|_Story_|_cinematic|_narrative/i, 'Story'],
  [/^Wikelo|_Wikelo/i, 'Wikelo'],
  [/^ASD_|_ASD_/i, 'ASD'],
  [/^ACE_|_ACE_/i, 'ACE'],
  [/^Event_|_Event_|_seasonal/i, 'Event'],
];

function deriveMissionCategory(className: string): string {
  for (const [pattern, cat] of CATEGORY_PATTERNS) {
    if (pattern.test(className)) return cat;
  }
  return 'Career';
}

function isLocEmpty(s: string | null | undefined): boolean {
  if (!s) return true;
  if (s.startsWith('@LOC_UNINIT') || s === '@LOC_EMPTY' || s === '@LOC_') return true;
  // Also catch the resolved placeholder string from global.ini
  const t = s.trim();
  return t.includes('UNINITIALIZED') || t === '<= UNINITIALIZED =>' || t.startsWith('<= UNINITIALIZED');
}

function cleanRuntimePlaceholderTokens(s: string | null | undefined): string | null {
  if (!s) return null;
  // Strip runtime tokens and any immediately preceding separator/whitespace (e.g., ": <Target Name>")
  let result = s.replace(/\s*[:\-]\s*~[a-zA-Z0-9_]+\([^)]*\)/g, '');
  result = result.replace(/~[a-zA-Z0-9_]+\([^)]*\)/g, '');
  result = result.trim();
  return result || null;
}

function hasRuntimePlaceholderTokens(s: string | null | undefined): boolean {
  if (!s) return false;
  return /~[a-z0-9_]+\(/i.test(s);
}

function humanizeMissionClassName(className: string): string {
  const withSpaces = className
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  return withSpaces.replace(/\b([a-z][a-z']*)\b/g, (m) => m.charAt(0).toUpperCase() + m.slice(1));
}

function resolveLocalizedText(raw: string | null, locService?: MissionLocalizationAdapter): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('@') && locService) {
    const resolved = locService.resolveKey(trimmed);
    return resolved?.trim() || null;
  }
  return trimmed;
}

export function extractMissions(ctx: DataForgeService, locService?: MissionLocalizationAdapter): MissionRecord[] {
  const records = ctx.searchByStructType('^ContractTemplate$', 99999);
  if (!records.length) {
    logger.warn('ContractTemplate: no records found in DataForge');
    return [];
  }

  // Build MissionType UUID → display name map
  const missionTypeUuidToName = new Map<string, string>();
  const mtRecords = ctx.searchByStructType('^MissionType$', 99999);
  for (const mt of mtRecords) {
    const mtData = ctx.readRecordByGuid(mt.uuid, 2) as Record<string, unknown> | null;
    const locKey = mtData?.LocalisedTypeName as string | undefined;
    let displayName: string | null = null;
    if (locKey && locService && locKey.startsWith('@')) {
      const resolved = locService.resolveKey(locKey);
      if (resolved && !isLocEmpty(resolved) && resolved !== 'null') {
        displayName = resolved;
      }
    }
    if (!displayName) {
      displayName = mt.name.replace(/^MissionType\./, '');
    }
    missionTypeUuidToName.set(mt.uuid, displayName ?? mt.name.replace(/^MissionType\./, ''));
  }
  logger.info(`Built MissionType map: ${missionTypeUuidToName.size} entries`);

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

      // -------------------------------------------------------------
      // NEW: Retrieve rewards from properties (Alpha 3.23 / 4.0 data)
      // -------------------------------------------------------------
      const props = (data.contractProperties as Array<any>) || [];
      const rewardProps = props.filter(p => /(reward|payout|Price_BP)/i.test(p.missionVariableName || ''));
      for (const p of rewardProps) {
        const pOpts = p.value?.options;
        if (Array.isArray(pOpts)) {
          for (const opt of pOpts) {
             const val = opt.value;
             if (typeof val === 'number' && val > 0) {
               if (rewardMin === null || val < rewardMin) rewardMin = val;
               if (rewardMax === null || val > rewardMax) rewardMax = val;
             }
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
      const location = (data.contractLocation ?? data.location ?? cc.targetLocation ?? params.location) as
        | Record<string, unknown>
        | string
        | undefined;
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

      const repReq = (data.reputationRequirements ?? data.requiredReputation ?? cc.reputationRequirements) as
        | Record<string, unknown>
        | number
        | undefined;
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

      // ── Base XP ──
      let baseXp: number | null = null;
      const xpReward = (rewards?.experienceReward ?? rewards?.xpReward ?? data.experienceReward) as
        | Record<string, unknown>
        | number
        | undefined;
      if (typeof xpReward === 'number' && xpReward > 0) {
        baseXp = xpReward;
      } else if (xpReward && typeof xpReward === 'object') {
        const val = xpReward.amount ?? xpReward.value ?? xpReward.baseXP ?? xpReward.base;
        if (typeof val === 'number' && val > 0) baseXp = val;
      }

      // ── Category ──
      const category = deriveMissionCategory(className);

      // ── Unique vs Repeatable ──
      const isUnique = !!(
        params.isUnique ??
        data.isUnique ??
        (autoFinish.maxCompletions != null && (autoFinish.maxCompletions as number) === 1)
      );

      // ── Blueprint Reward ──
      let hasBlueprintReward = false;
      let blueprintRewardUuid: string | null = null;
      if (rewards?.unlockBlueprintReward) {
        hasBlueprintReward = true;
        const u = Array.isArray(rewards.unlockBlueprintReward) 
          ? rewards.unlockBlueprintReward[0] 
          : rewards.unlockBlueprintReward;
        if (u?.value) blueprintRewardUuid = u.value;
      }
      if (!blueprintRewardUuid && rewards?.craftingBlueprintReward) {
        hasBlueprintReward = true;
        const c = Array.isArray(rewards.craftingBlueprintReward) 
          ? rewards.craftingBlueprintReward[0] 
          : rewards.craftingBlueprintReward;
        if (c?.value) blueprintRewardUuid = c.value;
      }
      if (!blueprintRewardUuid && rewards?.blueprintReward) {
        hasBlueprintReward = true;
        const b = Array.isArray(rewards.blueprintReward) 
          ? rewards.blueprintReward[0] 
          : rewards.blueprintReward;
        if (b?.value) blueprintRewardUuid = b.value;
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

      const resTitle = resolveLocalizedText(resolveStr(rawTitle), locService);
      const resDesc = resolveLocalizedText(resolveStr(rawDesc), locService);

      const localizedClassName = locService?.resolveComponentName?.(className) ?? null;
      let title = isLocEmpty(resTitle) ? (localizedClassName || humanizeMissionClassName(className)) : resTitle;
      title = cleanRuntimePlaceholderTokens(title);
      // After stripping, if title is null/empty or still a bare `<…>` placeholder, fall back to class name
      if (!title || /^<[^<>]+>$/.test(title.trim())) {
        title = localizedClassName || humanizeMissionClassName(className);
      }

      const description = isLocEmpty(resDesc) ? null : cleanRuntimePlaceholderTokens(resDesc);

      const resolveEntityLabel = (value: string | null): string | null => {
        if (!value) return null;
        let resolved = resolveLocalizedText(value, locService);
        if (isLocEmpty(resolved)) return null;
        return cleanRuntimePlaceholderTokens(resolved);
      };

      faction = resolveEntityLabel(faction);
      missionGiver = resolveEntityLabel(missionGiver);
      locationSystem = resolveEntityLabel(locationSystem);
      locationPlanet = resolveEntityLabel(locationPlanet);
      locationName = resolveEntityLabel(locationName);

      // ── Mission Type from DataForge (contractDisplayInfo.type.__ref) ──
      const mtRef = (displayInfo.type as Record<string, unknown> | undefined)?.__ref as string | undefined;
      const missionType = (mtRef && missionTypeUuidToName.get(mtRef)) || deriveMissionType(className);

      results.push({
        uuid: r.uuid,
        className,
        title,
        description,
        missionType,
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
        baseXp,
        category,
        isUnique,
        hasBlueprintReward,
        blueprintRewardUuid,
        buyInAmount: null,
      });
    } catch (e) {
      logger.debug(`Mission extract error [${r.name}]: ${(e as Error).message}`);
    }
  }

  logger.info(`Extracted ${results.length} mission templates from ${records.length} ContractTemplate records`);
  return results;
}

// ── Mission → Blueprint M2M links (via ContractGenerator) ─────────────────

export interface MissionBlueprintLink {
  missionUuid: string;
  blueprintUuid: string;
}

/**
 * Extracts mission → craft-blueprint M2M links by parsing ContractGenerator records.
 *
 * Each ContractGenerator links a ContractTemplate (mission) to a BlueprintPoolRecord.
 * Each pool contains multiple CraftingBlueprintRecord UUIDs.
 * This function returns one {missionUuid, blueprintUuid} pair per combination.
 */
export function extractMissionBlueprintLinks(ctx: DataForgeService): MissionBlueprintLink[] {
  // Build lookup sets
  const missionRecs = ctx.searchByStructType('^ContractTemplate$', 99999);
  const missionUuidSet = new Set(missionRecs.map((r) => r.uuid));

  const poolRecs = ctx.searchByStructType('^BlueprintPoolRecord$', 1000);
  const poolUuidSet = new Set(poolRecs.map((r) => r.uuid));

  // For each contrat generator, scan all __ref UUIDs to find mission + pool pairs
  const generators = ctx.searchByStructType('^ContractGenerator$', 9999);
  if (!generators.length) {
    logger.warn('ContractGenerator: no records found in DataForge');
    return [];
  }

  // Pool UUID → individual blueprint UUIDs
  const poolBlueprintsCache = new Map<string, string[]>();

  function getBlueprintsForPool(poolUuid: string): string[] {
    if (poolBlueprintsCache.has(poolUuid)) return poolBlueprintsCache.get(poolUuid)!;
    try {
      const poolData = ctx.readRecordByGuid(poolUuid, 8) as Record<string, unknown>;
      const poolJson = JSON.stringify(poolData);
      const refs: string[] = [];
      for (const m of poolJson.matchAll(/"__ref":\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g)) {
        const uuid = m[1];
        if (uuid !== '00000000-0000-0000-0000-000000000000' && !poolUuidSet.has(uuid) && !missionUuidSet.has(uuid)) {
          refs.push(uuid);
        }
      }
      poolBlueprintsCache.set(poolUuid, refs);
      return refs;
    } catch {
      poolBlueprintsCache.set(poolUuid, []);
      return [];
    }
  }

  const links: MissionBlueprintLink[] = [];
  const seen = new Set<string>();

  for (const g of generators) {
    try {
      const data = ctx.readRecordByGuid(g.uuid, 10) as Record<string, unknown>;
      const json = JSON.stringify(data);

      const missionUuids: string[] = [];
      const poolUuids: string[] = [];

      for (const m of json.matchAll(/"__ref":\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g)) {
        const uuid = m[1];
        if (uuid === '00000000-0000-0000-0000-000000000000') continue;
        if (missionUuidSet.has(uuid)) missionUuids.push(uuid);
        else if (poolUuidSet.has(uuid)) poolUuids.push(uuid);
      }

      for (const missionUuid of missionUuids) {
        for (const poolUuid of poolUuids) {
          const blueprintUuids = getBlueprintsForPool(poolUuid);
          for (const blueprintUuid of blueprintUuids) {
            const key = `${missionUuid}:${blueprintUuid}`;
            if (!seen.has(key)) {
              seen.add(key);
              links.push({ missionUuid, blueprintUuid });
            }
          }
        }
      }
    } catch (e) {
      logger.debug(`ContractGenerator extract error [${g.name}]: ${(e as Error).message}`);
    }
  }

  logger.info(`Extracted ${links.length} mission→blueprint links from ${generators.length} ContractGenerator records`);
  return links;
}

// ── Mission faction/giver enrichment (via ContractGenerator) ──────────────

export interface MissionFactionData {
  faction: string | null;
  missionGiver: string | null;
}

/**
 * Extracts faction and missionGiver for each ContractTemplate UUID
 * by scanning ContractGenerator records.
 *
 * The ContractGenerator's `contractParams.stringParamOverrides` contains
 * a "Contractor" param whose value is a LOC key resolved to the faction name.
 * Each generator also references ContractTemplate UUIDs via `__ref`.
 *
 * Returns a Map of mission UUID → faction/giver data.
 */
export function extractMissionFactionData(
  ctx: DataForgeService,
  locService: MissionLocalizationAdapter,
): Map<string, MissionFactionData> {
  const missionRecs = ctx.searchByStructType('^ContractTemplate$', 99999);
  const missionUuidSet = new Set(missionRecs.map((r) => r.uuid));

  const generators = ctx.searchByStructType('^ContractGenerator$', 9999);

  const result = new Map<string, MissionFactionData>();

  for (const g of generators) {
    try {
      const data = ctx.readRecordByGuid(g.uuid, 6) as Record<string, unknown>;
      const gens = Array.isArray(data.generators) ? (data.generators as Record<string, unknown>[]) : [data];

      let contractorKey = '';
      for (const gen of gens) {
        const overrides = (gen.contractParams as Record<string, unknown> | undefined)
          ?.stringParamOverrides as Array<Record<string, unknown>> | undefined;
        const cp = overrides?.find((p) => p.param === 'Contractor');
        if (cp?.value && typeof cp.value === 'string') {
          contractorKey = cp.value;
          break;
        }
      }

      const faction = contractorKey ? (locService.resolveKey(contractorKey) ?? null) : null;
      const missionGiver = faction; // missionGiver = same as faction for ContractGenerator-based missions

      if (!faction) continue;

      // Find all ContractTemplate UUIDs referenced in this generator
      const json = JSON.stringify(data);
      for (const m of json.matchAll(/"__ref":\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g)) {
        const uuid = m[1];
        if (uuid === '00000000-0000-0000-0000-000000000000') continue;
        if (missionUuidSet.has(uuid) && !result.has(uuid)) {
          result.set(uuid, { faction, missionGiver });
        }
      }
    } catch (e) {
      logger.debug(`ContractGenerator faction extract error [${g.name}]: ${(e as Error).message}`);
    }
  }

  logger.info(`Extracted faction data for ${result.size} missions from ContractGenerator records`);
  return result;
}

// ── Mission enrichment from MissionBrokerEntry (rewards, difficulty, buy-in, reputation) ──

export interface MissionMbeData {
  rewardMin: number | null;
  rewardMax: number | null;
  dangerLevel: number | null;
  buyInAmount: number | null;
  reputationReward: number | null;
  missionGiver: string | null;
}

/** Normalise a CT or MBE name into comparable tokens */
function tokenizeMissionName(name: string): string[] {
  return name
    .replace(/^(MissionBrokerEntry\.|ContractTemplate\.)/, '')
    .replace(/^PU_/i, '')
    .split('_')
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3 && t !== 'template' && t !== 'pu' && !/^\d+$/.test(t));
}

/** Compute a similarity score in [0,1] between two token arrays */
function tokenMatchScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  let shared = 0;
  for (const ta of a) {
    for (const tb of b) {
      if (ta === tb || ta.startsWith(tb) || tb.startsWith(ta)) {
        shared++;
        break;
      }
    }
  }
  return shared / Math.max(a.length, b.length);
}

/**
 * Matches ContractTemplate records to MissionBrokerEntry records by token similarity,
 * then aggregates reward/difficulty/buy-in/reputation data per CT UUID.
 *
 * Uses a score-based matching: for each CT, find all MBE with score >= threshold,
 * keeping the best match tier (if best score ≥ 0.5, use ≥0.5; else use ≥0.33).
 *
 * Also extracts faction/missionGiver from MBE when the value is a static string
 * (not a runtime ~mission() token) — used as fallback when ContractGenerator has no data.
 */
export function extractMissionMbeEnrichment(
  ctx: DataForgeService,
  locService?: MissionLocalizationAdapter,
): Map<string, MissionMbeData> {
  const ctRecords = ctx.searchByStructType('^ContractTemplate$', 99999);
  const mbeRecords = ctx.searchByStructType('^MissionBrokerEntry$', 99999);

  // Build SReputationRewardAmount UUID → amount map
  const repRewardMap = new Map<string, number>();
  const repRecords = ctx.searchByStructType('^SReputationRewardAmount$', 99999);
  for (const rr of repRecords) {
    const d = ctx.readRecordByGuid(rr.uuid, 2) as Record<string, unknown> | null;
    if (typeof d?.reputationAmount === 'number') {
      repRewardMap.set(rr.uuid, d.reputationAmount as number);
    }
  }

  // Pre-compute MBE token index with all data (read all MBEs once)
  const mbeIndex: Array<{
    uuid: string;
    name: string;
    tokens: string[];
    reward: number;
    rewardMax: number;
    diff: number;
    buyIn: number;
    repAmount: number | null;
    giverResolved: string | null;
  }> = [];
  for (const mbe of mbeRecords) {
    const d = ctx.readRecordByGuid(mbe.uuid, 3) as Record<string, unknown> | null;
    if (!d) continue;
    const mr = d.missionReward as Record<string, unknown> | undefined;
    const repRef = (mr?.reputationBonus as Record<string, unknown> | undefined)?.__ref as string | undefined;

    // Resolve missionGiver only when not a runtime token
    let giverResolved: string | null = null;
    const giverKey = d.missionGiver as string | undefined;
    if (giverKey && giverKey !== '@LOC_UNINITIALIZED' && giverKey !== '@LOC_EMPTY' && locService) {
      const resolved = giverKey.startsWith('@') ? (locService.resolveKey(giverKey) ?? null) : giverKey;
      if (resolved && !resolved.includes('~mission(') && !resolved.includes('UNINITIALIZED') && !resolved.includes('PLACEHOLDER') && resolved !== 'null') {
        giverResolved = resolved;
      }
    }

    mbeIndex.push({
      uuid: mbe.uuid,
      name: mbe.name.replace(/^MissionBrokerEntry\./, ''),
      tokens: tokenizeMissionName(mbe.name),
      reward: (mr?.reward as number) ?? 0,
      rewardMax: (mr?.max as number) ?? 0,
      diff: (d.missionDifficulty as number) ?? -1,
      buyIn: (d.missionBuyInAmount as number) ?? 0,
      repAmount: repRef && repRef !== '00000000-0000-0000-0000-000000000000' ? (repRewardMap.get(repRef) ?? null) : null,
      giverResolved,
    });
  }

  logger.info(`MBE index built: ${mbeIndex.length} entries, ${repRewardMap.size} rep amounts`);

  const result = new Map<string, MissionMbeData>();
  let coveredCTs = 0;

  for (const ct of ctRecords) {
    const ctTokens = tokenizeMissionName(ct.name);

    // Find best score among all MBE
    let bestScore = 0;
    for (const m of mbeIndex) {
      const s = tokenMatchScore(ctTokens, m.tokens);
      if (s > bestScore) bestScore = s;
    }

    if (bestScore < 0.33) continue;

    // Keep all MBE within the best tier
    const threshold = bestScore >= 0.5 ? 0.5 : 0.33;
    const matching = mbeIndex.filter((m) => tokenMatchScore(ctTokens, m.tokens) >= threshold);

    const rewards: number[] = [];
    const diffs: number[] = [];
    const buyIns: number[] = [];
    const repAmounts: number[] = [];
    const giverCounts = new Map<string, number>();

    for (const m of matching) {
      const effectiveReward = m.rewardMax > 0 ? m.rewardMax : m.reward;
      if (m.reward > 0) rewards.push(m.reward);
      if (effectiveReward > m.reward) rewards.push(effectiveReward);
      if (m.diff > 0) diffs.push(m.diff);
      if (m.buyIn > 0) buyIns.push(m.buyIn);
      if (m.repAmount !== null && m.repAmount > 0) repAmounts.push(m.repAmount);
      if (m.giverResolved) giverCounts.set(m.giverResolved, (giverCounts.get(m.giverResolved) ?? 0) + 1);
    }

    // Most common static missionGiver
    let missionGiver: string | null = null;
    if (giverCounts.size > 0) {
      missionGiver = [...giverCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    const rewardMin = rewards.length ? Math.min(...rewards) : null;
    const rewardMaxVal = rewards.length ? Math.max(...rewards) : null;

    // Mode of difficulties
    let dangerLevel: number | null = null;
    if (diffs.length) {
      const freq = new Map<number, number>();
      for (const d of diffs) freq.set(d, (freq.get(d) ?? 0) + 1);
      dangerLevel = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    const buyInAmount = buyIns.length ? Math.max(...buyIns) : null;
    const reputationReward = repAmounts.length ? Math.max(...repAmounts) : null;

    if (rewardMin !== null || dangerLevel !== null || buyInAmount !== null || reputationReward !== null || missionGiver !== null) {
      coveredCTs++;
      result.set(ct.uuid, { rewardMin, rewardMax: rewardMaxVal, dangerLevel, buyInAmount, reputationReward, missionGiver });
    }
  }

  logger.info(`MBE enrichment: ${coveredCTs} CTs have data (rewards/difficulty/buyIn/reputation)`);
  return result;
}
