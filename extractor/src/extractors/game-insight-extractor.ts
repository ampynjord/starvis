import { createHash } from 'node:crypto';
import type { DataForgeService } from '../dataforge/dataforge-service.js';
import type { DataForgeContext } from '../dataforge/dataforge-utils.js';

export interface GameInsightRecord {
  uuid: string;
  category: string;
  sourceType: string;
  className: string | null;
  name: string | null;
  subtype: string | null;
  relatedClass: string | null;
  relatedUuid: string | null;
  locationHint: string | null;
  faction: string | null;
  reputationKey: string | null;
  valueNumeric: number | null;
  valueText: string | null;
  p4kPath: string | null;
  rawJson: Record<string, unknown> | null;
}

interface StructRule {
  category: string;
  pattern: RegExp;
  max: number;
}

interface PathRule {
  category: string;
  pattern: RegExp;
  subtype?: string;
  max: number;
}

const STRUCT_RULES: StructRule[] = [
  { category: 'faction', pattern: /Faction|Organization|Affiliation/i, max: 2000 },
  { category: 'reputation', pattern: /Reputation|Standing|Affinity/i, max: 2000 },
  { category: 'loot', pattern: /Loot|Reward|Drop|Pool|BlueprintPool/i, max: 3000 },
  { category: 'navigation', pattern: /JumpPoint|Quantum|Route|Nav|Astro|Starmap/i, max: 2500 },
  { category: 'environment', pattern: /Atmosphere|Weather|Biome|Hazard|Temperature|Climate|Planetary/i, max: 2500 },
  { category: 'service', pattern: /Service|Repair|Refuel|Restock|Clinic|Hospital|Hangar|Landing/i, max: 2500 },
  { category: 'medical', pattern: /Medical|Drug|Injury|ActorStatus|Consumable|Healing/i, max: 2500 },
  { category: 'fps_detail', pattern: /Ammo|Projectile|FireMode|WeaponAction|Magazine|Attachment|Recoil|Spread/i, max: 3000 },
  { category: 'shop_inventory', pattern: /Shop|Vendor|Inventory|Price|Purchasable/i, max: 3500 },
];

