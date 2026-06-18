/**
 * UEX market → game.uex_terminals + game.uex_vehicle_prices
 *
 * Fetches the public UEX vehicle market, maps vehicles to our ships via the
 * byte-reordered Star Citizen UUID (with a name fallback), and persists a full
 * snapshot. The Starvis API serves ship buy/rent prices from these tables — the
 * IHM never calls UEX directly.
 */
import type { PoolClient } from 'pg';
import { scUuidToDataForgeUuid } from '../dataforge/dataforge-utils.js';
import type { GameEnv } from '../module-registry.js';
import { fetchUexEconomyMarket, fetchUexVehicleMarket, type UexGenericMarketPrice, type UexTerminal } from '../scrapers/uex-scraper.js';
import { batchUpsert } from './batch.js';
import { updateShipMarketSummaries } from './ship-market-summaries.js';

export interface UexPersistStats {
  terminals: number;
  buyPrices: number;
  rentPrices: number;
  economyPrices: number;
  mappedByUuid: number;
  mappedByName: number;
  mappedEconomy: number;
  unmapped: number;
}

function unixToIso(ts: number | null | undefined): string | null {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return null;
  return new Date(ts * 1000).toISOString();
}

function firstText(row: UexGenericMarketPrice, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(row: UexGenericMarketPrice, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

async function buildNameMap(conn: PoolClient, table: string, env: GameEnv): Promise<Map<string, string>> {
  const { rows } = await conn.query<{ uuid: string; name: string | null }>(`SELECT uuid, name FROM game.${table} WHERE env = $1`, [env]);
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = normalizeName(row.name);
    if (key && !map.has(key)) map.set(key, row.uuid);
  }
  return map;
}

function economyRow(
  env: GameEnv,
  resource: string,
  kind: 'commodity' | 'item' | 'component',
  row: UexGenericMarketPrice,
  uuidByName: Map<string, string>,
): (string | number | null | boolean)[] {
  const entityName = firstText(row, [`${kind}_name`, 'name', 'name_full', 'item_name', 'commodity_name', 'component_name']);
  const entityUuid = entityName ? (uuidByName.get(normalizeName(entityName)) ?? null) : null;
  const buy = firstNumber(row, ['price_buy', 'price_buy_avg', 'price_min']);
  const sell = firstNumber(row, ['price_sell', 'price_sell_avg', 'price_max']);
  const avg = firstNumber(row, ['price_average', 'price_avg']);
  const price = firstNumber(row, ['price']) ?? buy ?? sell ?? avg;
  const terminalId = firstNumber(row, ['id_terminal', 'terminal_id']);
  const entityId = firstNumber(row, [`id_${kind}`, 'id_item', 'id_commodity', 'id_component']);
  const priceKind = buy != null && sell != null ? 'spread' : buy != null ? 'buy' : sell != null ? 'sell' : 'price';

  return [
    env,
    resource,
    row.id,
    kind,
    entityId,
    entityUuid,
    entityName,
    terminalId,
    firstText(row, ['terminal_name', 'terminal']),
    priceKind,
    price,
    buy,
    sell,
    avg,
    row.is_available == null ? true : row.is_available !== 0 && row.is_available !== false,
    unixToIso(row.date_modified),
    JSON.stringify(row),
  ];
}

function normalizeName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function terminalRow(env: GameEnv, t: UexTerminal): (string | number | null | boolean)[] {
  return [
    env,
    t.id,
    String(t.type ?? 'vehicle_buy'),
    String(t.name ?? t.nickname ?? `terminal-${t.id}`),
    t.nickname ?? null,
    t.code ?? null,
    t.star_system_name ?? null,
    t.planet_name ?? null,
    t.orbit_name ?? null,
    t.moon_name ?? null,
    t.city_name ?? null,
    t.space_station_name ?? null,
    t.outpost_name ?? null,
    t.company_name ?? null,
    t.is_available == null ? true : t.is_available !== 0,
    t.game_version ?? null,
    t.screenshot ?? null,
    unixToIso(t.date_modified),
    JSON.stringify(t),
  ];
}

/**
 * Fetch the UEX vehicle market and persist a full snapshot for `env`.
 * Existing rows for the env are replaced (full refresh).
 */
export async function saveUexMarket(conn: PoolClient, env: GameEnv, onProgress?: (msg: string) => void): Promise<UexPersistStats> {
  const [snapshot, economy] = await Promise.all([fetchUexVehicleMarket(onProgress), fetchUexEconomyMarket(onProgress)]);

  // ── Build the vehicle → ship mapping ──────────────────────────────────────
  // Primary key: UEX uuid → byte-reordered DataForge uuid → game.ships.uuid.
  // Fallback: normalized ship name.
  const { rows: shipRows } = await conn.query<{ uuid: string; name: string | null }>('SELECT uuid, name FROM game.ships WHERE env = $1', [
    env,
  ]);
  const shipUuids = new Set(shipRows.map((r) => r.uuid.toLowerCase()));
  const shipByName = new Map<string, string>();
  for (const r of shipRows) {
    const key = normalizeName(r.name);
    if (key && !shipByName.has(key)) shipByName.set(key, r.uuid);
  }

  let mappedByUuid = 0;
  let mappedByName = 0;
  let unmapped = 0;
  const vehicleToShip = new Map<number, string | null>();
  for (const v of snapshot.vehicles) {
    let shipUuid: string | null = null;
    if (v.uuid) {
      const candidate = scUuidToDataForgeUuid(v.uuid).toLowerCase();
      if (shipUuids.has(candidate)) {
        shipUuid = candidate;
        mappedByUuid++;
      }
    }
    if (!shipUuid) {
      const byName = shipByName.get(normalizeName(v.name_full)) ?? shipByName.get(normalizeName(v.name));
      if (byName) {
        shipUuid = byName;
        mappedByName++;
      } else {
        unmapped++;
      }
    }
    vehicleToShip.set(v.id, shipUuid);
  }

  // ── Persist (full refresh inside the caller's transaction) ────────────────
  await conn.query('DELETE FROM game.uex_vehicle_prices WHERE env = $1', [env]);
  await conn.query('DELETE FROM game.uex_terminals WHERE env = $1', [env]);

  const terminalRows = snapshot.terminals.map((t) => terminalRow(env, t));
  const terminals = await batchUpsert(
    conn,
    `INSERT INTO game.uex_terminals
       (env, uex_id, type, name, nickname, code, star_system, planet, orbit, moon, city,
        space_station, outpost, company_name, is_available, game_version, screenshot, date_modified, raw_json)`,
    '(uex_id, env) DO NOTHING',
    19,
    terminalRows,
  );

  const knownTerminals = new Set(snapshot.terminals.map((t) => t.id));
  const priceRows: (string | number | null | boolean)[][] = [];
  let buyPrices = 0;
  let rentPrices = 0;

  for (const p of snapshot.purchases) {
    if (!knownTerminals.has(p.id_terminal)) continue;
    priceRows.push([
      env,
      p.id,
      'buy',
      p.id_vehicle,
      vehicleToShip.get(p.id_vehicle) ?? null,
      p.vehicle_name ?? null,
      p.id_terminal,
      p.price_buy ?? null,
      null,
      null,
      unixToIso(p.date_modified),
      JSON.stringify(p),
    ]);
    buyPrices++;
  }

  for (const r of snapshot.rentals) {
    if (!knownTerminals.has(r.id_terminal)) continue;
    priceRows.push([
      env,
      r.id,
      'rent',
      r.id_vehicle,
      vehicleToShip.get(r.id_vehicle) ?? null,
      r.vehicle_name ?? null,
      r.id_terminal,
      r.price_rent ?? null,
      r.price_rent_min ?? null,
      r.price_rent_min_week ?? null,
      unixToIso(r.date_modified),
      JSON.stringify(r),
    ]);
    rentPrices++;
  }

  await batchUpsert(
    conn,
    `INSERT INTO game.uex_vehicle_prices
       (env, uex_id, price_kind, uex_vehicle_id, ship_uuid, vehicle_name, terminal_uex_id,
        price, price_min, price_min_week, date_modified, raw_json)`,
    '(uex_id, price_kind, env) DO NOTHING',
    12,
    priceRows,
  );

  const [commodityByName, itemByName, componentByName] = await Promise.all([
    buildNameMap(conn, 'commodities', env),
    buildNameMap(conn, 'items', env),
    buildNameMap(conn, 'components', env),
  ]);

  await conn.query('DELETE FROM game.uex_market_prices WHERE env = $1', [env]);
  const economyRows = [
    ...economy.commodities.map((row) => economyRow(env, 'commodities_prices_all', 'commodity', row, commodityByName)),
    ...economy.items.map((row) => economyRow(env, 'items_prices_all', 'item', row, itemByName)),
    ...economy.components.map((row) => economyRow(env, 'components', 'component', row, componentByName)),
  ];
  const economyPrices = await batchUpsert(
    conn,
    `INSERT INTO game.uex_market_prices
       (env, resource, uex_id, entity_kind, entity_uex_id, entity_uuid, entity_name,
        terminal_uex_id, terminal_name, price_kind, price, price_buy, price_sell,
        price_average, is_available, date_modified, raw_json)`,
    '(env, resource, uex_id) DO NOTHING',
    17,
    economyRows,
  );
  const mappedEconomy = economyRows.filter((row) => row[5]).length;

  // Refresh ship market summaries (game.ships.game_data.market) from the new UEX data.
  const mkt = await updateShipMarketSummaries({ conn, env });
  onProgress?.(`UEX: market summaries — ${mkt.purchasable} purchasable, ${mkt.rentable} rentable`);

  onProgress?.(
    `UEX: persisted ${terminals} terminals, ${buyPrices} buy + ${rentPrices} rent prices ` +
      `(mapped: ${mappedByUuid} by uuid, ${mappedByName} by name, ${unmapped} unmapped; ` +
      `${economyPrices} economy rows, ${mappedEconomy} mapped)`,
  );

  return { terminals, buyPrices, rentPrices, economyPrices, mappedByUuid, mappedByName, mappedEconomy, unmapped };
}
