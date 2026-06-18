/**
 * MISSIONS → missions + mission_blueprint_rewards tables
 */
import {
  extractMissionBlueprintLinks,
  extractMissionFactionData,
  extractMissionMbeEnrichment,
  extractMissions,
} from '../extractors/mission-extractor.js';
import { batchUpsert } from './batch.js';
import type { PersistContext } from './context.js';

export async function saveMissions(ctx: PersistContext): Promise<number> {
  const { conn, env, df, loc, onProgress } = ctx;
  const locAdapter = loc.isLoaded
    ? {
        resolveKey: (k: string) => loc.resolveKey(k) ?? null,
        resolveComponentName: (className: string) => loc.resolveComponentName(className),
      }
    : undefined;

  const missions = extractMissions(df, locAdapter);
  if (!missions.length) {
    onProgress?.('Missions: no ContractTemplate records found');
    return 0;
  }

  // Only store missions not flagged as dev-only
  const filtered = missions.filter((m) => !m.notForRelease && !m.workInProgress);
  onProgress?.(`Missions: ${filtered.length} usable out of ${missions.length} total`);

  const rows = filtered.map((m) => [
    env,
    m.uuid,
    m.className,
    m.title,
    m.description,
    m.missionType,
    m.canBeShared ? 1 : 0,
    m.onlyOwnerComplete ? 1 : 0,
    m.isLegal ? 1 : 0,
    m.completionTimeSecs != null ? Math.round(m.completionTimeSecs) : null,
    m.notForRelease ? 1 : 0,
    m.workInProgress ? 1 : 0,
    m.rewardMin != null ? Math.round(m.rewardMin) : null,
    m.rewardMax != null ? Math.round(m.rewardMax) : null,
    m.rewardCurrency,
    m.faction,
    m.missionGiver,
    m.locationSystem,
    m.locationPlanet,
    m.locationName,
    m.dangerLevel != null ? Math.round(m.dangerLevel) : null,
    m.requiredReputation != null ? Math.round(m.requiredReputation) : null,
    m.reputationReward != null ? Math.round(m.reputationReward) : null,
    m.baseXp != null ? Math.round(m.baseXp) : null,
    m.category,
    m.isUnique ? 1 : 0,
    m.hasBlueprintReward ? 1 : 0,
    m.blueprintRewardUuid,
    m.buyInAmount != null ? Math.round(m.buyInAmount) : null,
    m.p4kPath,
    m.rawJson ? JSON.stringify(m.rawJson) : null,
  ]);

  const saved = await batchUpsert(
    conn,
    `INSERT INTO game.missions
       (env, uuid, class_name, title, description, mission_type,
        can_be_shared, only_owner_complete, is_legal,
        completion_time_s, not_for_release, work_in_progress,
        reward_min, reward_max, reward_currency,
        faction, mission_giver,
        location_system, location_planet, location_name,
        danger_level, required_reputation, reputation_reward,
        base_xp, category, is_unique, has_blueprint_reward, blueprint_reward_uuid,
        buy_in_amount, p4k_path, raw_json)`,
    `(uuid, env) DO UPDATE SET
       class_name=EXCLUDED.class_name, title=EXCLUDED.title, description=EXCLUDED.description,
       mission_type=EXCLUDED.mission_type, can_be_shared=EXCLUDED.can_be_shared,
       only_owner_complete=EXCLUDED.only_owner_complete, is_legal=EXCLUDED.is_legal,
       completion_time_s=EXCLUDED.completion_time_s, not_for_release=EXCLUDED.not_for_release,
       work_in_progress=EXCLUDED.work_in_progress,
       reward_min=EXCLUDED.reward_min, reward_max=EXCLUDED.reward_max,
       reward_currency=EXCLUDED.reward_currency, faction=EXCLUDED.faction,
       mission_giver=EXCLUDED.mission_giver, location_system=EXCLUDED.location_system,
       location_planet=EXCLUDED.location_planet, location_name=EXCLUDED.location_name,
       danger_level=EXCLUDED.danger_level, required_reputation=EXCLUDED.required_reputation,
       reputation_reward=EXCLUDED.reputation_reward,
       base_xp=EXCLUDED.base_xp, category=EXCLUDED.category,
       is_unique=EXCLUDED.is_unique, has_blueprint_reward=EXCLUDED.has_blueprint_reward,
       blueprint_reward_uuid=EXCLUDED.blueprint_reward_uuid,
       buy_in_amount=EXCLUDED.buy_in_amount,
       p4k_path=EXCLUDED.p4k_path,
       raw_json=EXCLUDED.raw_json`,
    31,
    rows,
  );

  onProgress?.(`Missions: ${saved} records saved [${env}]`);

  // Enrich faction/missionGiver from ContractGenerator
  if (locAdapter) {
    onProgress?.('Missions: enriching faction/giver from ContractGenerator…');
    const factionData = extractMissionFactionData(df, locAdapter);
    if (factionData.size > 0) {
      let enriched = 0;
      for (const [uuid, d] of factionData.entries()) {
        if (!d.faction) continue;
        await conn.query('UPDATE game.missions SET faction=$1, mission_giver=$2 WHERE uuid=$3 AND env=$4', [
          d.faction,
          d.missionGiver,
          uuid,
          env,
        ]);
        enriched++;
      }
      if (enriched > 0) {
        onProgress?.(`Missions: faction enriched for ${enriched} missions`);
      }
    }
  }

  // Enrich rewards/difficulty/buy-in/reputation from MissionBrokerEntry matching
  onProgress?.('Missions: enriching rewards/difficulty/buy-in/reputation from MissionBrokerEntry…');
  const mbeData = extractMissionMbeEnrichment(df, locAdapter);
  if (mbeData.size > 0) {
    let mbeEnriched = 0;
    for (const [uuid, d] of mbeData.entries()) {
      await conn.query(
        `UPDATE game.missions SET
           reward_min        = COALESCE(reward_min, $1),
           reward_max        = COALESCE(reward_max, $2),
           reward_currency   = COALESCE(reward_currency, 'aUEC'),
           danger_level      = COALESCE(danger_level, $3),
           buy_in_amount     = COALESCE(buy_in_amount, $4),
           reputation_reward = COALESCE(reputation_reward, $5),
           mission_giver     = COALESCE(mission_giver, $6)
         WHERE uuid = $7 AND env = $8`,
        [d.rewardMin, d.rewardMax, d.dangerLevel, d.buyInAmount, d.reputationReward, d.missionGiver, uuid, env],
      );
      mbeEnriched++;
    }
    onProgress?.(`Missions: MBE enrichment applied to ${mbeEnriched} missions`);
  }

  // Type-level fallback: fill missing reward_min/max with median of enriched missions of same type,
  // and missing danger_level with mode of enriched missions of same type.
  // Only applies to mission types with at least 3 enriched missions to ensure reliable estimates.
  onProgress?.('Missions: applying type-level median fallback for missing rewards/danger…');
  {
    const { rows: enrichedRows } = await conn.query<any>(
      'SELECT mission_type, reward_min, reward_max, danger_level FROM game.missions WHERE env = $1 AND (reward_min IS NOT NULL OR danger_level IS NOT NULL)',
      [env],
    );
    const byType = new Map<string, { rewardMins: number[]; rewardMaxs: number[]; dangers: number[] }>();
    for (const row of enrichedRows as {
      mission_type: string;
      reward_min: number | null;
      reward_max: number | null;
      danger_level: number | null;
    }[]) {
      if (!row.mission_type) continue;
      if (!byType.has(row.mission_type)) byType.set(row.mission_type, { rewardMins: [], rewardMaxs: [], dangers: [] });
      const entry = byType.get(row.mission_type)!;
      if (row.reward_min != null) entry.rewardMins.push(row.reward_min);
      if (row.reward_max != null) entry.rewardMaxs.push(row.reward_max);
      if (row.danger_level != null) entry.dangers.push(row.danger_level);
    }

    const median = (arr: number[]): number => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const mode = (arr: number[]): number => {
      const freq = new Map<number, number>();
      for (const v of arr) freq.set(v, (freq.get(v) ?? 0) + 1);
      return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };

    let typeFallbackCount = 0;
    for (const [missionType, { rewardMins, rewardMaxs, dangers }] of byType.entries()) {
      if (rewardMins.length >= 3) {
        const medMin = median(rewardMins);
        const medMax = rewardMaxs.length >= 3 ? median(rewardMaxs) : medMin;
        const r = await conn.query<any>(
          `UPDATE game.missions SET reward_min=$1, reward_max=$2, reward_currency=COALESCE(reward_currency,'aUEC')
             WHERE mission_type=$3 AND reward_min IS NULL AND env=$4`,
          [medMin, medMax, missionType, env],
        );
        typeFallbackCount += r.rowCount ?? 0;
      }
      if (dangers.length >= 3) {
        const modeVal = mode(dangers);
        await conn.query('UPDATE game.missions SET danger_level=$1 WHERE mission_type=$2 AND danger_level IS NULL AND env=$3', [
          modeVal,
          missionType,
          env,
        ]);
      }
    }
    if (typeFallbackCount > 0) {
      onProgress?.(`Missions: type-level fallback applied to ${typeFallbackCount} missions without reward`);
    }
  }

  // Ensure all missions have reward_currency set (aUEC is universal in SC)
  await conn.query("UPDATE game.missions SET reward_currency='aUEC' WHERE reward_currency IS NULL AND env=$1", [env]);

  return saved;
}