const PATH_RULES: PathRule[] = [
  { category: 'loot', pattern: /\/(?:loot|rewards?|blueprints?|containers?)\//i, max: 3000 },
  { category: 'reputation', pattern: /\/(?:reputation|faction|affinity|standing)\//i, max: 2000 },
  { category: 'navigation', pattern: /\/(?:jumppoint|quantum|nav|route|starmap)\//i, max: 2500 },
  { category: 'environment', pattern: /\/(?:weather|biome|hazard|atmosphere|climate|temperature)\//i, max: 2500 },
  { category: 'service', pattern: /\/(?:services?|repair|refuel|restock|clinic|hospital|hangar|landing)\//i, max: 2500 },
  { category: 'medical', pattern: /\/(?:medical|drug|injury|actorstatus|healing)\//i, max: 2500 },
  { category: 'fps_detail', pattern: /\/fps_weapons\/|\/magazines\/|\/weapon_modifier\/|\/ammo\/|\/projectile/i, max: 3000 },
  { category: 'shop_inventory', pattern: /\/(?:shop|shops|vendor|inventory|purchasable|price)\//i, max: 3500 },
];

const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

function stableUuid(seed: string): string {
  const hex = createHash('sha1').update(seed).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/^(EntityClassDefinition|ContractTemplate|MissionType|ShopFranchise|StarMapObject)\./, '')
    .replace(/_/g, ' ')
    .trim();
  return text || null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function refUuid(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const ref = (value as Record<string, unknown>).__ref;
  return typeof ref === 'string' && ref !== ZERO_GUID ? ref : null;
}

function inferSubtype(category: string, sourceType: string, fileName: string | null, data: Record<string, unknown> | null): string | null {
  const text = `${sourceType} ${fileName ?? ''}`.toLowerCase();
  if (category === 'service') {
    if (text.includes('repair')) return 'repair';
    if (text.includes('refuel')) return 'refuel';
    if (text.includes('restock') || text.includes('rearm')) return 'restock';
    if (text.includes('clinic') || text.includes('hospital')) return 'medical';
    if (text.includes('hangar') || text.includes('landing')) return 'landing';
  }
  if (category === 'navigation') {
    if (text.includes('jump')) return 'jump_point';
    if (text.includes('quantum')) return 'quantum';
    if (text.includes('route')) return 'route';
  }
  if (category === 'fps_detail') {
    if (text.includes('magazine')) return 'magazine';
    if (text.includes('ammo') || text.includes('projectile')) return 'ammo';
    if (text.includes('attachment') || text.includes('modifier')) return 'attachment';
    if (text.includes('firemode') || text.includes('fire_mode')) return 'fire_mode';
  }
  if (category === 'loot') {
    if (text.includes('blueprint')) return 'blueprint';
    if (text.includes('reward')) return 'reward';
    if (text.includes('pool')) return 'pool';
  }
  return firstString(data?.type, data?.Type, data?.subType, data?.SubType);
}

function summarizeRecord(
  ctx: DataForgeContext,
  category: string,
  sourceType: string,
  uuid: string,
  recordName: string | undefined,
  fileName: string | undefined,
  data: Record<string, unknown> | null,
): GameInsightRecord {
  const className = recordName?.replace(/^[^.]+\./, '') ?? null;
  const displayInfo = (data?.displayInfo ?? data?.contractDisplayInfo ?? data?.displayName) as Record<string, unknown> | string | undefined;
  const name =
    firstString(
      typeof displayInfo === 'string' ? displayInfo : null,
      typeof displayInfo === 'object' ? displayInfo?.name : null,
      data?.name,
      data?.Name,
      data?.displayName,
      data?.DisplayName,
      data?.title,
      data?.Title,
    ) ?? cleanName(className);

  const relatedUuid =
    refUuid(data?.item) ??
    refUuid(data?.Item) ??
    refUuid(data?.entityClass) ??
    refUuid(data?.entityClassReference) ??
    refUuid(data?.reward) ??
    refUuid(data?.Reward) ??
    refUuid(data?.faction) ??
    refUuid(data?.Faction);

  return {
    uuid: uuid && uuid !== ZERO_GUID ? uuid : stableUuid(`${category}:${sourceType}:${recordName ?? ''}:${fileName ?? ''}`),
    category,
    sourceType,
    className,
    name,
    subtype: inferSubtype(category, sourceType, fileName ?? null, data),
    relatedClass: relatedUuid
      ? (ctx.resolveGuid(relatedUuid) ?? null)
      : firstString(data?.entityClassName, data?.itemClassName, data?.rewardClassName),
    relatedUuid,
    locationHint: firstString(data?.location, data?.Location, data?.locationName, data?.system, data?.System),
    faction: firstString(data?.faction, data?.Faction, data?.factionName, data?.organization, data?.affiliation),
    reputationKey: firstString(data?.reputation, data?.Reputation, data?.reputationKey, data?.standing, data?.affinity),
    valueNumeric: firstNumber(data?.value, data?.Value, data?.amount, data?.Amount, data?.price, data?.Price, data?.reward, data?.Reward),
    valueText: firstString(data?.description, data?.Description, data?.label, data?.Label),
    p4kPath: fileName ?? null,
    rawJson: data ? { recordName, sourceType, fileName, data } : { recordName, sourceType, fileName },
  };
}

export function extractGameInsights(ctx: DataForgeService, onProgress?: (msg: string) => void): GameInsightRecord[] {
  const dfData = ctx.getDfData();
  if (!dfData) return [];

  const insights = new Map<string, GameInsightRecord>();
  const categoryCounts = new Map<string, number>();

  const add = (record: GameInsightRecord) => {
    const key = `${record.category}:${record.uuid}`;
    if (!insights.has(key)) insights.set(key, record);
  };

  for (const rule of STRUCT_RULES) {
    const records = ctx.searchByStructType(rule.pattern.source, rule.max);
    categoryCounts.set(rule.category, (categoryCounts.get(rule.category) ?? 0) + records.length);
    for (const rec of records) {
      const data = ctx.readRecordByGuid(rec.uuid, 4) as Record<string, unknown> | null;
      add(summarizeRecord(ctx, rule.category, rec.structType, rec.uuid, rec.name, rec.fileName, data));
    }
  }

  const entityClassIdx = dfData.structDefs.findIndex((s) => s.name === 'EntityClassDefinition');
  if (entityClassIdx !== -1) {
    const pathRuleCounts = new Map<string, number>();
    for (const rec of dfData.records) {
      if (rec.structIndex !== entityClassIdx) continue;
      const fileName = (rec.fileName ?? '').replace(/\\/g, '/');
      if (!fileName) continue;
      for (const rule of PATH_RULES) {
        const current = pathRuleCounts.get(rule.category) ?? 0;
        if (current >= rule.max || !rule.pattern.test(fileName)) continue;
        pathRuleCounts.set(rule.category, current + 1);
        const data = ctx.readInstance(rec.structIndex, rec.instanceIndex, 0, 4);
        add(
          summarizeRecord(
            ctx,
            rule.category,
            'EntityClassDefinition',
            rec.id,
            rec.name,
            rec.fileName,
            data as Record<string, unknown> | null,
          ),
        );
      }
    }
  }

  const result = [...insights.values()];
  const summary = [...categoryCounts.entries()].map(([category, count]) => `${category}:${count}`).join(', ');
  onProgress?.(`Game insights: ${result.length} records extracted (${summary || 'no struct matches'})`);
  return result;
}
