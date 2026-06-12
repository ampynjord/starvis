/**
 * GAME INSIGHTS → game_insights + derived tables
 * (factions, reputation, loot tables, blueprint rewards, ammo, inventory containers)
 */
import { extractGameInsights } from '../game-insight-extractor.js';
import { buildDerivedGameInsightData, type DerivedGameInsightData } from '../game-insight-normalizer.js';
import { batchUpsert } from './batch.js';
import type { PersistContext } from './context.js';

export async function saveGameInsights(ctx: PersistContext): Promise<number> {
  const { conn, env, df, onProgress } = ctx;
  const records = extractGameInsights(df, onProgress);
  if (!records.length) {
    onProgress?.('Game insights: no candidate records found');
    return 0;
  }

  const rows: (string | number | null)[][] = records.map((r) => [
    r.uuid,
    env,
    r.category,
    r.sourceType,
    r.className,
    r.name,
    r.subtype,
    r.relatedClass,
    r.relatedUuid,
    r.locationHint,
    r.faction,
    r.reputationKey,
    r.valueNumeric,
    r.valueText,
    r.p4kPath,
    r.rawJson ? JSON.stringify(r.rawJson) : null,
  ]);

  const saved = await batchUpsert(
    conn,
    `INSERT INTO game.game_insights
       (uuid, env, category, source_type, class_name, name, subtype,
        related_class, related_uuid, location_hint, faction, reputation_key,
        value_numeric, value_text, p4k_path, raw_json)`,
    `(uuid, env, category) DO UPDATE SET
       source_type=EXCLUDED.source_type,
       class_name=EXCLUDED.class_name,
       name=EXCLUDED.name,
       subtype=EXCLUDED.subtype,
       related_class=EXCLUDED.related_class,
       related_uuid=EXCLUDED.related_uuid,
       location_hint=EXCLUDED.location_hint,
       faction=EXCLUDED.faction,
       reputation_key=EXCLUDED.reputation_key,
       value_numeric=EXCLUDED.value_numeric,
       value_text=EXCLUDED.value_text,
       p4k_path=EXCLUDED.p4k_path,
       raw_json=EXCLUDED.raw_json,
       extracted_at=now()`,
    16,
    rows,
  );

  onProgress?.(`Game insights: ${saved} records saved [${env}]`);
  const derived = buildDerivedGameInsightData(records);
  await saveGameInsightDerivedData(ctx, derived);
  return saved;
}

