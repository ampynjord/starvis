/**
 * UEX scraper — fetches Star Citizen market data (vehicles, terminals, prices)
 * from the public UEX Corp API (https://api.uexcorp.uk).
 *
 * Only public, token-free endpoints are used. The IHM never calls UEX directly:
 * this data is fetched here, mapped to our ships, and persisted into game.uex_*
 * so the Starvis API is the single source for the front-end.
 */
import { SCRAPER_USER_AGENT } from '../config.js';

export const UEX_API_BASE = (process.env.UEX_API_BASE ?? 'https://api.uexcorp.uk/2.0').replace(/\/$/, '');

export interface UexVehicle {
  id: number;
  name: string | null;
  name_full: string | null;
  slug: string | null;
  uuid: string | null;
  company_name: string | null;
  url_store: string | null;
}

export interface UexTerminal {
  id: number;
  type: string | null;
  name: string | null;
  nickname: string | null;
  code: string | null;
  star_system_name: string | null;
  planet_name: string | null;
  orbit_name: string | null;
  moon_name: string | null;
  city_name: string | null;
  space_station_name: string | null;
  outpost_name: string | null;
  company_name: string | null;
  is_available: number | null;
  game_version: string | null;
  screenshot: string | null;
  date_modified: number | null;
}

export interface UexVehiclePurchasePrice {
  id: number;
  id_vehicle: number;
  id_terminal: number;
  price_buy: number | null;
  vehicle_name: string | null;
  terminal_name: string | null;
  date_modified: number | null;
}

export interface UexVehicleRentalPrice {
  id: number;
  id_vehicle: number;
  id_terminal: number;
  price_rent: number | null;
  price_rent_min?: number | null;
  price_rent_min_week?: number | null;
  vehicle_name: string | null;
  terminal_name: string | null;
  date_modified: number | null;
}

export interface UexMarketSnapshot {
  vehicles: UexVehicle[];
  terminals: UexTerminal[];
  purchases: UexVehiclePurchasePrice[];
  rentals: UexVehicleRentalPrice[];
}

async function fetchUex<T>(resource: string): Promise<T[]> {
  const url = `${UEX_API_BASE}/${resource}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': SCRAPER_USER_AGENT },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`UEX HTTP ${res.status} — ${url}`);
  const body = (await res.json()) as { status?: string; data?: T[] };
  if (body.status !== 'ok' || !Array.isArray(body.data)) {
    throw new Error(`UEX bad response for ${resource} (status=${body.status ?? 'none'})`);
  }
  return body.data;
}

/**
 * Fetch the full vehicle market snapshot from UEX. Terminals for both buy and
 * rent are merged (deduplicated by id) so every price row can be located.
 */
export async function fetchUexVehicleMarket(onProgress?: (msg: string) => void): Promise<UexMarketSnapshot> {
  onProgress?.('UEX: fetching vehicles…');
  const vehicles = await fetchUex<UexVehicle>('vehicles');

  onProgress?.('UEX: fetching vehicle terminals…');
  const [buyTerminals, rentTerminals] = await Promise.all([
    fetchUex<UexTerminal>('terminals?type=vehicle_buy'),
    fetchUex<UexTerminal>('terminals?type=vehicle_rent'),
  ]);
  const terminalById = new Map<number, UexTerminal>();
  for (const terminal of [...buyTerminals, ...rentTerminals]) {
    if (terminal?.id != null) terminalById.set(terminal.id, terminal);
  }

  onProgress?.('UEX: fetching vehicle prices…');
  const [purchases, rentals] = await Promise.all([
    fetchUex<UexVehiclePurchasePrice>('vehicles_purchases_prices_all'),
    fetchUex<UexVehicleRentalPrice>('vehicles_rentals_prices_all'),
  ]);

  onProgress?.(
    `UEX: ${vehicles.length} vehicles, ${terminalById.size} terminals, ${purchases.length} purchase prices, ${rentals.length} rental prices`,
  );

  return { vehicles, terminals: [...terminalById.values()], purchases, rentals };
}