export async function saveMissionBlueprintLinks(ctx: PersistContext): Promise<void> {
  const { conn, env, df, onProgress } = ctx;
  const links = extractMissionBlueprintLinks(df);

  // Fetch UUIDs that actually exist in DB to avoid FK violations
  const { rows: missionRows } = await conn.query<any>('SELECT uuid, class_name FROM game.missions WHERE env = $1', [env]);
  const { rows: blueprintRows } = await conn.query<any>('SELECT uuid, class_name FROM game.crafting_recipes WHERE env = $1', [env]);
  const missionSet = new Set((missionRows as { uuid: string }[]).map((r) => r.uuid));
  const blueprintSet = new Set((blueprintRows as { uuid: string }[]).map((r) => r.uuid));

  const validRows = links
    .filter((l) => missionSet.has(l.missionUuid) && blueprintSet.has(l.blueprintUuid))
    .map((l) => [l.missionUuid, l.blueprintUuid] as [string, string]);

  // ── Manual overrides: loot-based links not present in DataForge ──────────
  // ADP (cds_legacy_armor) blueprints are dropped as loot in UGF Unlawful missions.
  // These links are not encoded in ContractGenerator/BlueprintPoolRecord.
  const UGF_UNLAWFUL_CLASS_NAMES = ['EliminateAll_Unlawful_UGF', 'EliminateBoss_Unlawful_UGF', 'EliminateSpecific_Unlawful_UGF'];
  const ugfMissionUuids = (missionRows as { uuid: string; class_name: string }[])
    .filter((r) => UGF_UNLAWFUL_CLASS_NAMES.includes(r.class_name))
    .map((r) => r.uuid);
  const adpBlueprintUuids = (blueprintRows as { uuid: string; class_name: string }[])
    .filter((r) => r.class_name.includes('cds_legacy_armor'))
    .map((r) => r.uuid);

  const seenKeys = new Set(validRows.map(([m, b]) => `${m}:${b}`));
  for (const missionUuid of ugfMissionUuids) {
    for (const blueprintUuid of adpBlueprintUuids) {
      const key = `${missionUuid}:${blueprintUuid}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        validRows.push([missionUuid, blueprintUuid]);
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (!validRows.length) {
    onProgress?.('Mission blueprint links: none matched existing missions/blueprints');
    return;
  }

  const mbrRows = validRows.map(([m, b]) => [env, env, m, b]);
  await batchUpsert(
    conn,
    `INSERT INTO game.mission_blueprint_rewards (mission_env, blueprint_env, mission_uuid, blueprint_uuid)`,
    '(mission_uuid, blueprint_uuid) DO NOTHING',
    4,
    mbrRows,
  );

  const dfCount = links.filter((l) => missionSet.has(l.missionUuid) && blueprintSet.has(l.blueprintUuid)).length;
  const manualCount = ugfMissionUuids.length * adpBlueprintUuids.length;
  onProgress?.(`Mission blueprint links: ${validRows.length} pairs saved (${dfCount} DataForge + ${manualCount} manual UGF/ADP)`);
}
