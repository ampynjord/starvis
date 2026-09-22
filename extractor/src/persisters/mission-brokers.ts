/**
 * MISSION BROKERS (MissionBrokerEntry) → mission_brokers table
 */
import { extractMissionBrokers } from '../extractors/mission-broker-extractor.js';
import { batchUpsert } from './batch.js';
import type { PersistContext } from './context.js';

export async function saveMissionBrokers(ctx: PersistContext): Promise<number> {
  const { conn, env, df, loc, onProgress } = ctx;
  const locAdapter = loc.isLoaded ? { resolveKey: (k: string) => loc.resolveKey(k) ?? null } : { resolveKey: () => null };

  const records = extractMissionBrokers(df, locAdapter);
  if (records.length === 0) {
    onProgress?.('Mission brokers: 0 found');
    return 0;
  }

  const rows = records.map((r) => [
    r.className.substring(0, 255),
    env,
    r.titleLocKey?.substring(0, 255) ?? null,
    r.title?.substring(0, 500) ?? null,
    r.titleIsTemplate,
    r.descriptionLocKey?.substring(0, 255) ?? null,
    r.description,
    r.giverLocKey?.substring(0, 255) ?? null,
    r.giver?.substring(0, 255) ?? null,
    r.missionModule?.substring(0, 500) ?? null,
    r.missionType?.substring(0, 255) ?? null,
    r.rewardAmount,
    r.rewardMax,
    r.rewardCurrency?.substring(0, 20) ?? null,
    r.difficulty,
    r.isLawful,
    r.onceOnly,
    r.isTutorial,
    r.maxInstances,
    r.deadlineSeconds,
    r.availableInPrison,
    r.failIfBecameCriminal,
    r.minRequiredMissions,
    JSON.stringify(r.rawJson),
  ]);

  // Remplacement complet : une offre retirée par un patch doit disparaitre, ce
  // qu'un upsert seul ne ferait pas.
  await conn.query('DELETE FROM game.mission_brokers WHERE env = $1', [env]);

  const affected = await batchUpsert(
    conn,
    `INSERT INTO game.mission_brokers
       (class_name, env, title_loc_key, title, title_is_template, description_loc_key, description,
        giver_loc_key, giver, mission_module, mission_type, reward_amount, reward_max, reward_currency,
        difficulty, is_lawful, once_only, is_tutorial, max_instances, deadline_seconds,
        available_in_prison, fail_if_became_criminal, min_required_missions, raw_json)`,
    '(class_name, env) DO NOTHING',
    24,
    rows,
  );

  const paid = records.filter((r) => (r.rewardAmount ?? 0) > 0).length;
  onProgress?.(`Mission brokers: ${affected} saved, ${paid} with a reward`);
  return records.length;
}