async function saveGameInsightDerivedData(ctx: PersistContext, data: DerivedGameInsightData): Promise<void> {
  const { conn, env, onProgress } = ctx;
  const json = (value: unknown): string | null => (value == null ? null : JSON.stringify(value));

  if (data.factions.length) {
    await batchUpsert(
      conn,
      `INSERT INTO game.factions
        (uuid, env, class_name, name, description, faction_type, default_reaction,
         able_to_arrest, no_legal_rights, polices_criminality, polices_lawful_trespass,
         faction_reputation_uuid, allies, enemies, organization_tags, string_variants, p4k_path, raw_json)`,
      `(uuid, env) DO UPDATE SET
         class_name=EXCLUDED.class_name, name=EXCLUDED.name, description=EXCLUDED.description,
         faction_type=EXCLUDED.faction_type, default_reaction=EXCLUDED.default_reaction,
         able_to_arrest=EXCLUDED.able_to_arrest, no_legal_rights=EXCLUDED.no_legal_rights,
         polices_criminality=EXCLUDED.polices_criminality, polices_lawful_trespass=EXCLUDED.polices_lawful_trespass,
         faction_reputation_uuid=EXCLUDED.faction_reputation_uuid, allies=EXCLUDED.allies,
         enemies=EXCLUDED.enemies, organization_tags=EXCLUDED.organization_tags,
         string_variants=EXCLUDED.string_variants, p4k_path=EXCLUDED.p4k_path,
         raw_json=EXCLUDED.raw_json, extracted_at=now()`,
      18,
      data.factions.map((r) => [
        r.uuid,
        env,
        r.className,
        r.name,
        r.description,
        r.factionType,
        r.defaultReaction,
        r.ableToArrest,
        r.noLegalRights,
        r.policesCriminality,
        r.policesLawfulTrespass,
        r.factionReputationUuid,
        json(r.allies),
        json(r.enemies),
        json(r.organizationTags),
        json(r.stringVariants),
        r.p4kPath,
        json(r.rawJson),
      ]),
    );
  }

  if (data.reputationStandings.length) {
    await batchUpsert(
      conn,
      `INSERT INTO game.reputation_standings
        (uuid, env, class_name, name, display_name, description, icon, min_reputation,
         drift_time_hours, drift_reputation, gated, perk_description, p4k_path, raw_json)`,
      `(uuid, env) DO UPDATE SET
         class_name=EXCLUDED.class_name, name=EXCLUDED.name, display_name=EXCLUDED.display_name,
         description=EXCLUDED.description, icon=EXCLUDED.icon, min_reputation=EXCLUDED.min_reputation,
         drift_time_hours=EXCLUDED.drift_time_hours, drift_reputation=EXCLUDED.drift_reputation,
         gated=EXCLUDED.gated, perk_description=EXCLUDED.perk_description,
         p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json, extracted_at=now()`,
      14,
      data.reputationStandings.map((r) => [
        r.uuid,
        env,
        r.className,
        r.name,
        r.displayName,
        r.description,
        r.icon,
        r.minReputation,
        r.driftTimeHours,
        r.driftReputation,
        r.gated,
        r.perkDescription,
        r.p4kPath,
        json(r.rawJson),
      ]),
    );
  }

  if (data.reputationScopes.length) {
    await batchUpsert(
      conn,
      `INSERT INTO game.reputation_scopes
        (uuid, env, class_name, scope_name, display_name, description, icon,
         initial_reputation, reputation_ceiling, standings, p4k_path, raw_json)`,
      `(uuid, env) DO UPDATE SET
         class_name=EXCLUDED.class_name, scope_name=EXCLUDED.scope_name,
         display_name=EXCLUDED.display_name, description=EXCLUDED.description, icon=EXCLUDED.icon,
         initial_reputation=EXCLUDED.initial_reputation, reputation_ceiling=EXCLUDED.reputation_ceiling,
         standings=EXCLUDED.standings, p4k_path=EXCLUDED.p4k_path,
         raw_json=EXCLUDED.raw_json, extracted_at=now()`,
      12,
      data.reputationScopes.map((r) => [
        r.uuid,
        env,
        r.className,
        r.scopeName,
        r.displayName,
        r.description,
        r.icon,
        r.initialReputation,
        r.reputationCeiling,
        json(r.standings),
        r.p4kPath,
        json(r.rawJson),
      ]),
    );
  }

  if (data.lootTables.length) {
    await batchUpsert(
      conn,
      `INSERT INTO game.loot_tables (uuid, env, class_name, name, p4k_path, raw_json)`,
      `(uuid, env) DO UPDATE SET class_name=EXCLUDED.class_name, name=EXCLUDED.name,
         p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json, extracted_at=now()`,
      6,
      data.lootTables.map((r) => [r.uuid, env, r.className, r.name, r.p4kPath, json(r.rawJson)]),
    );
  }

  if (data.lootTableEntries.length) {
    await batchUpsert(
      conn,
      `INSERT INTO game.loot_table_entries
        (env, table_uuid, table_class_name, entry_index, archetype_uuid, archetype_class_name,
         weight, min_results, max_results, raw_json)`,
      `(env, table_uuid, entry_index) DO UPDATE SET
         table_class_name=EXCLUDED.table_class_name, archetype_uuid=EXCLUDED.archetype_uuid,
         archetype_class_name=EXCLUDED.archetype_class_name, weight=EXCLUDED.weight,
         min_results=EXCLUDED.min_results, max_results=EXCLUDED.max_results,
         raw_json=EXCLUDED.raw_json, extracted_at=now()`,
      10,
      data.lootTableEntries.map((r) => [
        env,
        r.tableUuid,
        r.tableClassName,
        r.entryIndex,
        r.archetypeUuid,
        r.archetypeClassName,
        r.weight,
        r.minResults,
        r.maxResults,
        json(r.rawJson),
      ]),
    );
  }

  if (data.lootArchetypes.length) {
    await batchUpsert(
      conn,
      `INSERT INTO game.loot_archetypes
        (uuid, env, class_name, name, primary_entries, secondary_entries, excluded_tags, p4k_path, raw_json)`,
      `(uuid, env) DO UPDATE SET
         class_name=EXCLUDED.class_name, name=EXCLUDED.name, primary_entries=EXCLUDED.primary_entries,
         secondary_entries=EXCLUDED.secondary_entries, excluded_tags=EXCLUDED.excluded_tags,
         p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json, extracted_at=now()`,
      9,
      data.lootArchetypes.map((r) => [
        r.uuid,
        env,
        r.className,
        r.name,
        json(r.primaryEntries),
        json(r.secondaryEntries),
        json(r.excludedTags),
        r.p4kPath,
        json(r.rawJson),
      ]),
    );
  }

  if (data.blueprintRewards.length) {
    await batchUpsert(
      conn,
      `INSERT INTO game.blueprint_rewards
        (env, pool_uuid, pool_class_name, reward_index, blueprint_uuid, blueprint_class_name, weight, raw_json)`,
      `(env, pool_uuid, reward_index) DO UPDATE SET
         pool_class_name=EXCLUDED.pool_class_name, blueprint_uuid=EXCLUDED.blueprint_uuid,
         blueprint_class_name=EXCLUDED.blueprint_class_name, weight=EXCLUDED.weight,
         raw_json=EXCLUDED.raw_json, extracted_at=now()`,
      8,
      data.blueprintRewards.map((r) => [
        env,
        r.poolUuid,
        r.poolClassName,
        r.rewardIndex,
        r.blueprintUuid,
        r.blueprintClassName,
        r.weight,
        json(r.rawJson),
      ]),
    );
  }

  if (data.ammo.length) {
    await batchUpsert(
      conn,
      `INSERT INTO game.ammo
        (uuid, env, class_name, name, size, speed, lifetime, ammo_category, conversion_rate_micro_scu,
         damage_physical, damage_energy, damage_distortion, damage_thermal, damage_biochemical, damage_stun,
         explosion_damage_physical, explosion_damage_energy, explosion_damage_distortion, explosion_damage_thermal,
         explosion_damage_biochemical, explosion_damage_stun, impact_radius, explosion_min_radius,
         explosion_max_radius, mass, p4k_path, raw_json)`,
      `(uuid, env) DO UPDATE SET
         class_name=EXCLUDED.class_name, name=EXCLUDED.name, size=EXCLUDED.size, speed=EXCLUDED.speed,
         lifetime=EXCLUDED.lifetime, ammo_category=EXCLUDED.ammo_category,
         conversion_rate_micro_scu=EXCLUDED.conversion_rate_micro_scu,
         damage_physical=EXCLUDED.damage_physical, damage_energy=EXCLUDED.damage_energy,
         damage_distortion=EXCLUDED.damage_distortion, damage_thermal=EXCLUDED.damage_thermal,
         damage_biochemical=EXCLUDED.damage_biochemical, damage_stun=EXCLUDED.damage_stun,
         explosion_damage_physical=EXCLUDED.explosion_damage_physical,
         explosion_damage_energy=EXCLUDED.explosion_damage_energy,
         explosion_damage_distortion=EXCLUDED.explosion_damage_distortion,
         explosion_damage_thermal=EXCLUDED.explosion_damage_thermal,
         explosion_damage_biochemical=EXCLUDED.explosion_damage_biochemical,
         explosion_damage_stun=EXCLUDED.explosion_damage_stun, impact_radius=EXCLUDED.impact_radius,
         explosion_min_radius=EXCLUDED.explosion_min_radius, explosion_max_radius=EXCLUDED.explosion_max_radius,
         mass=EXCLUDED.mass, p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json, extracted_at=now()`,
      27,
      data.ammo.map((r) => [
        r.uuid,
        env,
        r.className,
        r.name,
        r.size,
        r.speed,
        r.lifetime,
        r.ammoCategory,
        r.conversionRateMicroScu,
        r.damagePhysical,
        r.damageEnergy,
        r.damageDistortion,
        r.damageThermal,
        r.damageBiochemical,
        r.damageStun,
        r.explosionDamagePhysical,
        r.explosionDamageEnergy,
        r.explosionDamageDistortion,
        r.explosionDamageThermal,
        r.explosionDamageBiochemical,
        r.explosionDamageStun,
        r.impactRadius,
        r.explosionMinRadius,
        r.explosionMaxRadius,
        r.mass,
        r.p4kPath,
        json(r.rawJson),
      ]),
    );
  }

  if (data.inventoryContainers.length) {
    await batchUpsert(
      conn,
      `INSERT INTO game.inventory_containers
        (uuid, env, class_name, name, inventory_type, capacity_micro_scu, capacity_scu,
         size_x, size_y, size_z, excluded_item_subtypes, p4k_path, raw_json)`,
      `(uuid, env) DO UPDATE SET
         class_name=EXCLUDED.class_name, name=EXCLUDED.name, inventory_type=EXCLUDED.inventory_type,
         capacity_micro_scu=EXCLUDED.capacity_micro_scu, capacity_scu=EXCLUDED.capacity_scu,
         size_x=EXCLUDED.size_x, size_y=EXCLUDED.size_y, size_z=EXCLUDED.size_z,
         excluded_item_subtypes=EXCLUDED.excluded_item_subtypes,
         p4k_path=EXCLUDED.p4k_path, raw_json=EXCLUDED.raw_json, extracted_at=now()`,
      13,
      data.inventoryContainers.map((r) => [
        r.uuid,
        env,
        r.className,
        r.name,
        r.inventoryType,
        r.capacityMicroScu,
        r.capacityScu,
        r.sizeX,
        r.sizeY,
        r.sizeZ,
        json(r.excludedItemSubtypes),
        r.p4kPath,
        json(r.rawJson),
      ]),
    );
  }

  onProgress?.(
    `Game insight tables: factions=${data.factions.length}, reputationStandings=${data.reputationStandings.length}, reputationScopes=${data.reputationScopes.length}, lootTables=${data.lootTables.length}, lootEntries=${data.lootTableEntries.length}, lootArchetypes=${data.lootArchetypes.length}, blueprintRewards=${data.blueprintRewards.length}, ammo=${data.ammo.length}, inventoryContainers=${data.inventoryContainers.length}`,
  );
}
