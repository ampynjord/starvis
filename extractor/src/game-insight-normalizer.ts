import type { GameInsightRecord } from './game-insight-extractor.js';

type RawObject = Record<string, unknown>;

export interface DerivedGameInsightData {
  factions: GameFactionRecord[];
  reputationStandings: ReputationStandingRecord[];
  reputationScopes: ReputationScopeRecord[];
  lootTables: LootTableRecord[];
  lootTableEntries: LootTableEntryRecord[];
  lootArchetypes: LootArchetypeRecord[];
  blueprintRewards: BlueprintRewardRecord[];
  ammo: AmmoRecord[];
  inventoryContainers: InventoryContainerRecord[];
}

export interface GameFactionRecord {
  uuid: string;
  className: string;
  name: string | null;
  description: string | null;
  factionType: string | null;
  defaultReaction: string | null;
  ableToArrest: boolean | null;
  noLegalRights: boolean | null;
  policesCriminality: boolean | null;
  policesLawfulTrespass: boolean | null;
  factionReputationUuid: string | null;
  allies: unknown[] | null;
  enemies: unknown[] | null;
  organizationTags: unknown[] | null;
  stringVariants: unknown[] | null;
  p4kPath: string | null;
  rawJson: RawObject | null;
}

export interface ReputationStandingRecord {
  uuid: string;
  className: string;
  name: string | null;
  displayName: string | null;
  description: string | null;
  icon: string | null;
  minReputation: number | null;
  driftTimeHours: number | null;
  driftReputation: number | null;
  gated: boolean;
  perkDescription: string | null;
  p4kPath: string | null;
  rawJson: RawObject | null;
}

export interface ReputationScopeRecord {
  uuid: string;
  className: string;
  scopeName: string | null;
  displayName: string | null;
  description: string | null;
  icon: string | null;
  initialReputation: number | null;
  reputationCeiling: number | null;
  standings: unknown[] | null;
  p4kPath: string | null;
  rawJson: RawObject | null;
}

export interface LootTableRecord {
  uuid: string;
  className: string;
  name: string | null;
  p4kPath: string | null;
  rawJson: RawObject | null;
}

export interface LootTableEntryRecord {
  tableUuid: string;
  tableClassName: string | null;
  entryIndex: number;
  archetypeUuid: string | null;
  archetypeClassName: string | null;
  weight: number | null;
  minResults: number | null;
  maxResults: number | null;
  rawJson: RawObject | null;
}

export interface LootArchetypeRecord {
  uuid: string;
  className: string;
  name: string | null;
  primaryEntries: unknown[] | null;
  secondaryEntries: unknown[] | null;
  excludedTags: unknown[] | null;
  p4kPath: string | null;
  rawJson: RawObject | null;
}

export interface BlueprintRewardRecord {
  poolUuid: string;
  poolClassName: string | null;
  rewardIndex: number;
  blueprintUuid: string | null;
  blueprintClassName: string | null;
  weight: number | null;
  rawJson: RawObject | null;
}

export interface AmmoRecord {
  uuid: string;
  className: string;
  name: string | null;
  size: number | null;
  speed: number | null;
  lifetime: number | null;
  ammoCategory: string | null;
  conversionRateMicroScu: number | null;
  damagePhysical: number | null;
  damageEnergy: number | null;
  damageDistortion: number | null;
  damageThermal: number | null;
  damageBiochemical: number | null;
  damageStun: number | null;
  explosionDamagePhysical: number | null;
  explosionDamageEnergy: number | null;
  explosionDamageDistortion: number | null;
  explosionDamageThermal: number | null;
  explosionDamageBiochemical: number | null;
  explosionDamageStun: number | null;
  impactRadius: number | null;
  explosionMinRadius: number | null;
  explosionMaxRadius: number | null;
  mass: number | null;
  p4kPath: string | null;
  rawJson: RawObject | null;
}

export interface InventoryContainerRecord {
  uuid: string;
  className: string;
  name: string | null;
  inventoryType: string | null;
  capacityMicroScu: number | null;
  capacityScu: number | null;
  sizeX: number | null;
  sizeY: number | null;
  sizeZ: number | null;
  excludedItemSubtypes: unknown[] | null;
  p4kPath: string | null;
  rawJson: RawObject | null;
}

const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

function obj(value: unknown): RawObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawObject) : null;
}

function arr(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function numAny(data: RawObject, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = num(data[key]);
    if (value != null) return value;
  }
  return null;
}

function int(value: unknown): number | null {
  const n = num(value);
  return n == null ? null : Math.trunc(n);
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function refUuid(value: unknown): string | null {
  const ref = obj(value)?.__ref;
  return typeof ref === 'string' && ref !== ZERO_GUID ? ref : null;
}

function refClass(value: unknown): string | null {
  const name = obj(value)?.__name;
  return typeof name === 'string' && name.trim() ? name.replace(/^[^.]+\./, '') : null;
}

function rawData(record: GameInsightRecord): RawObject | null {
  return obj(record.rawJson?.data);
}

function className(record: GameInsightRecord): string | null {
  return record.className || str(record.rawJson?.recordName)?.replace(/^[^.]+\./, '') || null;
}

function pushUniqueByKey<T>(target: T[], seen: Set<string>, key: string, record: T): void {
  if (seen.has(key)) return;
  seen.add(key);
  target.push(record);
}

function normalizeTagEntries(value: unknown): unknown[] | null {
  const entries = arr(obj(value)?.entries);
  if (!entries) return null;
  return entries.map((entry) => {
    const e = obj(entry) ?? {};
    return {
      name: str(e.name),
      weight: num(e.weight),
      tagUuid: refUuid(e.tag),
      tagClassName: refClass(e.tag),
      additionalTags: arr(e.additionalTags),
      raw: e,
    };
  });
}

export function buildDerivedGameInsightData(records: GameInsightRecord[]): DerivedGameInsightData {
  const result: DerivedGameInsightData = {
    factions: [],
    reputationStandings: [],
    reputationScopes: [],
    lootTables: [],
    lootTableEntries: [],
    lootArchetypes: [],
    blueprintRewards: [],
    ammo: [],
    inventoryContainers: [],
  };
  const seen = {
    factions: new Set<string>(),
    reputationStandings: new Set<string>(),
    reputationScopes: new Set<string>(),
    lootTables: new Set<string>(),
    lootArchetypes: new Set<string>(),
    ammo: new Set<string>(),
    inventoryContainers: new Set<string>(),
  };

  for (const record of records) {
    const data = rawData(record);
    const cn = className(record);
    if (!data || !cn) continue;

    if (record.sourceType === 'Faction' || record.sourceType === 'Faction_LEGACY' || record.sourceType === 'MissionOrganization') {
      pushUniqueByKey(result.factions, seen.factions, cn, {
        uuid: record.uuid,
        className: cn,
        name: record.name,
        description: str(data.description),
        factionType: str(data.factionType),
        defaultReaction: str(data.defaultReaction),
        ableToArrest: bool(data.ableToArrest),
        noLegalRights: bool(data.noLegalRights),
        policesCriminality: bool(data.policesCriminality),
        policesLawfulTrespass: bool(data.policesLawfulTrespass),
        factionReputationUuid: refUuid(data.factionReputationRef) ?? refUuid(data.factionReputation),
        allies: arr(data.alliedFactions),
        enemies: arr(data.enemyFactions),
        organizationTags: arr(data.organizationTags),
        stringVariants: arr(obj(data.stringVariants)?.variants),
        p4kPath: record.p4kPath,
        rawJson: record.rawJson,
      });
    }

    if (record.sourceType === 'SReputationStandingParams') {
      pushUniqueByKey(result.reputationStandings, seen.reputationStandings, cn, {
        uuid: record.uuid,
        className: cn,
        name: str(data.name) ?? record.name,
        displayName: str(data.displayName),
        description: str(data.description),
        icon: str(data.icon),
        minReputation: int(data.minReputation),
        driftTimeHours: num(data.driftTimeHours),
        driftReputation: int(data.driftReputation),
        gated: bool(data.gated) ?? false,
        perkDescription: str(data.perkDescription),
        p4kPath: record.p4kPath,
        rawJson: record.rawJson,
      });
    }

    if (record.sourceType === 'SReputationScopeParams') {
      const standingRefs = arr(obj(data.standingMap)?.standings)?.map((standing) => ({
        uuid: refUuid(standing),
        className: refClass(standing),
        raw: standing,
      }));
      pushUniqueByKey(result.reputationScopes, seen.reputationScopes, cn, {
        uuid: record.uuid,
        className: cn,
        scopeName: str(data.scopeName),
        displayName: str(data.displayName),
        description: str(data.description),
        icon: str(data.icon),
        initialReputation: int(data.initialReputation),
        reputationCeiling: int(data.reputationCeiling),
        standings: standingRefs ?? null,
        p4kPath: record.p4kPath,
        rawJson: record.rawJson,
      });
    }

    if (record.sourceType === 'LootTable') {
      pushUniqueByKey(result.lootTables, seen.lootTables, cn, {
        uuid: record.uuid,
        className: cn,
        name: record.name,
        p4kPath: record.p4kPath,
        rawJson: record.rawJson,
      });
      const entries = arr(data.lootArchetypes) ?? [];
      entries.forEach((entry, index) => {
        const e = obj(entry) ?? {};
        const constraints = obj(e.numberOfResultsConstraints) ?? {};
        result.lootTableEntries.push({
          tableUuid: record.uuid,
          tableClassName: cn,
          entryIndex: index,
          archetypeUuid: refUuid(e.archetype),
          archetypeClassName: refClass(e.archetype),
          weight: num(e.weight),
          minResults: int(constraints.minResults),
          maxResults: int(constraints.maxResults),
          rawJson: e,
        });
      });
    }

    if (record.sourceType === 'LootArchetype' || record.sourceType === 'LootArchetypeV3Record') {
      pushUniqueByKey(result.lootArchetypes, seen.lootArchetypes, cn, {
        uuid: record.uuid,
        className: cn,
        name: record.name,
        primaryEntries: normalizeTagEntries(data.primaryOrGroup),
        secondaryEntries: normalizeTagEntries(data.secondaryOrGroup),
        excludedTags: arr(data.excludedTags),
        p4kPath: record.p4kPath,
        rawJson: record.rawJson,
      });
    }

    if (record.sourceType === 'BlueprintPoolRecord') {
      const rewards = arr(data.blueprintRewards) ?? [];
      rewards.forEach((reward, index) => {
        const r = obj(reward) ?? {};
        result.blueprintRewards.push({
          poolUuid: record.uuid,
          poolClassName: cn,
          rewardIndex: index,
          blueprintUuid: refUuid(r.blueprintRecord),
          blueprintClassName: refClass(r.blueprintRecord),
          weight: num(r.weight),
          rawJson: r,
        });
      });
    }

    if (record.sourceType === 'AmmoParams') {
      const projectileParams = obj(data.projectileParams) ?? {};
      const directDamage = obj(projectileParams.damage) ?? {};
      const detonation = obj(obj(projectileParams.detonationParams)?.explosionParams) ?? {};
      const explosionDamage = obj(detonation.damage) ?? {};
      const physicsType = obj(obj(data.physicsControllerParams)?.PhysType) ?? {};
      pushUniqueByKey(result.ammo, seen.ammo, cn, {
        uuid: record.uuid,
        className: cn,
        name: record.name,
        size: int(data.size),
        speed: num(data.speed),
        lifetime: num(data.lifetime),
        ammoCategory: str(data.ammoCategory),
        conversionRateMicroScu: num(obj(data.conversionRate)?.microSCU),
        damagePhysical: numAny(directDamage, 'physical', 'DamagePhysical'),
        damageEnergy: numAny(directDamage, 'energy', 'DamageEnergy'),
        damageDistortion: numAny(directDamage, 'distortion', 'DamageDistortion'),
        damageThermal: numAny(directDamage, 'thermal', 'DamageThermal'),
        damageBiochemical: numAny(directDamage, 'biochemical', 'DamageBiochemical'),
        damageStun: numAny(directDamage, 'stun', 'DamageStun'),
        explosionDamagePhysical: numAny(explosionDamage, 'physical', 'DamagePhysical'),
        explosionDamageEnergy: numAny(explosionDamage, 'energy', 'DamageEnergy'),
        explosionDamageDistortion: numAny(explosionDamage, 'distortion', 'DamageDistortion'),
        explosionDamageThermal: numAny(explosionDamage, 'thermal', 'DamageThermal'),
        explosionDamageBiochemical: numAny(explosionDamage, 'biochemical', 'DamageBiochemical'),
        explosionDamageStun: numAny(explosionDamage, 'stun', 'DamageStun'),
        impactRadius: num(projectileParams.impactRadius),
        explosionMinRadius: num(detonation.minRadius),
        explosionMaxRadius: num(detonation.maxRadius),
        mass: numAny(physicsType, 'mass', 'Mass'),
        p4kPath: record.p4kPath,
        rawJson: record.rawJson,
      });
    }

    if (record.sourceType === 'InventoryContainer') {
      const inventoryType = obj(data.inventoryType) ?? {};
      const capacityMicroScu = num(obj(inventoryType.capacity)?.microSCU);
      const dimensions = obj(inventoryType.interiorDimensions) ?? {};
      pushUniqueByKey(result.inventoryContainers, seen.inventoryContainers, cn, {
        uuid: record.uuid,
        className: cn,
        name: record.name,
        inventoryType: str(inventoryType.type),
        capacityMicroScu,
        capacityScu: capacityMicroScu == null ? null : capacityMicroScu / 1_000_000,
        sizeX: num(dimensions.x),
        sizeY: num(dimensions.y),
        sizeZ: num(dimensions.z),
        excludedItemSubtypes: arr(data.excludedItemSubTypes),
        p4kPath: record.p4kPath,
        rawJson: record.rawJson,
      });
    }
  }

  return result;
}
