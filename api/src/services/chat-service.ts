/**
 * ChatService — Starvis AI, Mistral AI with exhaustive tool use.
 *
 * Full DB coverage (game + rsi + meta schemas):
 *   Ships / Ground / Gravlev — full stats, loadout, hardpoints, variants
 *   Components              — weapons, shields, thrusters, QD, coolers…
 *   Items                   — armor, helmets, FPS weapons, gadgets
 *   Crafting                — recipes, ingredients, slot modifiers
 *   Mining                  — elements, rock compositions
 *   Missions                — types, factions, rewards
 *   Locations               — planets, moons, stations, outposts
 *   Commodities             — raw materials, buy/sell prices
 *   Trade routes            — best trade itineraries
 *   Shops                   — inventories
 *   Manufacturers           — ship manufacturers
 *   Ship Matrix (RSI)       — official RSI data (dimensions, prices, lore)
 *   Galactapedia            — RSI lore
 *   Comm-links              — CIG communications
 *   Starmap                 — star systems
 */

import type { PrismaLike } from '@starvis/db';
import OpenAI from 'openai';
import { CHAT_MAX_ITER, CHAT_PROVIDER_BASE_URL, CHAT_RESPONSE_MODEL, CHAT_TOOL_MODEL } from '../utils/config.js';
import { logger } from '../utils/index.js';
import type { GameDataService } from './game-data-service.js';
import type { RsiWebsiteService } from './rsi-website-service.js';
import type { ShipMatrixService } from './ship-matrix-service.js';

const TOOL_MODEL = CHAT_TOOL_MODEL;
const RESPONSE_MODEL = CHAT_RESPONSE_MODEL;
const MAX_ITER = CHAT_MAX_ITER;
const QUERY_DATABASE_MAX_ROWS = 50;

const QUERY_DATABASE_ALLOWED_TABLES = new Set([
  'game.ships',
  'game.components',
  'game.items',
  'game.missions',
  'game.locations',
  'game.commodities',
  'game.commodity_prices',
  'game.crafting_recipes',
  'game.crafting_ingredients',
  'game.crafting_modifiers',
  'game.ship_loadouts',
  'game.ship_modules',
  'game.ship_paints',
  'game.shops',
  'game.shop_inventory',
  'game.manufacturers',
  'game.mining_elements',
  'game.mining_compositions',
  'game.mining_composition_elements',
  'rsi.ship_matrix',
  'rsi.galactapedia',
  'rsi.comm_links',
  'rsi.starmap_locations',
]);

const QUERY_DATABASE_BLOCKED_KEYWORDS =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|execute|do|vacuum|analyze|refresh|set|reset|listen|notify|lock|merge)\b/i;
const QUERY_DATABASE_BLOCKED_FUNCTIONS = /\b(pg_sleep|dblink|lo_import|lo_export|copy_to|copy_from)\b/i;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SafeQueryDatabaseResult {
  ok: true;
  sql: string;
  params: Array<string | number | boolean>;
}

export interface UnsafeQueryDatabaseResult {
  ok: false;
  error: string;
}

export type QueryDatabaseValidationResult = SafeQueryDatabaseResult | UnsafeQueryDatabaseResult;

function normalizeSqlIdentifier(identifier: string): string {
  return identifier
    .split('.')
    .map((part) => part.trim().replace(/^"|"$/g, '').toLowerCase())
    .join('.');
}

function stripSqlStringLiterals(sql: string): string {
  return sql.replace(/'(?:''|[^'])*'/g, "''").replace(/"(?:""|[^"])*"/g, '""');
}

function referencedTables(sqlWithoutStrings: string): string[] {
  const tables = new Set<string>();
  const tablePattern = /\b(?:from|join)\s+((?:"?[a-zA-Z_][\w]*"?\.)?"?[a-zA-Z_][\w]*"?)/gi;
  for (const match of sqlWithoutStrings.matchAll(tablePattern)) {
    if (match[1]) tables.add(normalizeSqlIdentifier(match[1]));
  }
  return [...tables];
}

export function validateQueryDatabaseSql(sqlInput: unknown, paramsInput: unknown): QueryDatabaseValidationResult {
  if (typeof sqlInput !== 'string') return { ok: false, error: 'SQL query is required' };
  const sql = sqlInput.trim();

  if (!sql) return { ok: false, error: 'SQL query is empty' };
  if (!/^\s*select\b/i.test(sql)) return { ok: false, error: 'Only SELECT queries are allowed' };
  if (/[;]/.test(sql)) return { ok: false, error: 'Semicolons are not allowed in chat SQL queries' };
  if (/--|\/\*|\*\//.test(sql)) return { ok: false, error: 'SQL comments are not allowed in chat SQL queries' };

  const sqlWithoutStrings = stripSqlStringLiterals(sql);
  if (QUERY_DATABASE_BLOCKED_KEYWORDS.test(sqlWithoutStrings)) {
    return { ok: false, error: 'Only read-only SELECT queries are allowed' };
  }
  if (QUERY_DATABASE_BLOCKED_FUNCTIONS.test(sqlWithoutStrings)) {
    return { ok: false, error: 'This SQL function is not allowed in chat queries' };
  }
  if (/\bselect\s+\*/i.test(sqlWithoutStrings) || /(^|,)\s*\*\s*(,|\bfrom\b)/i.test(sqlWithoutStrings)) {
    return { ok: false, error: 'SELECT * is not allowed; request only the columns you need' };
  }

  const tables = referencedTables(sqlWithoutStrings);
  for (const table of tables) {
    if (!table.includes('.')) return { ok: false, error: `Table "${table}" must be schema-qualified` };
    if (!QUERY_DATABASE_ALLOWED_TABLES.has(table)) return { ok: false, error: `Table "${table}" is not available to the chat assistant` };
  }

  const params = Array.isArray(paramsInput) ? paramsInput : [];
  if (!params.every((param) => ['string', 'number', 'boolean'].includes(typeof param))) {
    return { ok: false, error: 'Query parameters must be strings, numbers or booleans' };
  }

  return {
    ok: true,
    sql: `SELECT * FROM (${sql}) AS starvis_chat_query LIMIT ${QUERY_DATABASE_MAX_ROWS}`,
    params: params as Array<string | number | boolean>,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt — Star Citizen expert + tool usage guide
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Starvis, the official AI of the Starvis database — data extracted directly from Star Citizen (LIVE version).

## Language
Respond in **English** by default. Adapt to the user's language if they write in another language.

## Absolute rule
For any Star Citizen question, **always use a tool** to query the database before answering. Never invent statistics.
If a tool returns no result or a field is null, answer in first person: say "I don't currently have that value" or "I don't have enough data for that yet." Never say "Starvis knows", "Starvis has", or "Starvis does not have", because you are Starvis.
Prefer useful comparisons, trade-offs and next actions over raw data dumps.

## Answer quality contract

- Start with the direct answer in 1-2 sentences.
- Speak as Starvis in first person when referring to your own data or limits.
- Then give the supporting data that matters most.
- For comparisons, say which option wins for each use case.
- For recommendations, state your assumptions: budget, role, cargo, solo/multicrew, risk.
- Never paste raw JSON unless the user explicitly asks for raw data.

---

## Available data & important fields

### Ships (schema game, table ships)
Identity: uuid, class_name, name, manufacturer_code, manufacturer_name, career, role, vehicle_category (ship/ground/gravlev), variant_type, production_status, short_name
Physical: mass (kg), total_hp, size_x (width m), size_y (length m), size_z (height m)
Flight: scm_speed (m/s), max_speed (m/s), boost_speed_forward, boost_speed_backward, pitch_max, yaw_max, roll_max (deg/s), boost_ramp_up/down (s)
Resources: hydrogen_fuel_capacity (L), quantum_fuel_capacity (L), cargo_capacity (SCU), crew_size
Combat: shield_hp (total shield HP), weapon_damage_total (weapons DPS), missile_damage_total (missile damage)
Armor: armor_physical, armor_energy, armor_distortion, armor_hp, armor_phys_resist, armor_energy_resist
Signatures: armor_signal_ir (heat), armor_signal_em (electromagnetic), armor_signal_cs (cross-section)
Insurance: insurance_claim_time (min), insurance_expedite_cost (aUEC)
RSI: ship_matrix_id, thumbnail, production_status (Flight Ready / In Production / In Concept), store_url, min_crew, max_crew, sm_description

### Aggregated loadout stats (via get_ship_full_stats)
weapons_dps_total, weapons_alpha_total, shield_capacity_total, shield_regen_total, shield_faces, power_output_total, heat_dissipation_total, qd_range (AU), qd_speed (m/s), qd_cooldown (s), countermeasure_count, missile_damage_total, hardpoints (slot list)

### Components (schema game, table components)
uuid, name, class_name, type (WeaponGun/Shield/PowerPlant/Cooler/QuantumDrive/Countermeasure/Missile/Radar/MainThruster/ManoThrust…), sub_type, size (1-10), grade (A-D, A=best), component_class (Civilian/Competition/Industrial/Military/Stealth), manufacturer_code, mass
Weapons: fire_rate (shots/min), ammo_speed (m/s), ammo_lifetime (s), range (m), dmg_physical, dmg_energy, dmg_distortion, dmg_thermal, dmg_biochemical, burst_dps, sustained_dps, alpha_damage
Shields: shield_capacity, shield_regen, face_coverage (protected faces)
QD: qd_range (AU), qd_speed (m/s), qd_cooldown (s), qd_fuel_rate
Power plants: power_output
Coolers: cooling_rate

### Items (schema game, table items)
uuid, name, class_name, type (Char_Armor_Torso/Char_Helmet/WeaponPersonal/FoodProduct…), sub_type, manufacturer_code, mass
FPS armor: armor_physical, armor_energy, armor_distortion, armor_signal_ir, armor_signal_em

### Crafting (schema game, table crafting_recipes)
uuid, name, output_item_name, output_item_uuid, category, station_type, craft_time (s), quantity_produced, schematic_uuid
Ingredients: item_name, quantity, is_optional, scu
Slot modifiers: slot_name, property_name, start_quality, end_quality, modifier_at_start, modifier_at_end

### Mining (schema game)
Elements: uuid, name, description, instability, resistance, mass, inert_material
Rock compositions: list of elements with percentages

### Missions (schema game, table missions)
uuid, name, type, faction, system_name, category, danger_level (1-5), completion_time_secs, reward_min, reward_max, required_reputation, reputation_reward, base_xp

### Locations (schema game, table locations)
uuid, name, type (Planet/Moon/Station/Outpost/City/LagrangePoint…), system, parent_name, has_shops, has_landing_zone, has_refuel, has_restock, has_repair

### Commodities (schema game, table commodities)
uuid, name, type, description, occupancy_scu (SCU per unit), is_illegal, is_volatile

### Commodity prices (schema game, table commodity_prices)
buy_price (aUEC/unit), sell_price, stock, demand, shop_name, system, city

### Trade routes (calculated on the fly)
commodity_name, buy_price, buy_shop, buy_system, sell_price, sell_shop, sell_system, profit_per_unit, profit_per_scu, total_profit (for N SCU)

### RSI Ship Matrix (schema rsi, table ship_matrix)
name, manufacturer_code, manufacturer_name, length, beam, height, mass, cargo_capacity, min_crew, max_crew, scm_speed, afterburner_speed, pitch_max, yaw_max, roll_max, price_usd, price_uec (in-game price), production_status, description, url

### Galactapedia (schema rsi)
id, title, content (lore text), category, tags

### Comm-links (schema rsi)
id, title, content, url, published_at, category

### Starmap (schema rsi)
id, code, name, type, description, affiliation

---

## Common calculations

**Weapon DPS** = burst_dps (burst fire) or sustained_dps (sustained) — already computed in DB
**Total ship DPS** = weapon_damage_total (already computed via loadout)
**Effective weapon range** = ammo_speed × ammo_lifetime (in meters)
**Trade profit** = (sell_price - buy_price) × scu_quantity / occupancy_scu
**SCU/budget ratio** = budget / buy_price = max purchasable SCU
**QD range** = quantum_fuel_capacity / qd_fuel_rate (in AU)

## Current schema corrections

Some older labels above are aliases. Prefer these current Starvis fields when interpreting tool results:
- Items: weapon_damage, weapon_fire_rate, weapon_range, weapon_speed, weapon_ammo_count, weapon_dps, armor_damage_reduction, armor_temp_min, armor_temp_max.
- Crafting: crafting_time_s and output_quantity.
- Missions: title, mission_type, mission_giver, completion_time_s, location_system, location_planet, location_name, reward_currency.
- Locations: class_name, system_code, parent_uuid, rsi_starmap_location_id, loc_key, coordinates, description.
- Starmap: system_code, system_name, status, star_type, faction_name, affiliations, coordinates {x,y,z}, aggregated, size, population, economy, danger, jump_points.
- P4K locations are correlated with RSI starmap through game.locations.rsi_starmap_location_id -> rsi.starmap_locations.id. Prefer the joined/correlated view when explaining planets, moons, systems or coordinates.
- RSI website data may include source metadata and raw_json in detail endpoints; summarize it, do not dump it.

---

## Ship names with manufacturer

When the user mentions a ship with its manufacturer, pass the manufacturer code in the manufacturer parameter and only the model in query:
- "Anvil Arrow" → manufacturer: "ANVL", query: "Arrow"
- "Origin 300i" → manufacturer: "ORIG", query: "300i"
- "Drake Cutlass Black" → manufacturer: "DRAK", query: "Cutlass Black"
- "RSI Constellation Andromeda" → manufacturer: "RSI", query: "Constellation Andromeda"

If you don't know the manufacturer code, just pass the model in query without the manufacturer name.

## Tool usage strategy

1. Ship question → search_ships (list) then get_ship_details (raw stats) and/or get_ship_full_stats (aggregated loadout)
2. Compare ships → search_ships for each then get_ship_full_stats
3. Best weapon of a given size → search_components with type+size, sort by sustained_dps
4. Trade route → find_trade_routes
5. Commodity price → get_commodity_prices
6. Crafting recipe → search_crafting then get_recipe_details
7. Lore / history → search_galactapedia or search_comm_links
8. Where to buy an item → search_shops
9. Ship variants → get_ship_variants

## Response formatting

- **Bold** for key figures and important names.
- **Bullet lists** for enumerations.
- **Tables**: On the web, use normal markdown pipe tables for compact comparisons. Keep them narrow: 3-5 columns max. For wide comparisons, split into multiple small tables or use bullets.
- Respond **concisely**: no unnecessary section if the info fits in a few lines.
- Use short section titles only when helpful: **Verdict**, **Why**, **Data**, **Caveats**.
- When the user asks "best", give a role-specific recommendation, not only the highest stat.
- When the user explicitly asks through Discord, never use markdown tables or code-block tables; use compact bullets instead.
- If data is missing, say what is missing and answer with the available fields.`;

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  // ── Ships ────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_ships',
      description: 'Search ships, ground vehicles or gravlev. Returns basic stats for multiple results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Partial ship name' },
          manufacturer: { type: 'string', description: 'Manufacturer code (ORIG, ANVL, RSI, CRUS, DRAK, MISC, BANU, XI-AN, VANDUL…)' },
          category: { type: 'string', description: '"ship" | "ground" | "gravlev"' },
          role: { type: 'string', description: 'Role (fighter, bomber, mining, cargo, exploration, stealth, support…)' },
          career: { type: 'string', description: 'Career (Combat, Transport, Exploration, Industrial, Support…)' },
          env: { type: 'string', description: '"live" (default) | "ptu"' },
          limit: { type: 'number', description: 'Max results (default 10, max 20)' },
          sort: { type: 'string', description: 'Sort field (scm_speed, cargo_capacity, shield_hp, mass…)' },
          order: { type: 'string', description: '"asc" | "desc"' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ship_details',
      description:
        'Full stats of a specific ship (raw game data + RSI). Includes all columns: speeds, HP, cargo, armor, signals, insurance.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exact or partial ship name (e.g. "Carrack", "Constellation Andromeda")' },
          env: { type: 'string', description: '"live" | "ptu"' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ship_full_stats',
      description:
        'Aggregated loadout stats for a ship: total DPS, total shield capacity, power, cooling, QD range, hardpoint list. USE to compare combat or flight performance.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Ship name' },
          env: { type: 'string', description: '"live" | "ptu"' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ship_loadout',
      description: 'Detailed list of all hardpoints on a ship and the currently equipped components (type, size, name, stats).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Ship name' },
          env: { type: 'string', description: '"live" | "ptu"' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ship_variants',
      description: 'Lists all variants of a ship (same chassis, different roles). E.g. Cutlass Black/Blue/Red/Steel.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Base ship name' },
          env: { type: 'string', description: '"live" | "ptu"' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ship_matrix',
      description:
        'Official RSI data for a ship: official dimensions, prices ($USD and aUEC), lore, production status, official description.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Ship name' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_ships',
      description:
        'Compare 2 to 4 ships side-by-side: raw stats AND aggregated loadout stats (DPS, shields, QD). USE as first choice for any comparison request — avoids multiple separate calls.',
      parameters: {
        type: 'object',
        properties: {
          names: { type: 'array', items: { type: 'string' }, description: 'List of ship names to compare (2-4)' },
          env: { type: 'string', description: '"live" | "ptu"' },
        },
        required: ['names'],
      },
    },
  },
  // ── Components ───────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_components',
      description: 'Search ship components. Returns detailed stats (DPS, range, shield capacity, power output…).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Component name' },
          type: {
            type: 'string',
            description:
              'Type: WeaponGun | Shield | PowerPlant | Cooler | QuantumDrive | Countermeasure | Missile | Radar | MainThruster | ManoThrust | EMP | QuantumInterdictionGenerator',
          },
          size: { type: 'number', description: 'Size 1-10' },
          grade: { type: 'string', description: 'Grade A-D (A is best)' },
          component_class: { type: 'string', description: 'Civilian | Competition | Industrial | Military | Stealth' },
          manufacturer: { type: 'string', description: 'Manufacturer code' },
          env: { type: 'string', description: '"live" | "ptu"' },
          sort: { type: 'string', description: 'Sort: sustained_dps, burst_dps, shield_capacity, qd_range, power_output…' },
          order: { type: 'string', description: '"asc" | "desc" (default desc)' },
          limit: { type: 'number', description: 'Max results (default 15)' },
        },
        required: [],
      },
    },
  },
  // ── Items ────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_items',
      description: 'Search FPS items: armor, helmets, weapons, gadgets, food, medical equipment…',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Item name' },
          type: {
            type: 'string',
            description:
              'Type: Char_Armor_Torso | Char_Armor_Legs | Char_Armor_Arms | Char_Helmet | Char_Armor_Backpack | WeaponPersonal | FoodProduct | MedicalDevice…',
          },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max results (default 15)' },
        },
        required: [],
      },
    },
  },
  // ── Crafting ─────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_crafting',
      description: 'Search crafting recipes. Returns name, category, station, craft time, quantity produced.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Recipe name or craftable item name' },
          category: { type: 'string', description: 'Craft category' },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recipe_details',
      description:
        'Full details of a crafting recipe: ingredients (quantities, optional), slot modifiers (quality, modifiers), required station.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exact recipe name' },
          env: { type: 'string', description: '"live" | "ptu"' },
        },
        required: ['name'],
      },
    },
  },
  // ── Mining ───────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_mining',
      description: 'Search minable elements: instability, resistance, mass, inert material.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Element name (Quantanium, Laranite, Bexalite, Taranite…)' },
          env: { type: 'string', description: '"live" | "ptu"' },
        },
        required: [],
      },
    },
  },
  // ── Missions ─────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_missions',
      description: 'Search missions: type, faction, danger, aUEC and XP rewards, required reputation.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Mission name or type' },
          faction: { type: 'string', description: 'Faction (Crusader Security, Advocacy, Nine Tails, Violent Nomad…)' },
          type: { type: 'string', description: 'Mission type' },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
    },
  },
  // ── Locations ────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_locations',
      description: 'Search in-game locations: planets, moons, stations, outposts, cities. Indicates if refuel/repair/landing available.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Location name' },
          type: { type: 'string', description: 'Type: Planet | Moon | Station | Outpost | City | LagrangePoint | JumpPoint' },
          system: { type: 'string', description: 'Star system (Stanton, Pyro, Nyx…)' },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max results (default 15)' },
        },
        required: [],
      },
    },
  },
  // ── Economy ──────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_commodities',
      description: 'Search tradeable commodities: type, SCU/unit, legality.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Commodity name' },
          type: { type: 'string', description: 'Commodity type' },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max results (default 15)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_commodity_prices',
      description:
        'Buy and sell prices for a commodity across all shops. Useful to find where to buy at the best price or sell for the most.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Commodity name (e.g. "Quantanium", "Medical Supplies")' },
          env: { type: 'string', description: '"live" | "ptu"' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_trade_routes',
      description: 'Calculates the best trade routes based on SCU and budget. Returns profit/unit, profit/SCU and total profit.',
      parameters: {
        type: 'object',
        properties: {
          scu: { type: 'number', description: 'Available cargo capacity in SCU' },
          budget: { type: 'number', description: 'Purchase budget in aUEC (optional)' },
          commodity: { type: 'string', description: 'Filter on a specific commodity (optional)' },
          buy_system: { type: 'string', description: 'Purchase system (Stanton, Pyro…)' },
          sell_system: { type: 'string', description: 'Sell system' },
          limit: { type: 'number', description: 'Number of routes returned (default 10)' },
          env: { type: 'string', description: '"live" | "ptu"' },
        },
        required: ['scu'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_shops',
      description: 'Search shops and their inventory. Useful to find where to buy an item or component.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Shop name or location name' },
          system: { type: 'string', description: 'Star system' },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
    },
  },
  // ── RSI / Lore ───────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_galactapedia',
      description: 'Search RSI Galactapedia: lore articles on races, factions, locations, ships, Star Citizen universe history.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Subject to search' },
          category: { type: 'string', description: 'Galactapedia category' },
          limit: { type: 'number', description: 'Max results (default 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_comm_links',
      description: 'Search CIG Comm-links: official announcements, letters from the chairman, patch notes, lore.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Subject to search' },
          limit: { type: 'number', description: 'Max results (default 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_starmap',
      description: 'Search star systems in RSI Starmap: description, affiliation, type.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'System name (Stanton, Pyro, Terra, Magnus…)' },
          limit: { type: 'number', description: 'Max results (default 5)' },
        },
        required: [],
      },
    },
  },
  // ── Manufacturers ────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_manufacturers',
      description: 'Lists all manufacturers with their code, name and ship count.',
      parameters: {
        type: 'object',
        properties: {
          env: { type: 'string', description: '"live" | "ptu"' },
        },
        required: [],
      },
    },
  },
  // ── Raw DB ───────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'query_database',
      description: `Executes a restricted read-only SELECT SQL query on public Starvis data.
Use this tool only for complex aggregations, rankings, cross-statistics or queries not covered by other tools.
Rules:
  - SELECT only, no comments, no semicolons, no SELECT *
  - Always schema-qualify tables
  - Only public game/rsi tables are available; meta/auth/user data is unavailable
  - Results are capped to 50 rows
Available tables:
  game.ships, game.components, game.items, game.missions, game.locations,
  game.commodities, game.commodity_prices, game.crafting_recipes, game.crafting_ingredients,
  game.ship_loadouts, game.ship_paints, game.shops, game.shop_inventory, game.manufacturers,
  rsi.ship_matrix, rsi.galactapedia, rsi.comm_links, rsi.starmap
SELECT only. Use $1, $2… for parameters.`,
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'Parameterized SELECT SQL query (no INSERT/UPDATE/DELETE)',
          },
          params: {
            type: 'array',
            items: { type: ['string', 'number', 'boolean'] },
            description: 'Query parameters ($1, $2…)',
          },
        },
        required: ['sql'],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ChatService
// ─────────────────────────────────────────────────────────────────────────────

export class ChatService {
  private openai: OpenAI;

  constructor(
    private gameDataService: GameDataService,
    private shipMatrixService: ShipMatrixService,
    private rsiWebsiteService: RsiWebsiteService,
    private prisma: PrismaLike,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.MISTRAL_API_KEY, baseURL: CHAT_PROVIDER_BASE_URL });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async resolveShipUuid(name: string, env: string): Promise<{ uuid: string; data: Record<string, unknown> } | null> {
    const result = await this.gameDataService.ships.getAllShips({ env, search: name, limit: 1, page: 1 });
    if (result.data.length) {
      const ship = result.data[0] as Record<string, unknown>;
      return { uuid: ship.uuid as string, data: ship };
    }
    // Fallback: strip the first word to handle "Anvil Arrow" → "Arrow", "Drake Cutlass Black" → "Cutlass Black"
    if (!name.includes(' ')) return null;
    const shorter = name.slice(name.indexOf(' ') + 1);
    const r2 = await this.gameDataService.ships.getAllShips({ env, search: shorter, limit: 1, page: 1 });
    if (!r2.data.length) return null;
    const ship = r2.data[0] as Record<string, unknown>;
    return { uuid: ship.uuid as string, data: ship };
  }

  /** Strips heavy fields unused by the LLM (blobs, long URLs, raw JSON) */
  private trim(obj: unknown): unknown {
    const SKIP = new Set(['game_data', 'thumbnail_large', 'ctm_url', 'loadout', 'hardpoints_raw']);
    const TRUNC_KEYS = new Set(['sm_description', 'description', 'content', 'lore']);
    const MAX_STR = 300;
    const MAX_ARR = 15;

    if (Array.isArray(obj)) return obj.slice(0, MAX_ARR).map((v) => this.trim(v));
    if (obj && typeof obj === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (SKIP.has(k)) continue;
        if (TRUNC_KEYS.has(k) && typeof v === 'string') {
          out[k] = v.slice(0, MAX_STR);
          continue;
        }
        out[k] = this.trim(v);
      }
      return out;
    }
    if (typeof obj === 'string' && obj.length > 600) return `${obj.slice(0, 600)}…`;
    return obj;
  }

  // ── Tool executor ─────────────────────────────────────────────────────────

  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const env = (args.env as string | undefined) ?? 'live';
    const limit = Math.min(Number(args.limit ?? 15), 25);

    try {
      switch (name) {
        // ── Ships ──────────────────────────────────────────────────────────
        case 'search_ships': {
          const rawQuery = (args.query as string | undefined) ?? '';
          const shipFilters = {
            env,
            manufacturer: args.manufacturer as string | undefined,
            role: args.role as string | undefined,
            career: args.career as string | undefined,
            vehicle_category: args.category as string | undefined,
            sort: args.sort as string | undefined,
            order: args.order as string | undefined,
            limit,
            page: 1,
          };
          let result = await this.gameDataService.ships.getAllShips({ ...shipFilters, search: rawQuery });
          // Fallback: "Anvil Arrow" → "Arrow" — strip first word and retry once
          if (result.data.length === 0 && rawQuery.includes(' ')) {
            const shorter = rawQuery.slice(rawQuery.indexOf(' ') + 1);
            const fallback = await this.gameDataService.ships.getAllShips({ ...shipFilters, search: shorter });
            if (fallback.data.length > 0) result = fallback;
          }
          return {
            total: result.total,
            ships: result.data.map((s: Record<string, unknown>) => ({
              name: s.name,
              manufacturer: s.manufacturer_code,
              role: s.role,
              career: s.career,
              vehicle_category: s.vehicle_category,
              size_y: s.size_y,
              scm_speed: s.scm_speed,
              max_speed: s.max_speed,
              cargo_capacity: s.cargo_capacity,
              crew_size: s.crew_size,
              shield_hp: s.shield_hp,
              total_hp: s.total_hp,
              weapon_damage_total: s.weapon_damage_total,
              production_status: s.production_status,
              uuid: s.uuid,
            })),
          };
        }

        case 'get_ship_details': {
          const found = await this.resolveShipUuid(args.name as string, env);
          if (!found) return { error: `Ship "${args.name}" not found` };
          const details = await this.gameDataService.ships.getShipByUuid(found.uuid, env);
          return details ?? found.data;
        }

        case 'get_ship_full_stats': {
          const found = await this.resolveShipUuid(args.name as string, env);
          if (!found) return { error: `Ship "${args.name}" not found` };
          const stats = await this.gameDataService.loadouts.getShipStats(found.uuid, env);
          return stats ?? { error: 'Loadout stats not available' };
        }

        case 'get_ship_loadout': {
          const found = await this.resolveShipUuid(args.name as string, env);
          if (!found) return { error: `Ship "${args.name}" not found` };
          const [loadout, hardpoints] = await Promise.all([
            this.gameDataService.loadouts.getShipLoadout(found.uuid, env),
            this.gameDataService.loadouts.getShipHardpoints(found.uuid, env),
          ]);
          return { ship: found.data.name, loadout, hardpoints };
        }

        case 'get_ship_variants': {
          const found = await this.resolveShipUuid(args.name as string, env);
          if (!found) return { error: `Ship "${args.name}" not found` };
          const variants = await this.gameDataService.ships.getShipVariants(found.uuid, env);
          return { base_ship: found.data.name, variants };
        }

        case 'compare_ships': {
          const names = (args.names as string[]).slice(0, 4);
          const results = await Promise.all(
            names.map(async (n) => {
              const found = await this.resolveShipUuid(n, env);
              if (!found) return { name: n, error: 'not found' };
              const [details, stats] = await Promise.all([
                this.gameDataService.ships.getShipByUuid(found.uuid, env),
                this.gameDataService.loadouts.getShipStats(found.uuid, env),
              ]);
              return { details, loadout_stats: stats?.stats ?? null };
            }),
          );
          return { comparison: results };
        }

        case 'get_ship_matrix': {
          const entry = await this.shipMatrixService.getByName(args.name as string);
          if (!entry) return { error: `"${args.name}" not found in RSI Ship Matrix` };
          return entry;
        }

        // ── Components ────────────────────────────────────────────────────
        case 'search_components': {
          const result = await this.gameDataService.components.getAllComponents({
            env,
            search: (args.query as string | undefined) ?? '',
            type: args.type as string | undefined,
            grade: args.grade != null ? String(args.grade) : undefined,
            component_class: args.component_class as string | undefined,
            size: args.size != null ? String(args.size) : undefined,
            manufacturer: args.manufacturer as string | undefined,
            sort: args.sort as string | undefined,
            order: (args.order as string | undefined) ?? 'desc',
            limit,
            page: 1,
          });
          return { total: result.total, components: result.data };
        }

        // ── Items ─────────────────────────────────────────────────────────
        case 'search_items': {
          const result = await this.gameDataService.items.getAllItems({
            env,
            search: (args.query as string | undefined) ?? '',
            type: args.type as string | undefined,
            limit,
            page: 1,
          });
          return { total: result.total, items: result.data };
        }

        // ── Crafting ──────────────────────────────────────────────────────
        case 'search_crafting': {
          const result = await this.gameDataService.crafting.getRecipes({
            env,
            search: (args.query as string | undefined) ?? '',
            category: args.category as string | undefined,
            limit,
            page: 1,
          });
          return { total: result.total, recipes: result.data };
        }

        case 'get_recipe_details': {
          const search = await this.gameDataService.crafting.getRecipes({
            env,
            search: args.name as string,
            limit: 1,
            page: 1,
          });
          if (!search.data.length) return { error: `Recipe "${args.name}" not found` };
          const recipe = search.data[0] as Record<string, unknown>;
          const full = await this.gameDataService.crafting.getRecipeByUuid(recipe.uuid as string, env);
          return full ?? recipe;
        }

        // ── Mining ────────────────────────────────────────────────────────
        case 'search_mining': {
          const elements = await this.gameDataService.mining.getAllElements(env);
          const query = ((args.query as string | undefined) ?? '').toLowerCase();
          const filtered = query
            ? elements.filter((e: Record<string, unknown>) =>
                String(e.name ?? '')
                  .toLowerCase()
                  .includes(query),
              )
            : elements;
          return { elements: filtered.slice(0, 25) };
        }

        // ── Missions ──────────────────────────────────────────────────────
        case 'search_missions': {
          const result = await this.gameDataService.missions.getMissions({
            env,
            search: (args.query as string | undefined) ?? '',
            type: args.type as string | undefined,
            faction: args.faction as string | undefined,
            limit,
            page: 1,
          });
          return { total: result.total, missions: result.data };
        }

        // ── Locations ─────────────────────────────────────────────────────
        case 'search_locations': {
          const result = await this.gameDataService.locations.getLocations({
            env,
            search: (args.query as string | undefined) ?? '',
            type: args.type as string | undefined,
            limit,
            page: 1,
          });
          return { total: result.total, locations: result.data };
        }

        // ── Economy ───────────────────────────────────────────────────────
        case 'search_commodities': {
          const result = await this.gameDataService.commodities.getAllCommodities({
            env,
            search: (args.query as string | undefined) ?? '',
            type: args.type as string | undefined,
            limit,
            page: 1,
          });
          return { total: result.total, commodities: result.data };
        }

        case 'get_commodity_prices': {
          // Find the commodity uuid first
          const comms = await this.gameDataService.commodities.getAllCommodities({
            env,
            search: args.name as string,
            limit: 1,
            page: 1,
          });
          if (!comms.data.length) return { error: `Commodity "${args.name}" not found` };
          const comm = comms.data[0] as Record<string, unknown>;
          const prices = await this.gameDataService.trade.getCommodityPrices(comm.uuid as string, env);
          return {
            commodity: comm.name,
            occupancy_scu: comm.occupancy_scu,
            prices: prices.map((p: Record<string, unknown>) => ({
              shop: p.shop_name,
              system: p.system,
              city: p.city,
              buy_price: p.buy_price,
              sell_price: p.sell_price,
              stock: p.stock,
              demand: p.demand,
            })),
          };
        }

        case 'find_trade_routes': {
          const routes = await this.gameDataService.trade.findBestRoutes({
            scu: Number(args.scu),
            budget: args.budget != null ? Number(args.budget) : undefined,
            commodity: args.commodity as string | undefined,
            buySystem: args.buy_system as string | undefined,
            sellSystem: args.sell_system as string | undefined,
            limit: Math.min(limit, 20),
            env,
          });
          return { routes };
        }

        case 'search_shops': {
          const result = await this.gameDataService.shops.getShops({
            env,
            search: (args.query as string | undefined) ?? (args.system as string | undefined) ?? '',
            limit,
            page: 1,
          });
          return { total: result.total, shops: result.data };
        }

        // ── RSI / Lore ────────────────────────────────────────────────────
        case 'search_galactapedia': {
          const result = await this.rsiWebsiteService.getGalactapediaEntries({
            search: args.query as string,
            category: args.category as string | undefined,
            limit: Math.min(limit, 5),
            page: 1,
          });
          return { total: result.total, entries: result.data };
        }

        case 'search_comm_links': {
          const result = await this.rsiWebsiteService.getCommLinks({
            search: args.query as string,
            limit: Math.min(limit, 5),
            page: 1,
          });
          return { total: result.total, comm_links: result.data };
        }

        case 'search_starmap': {
          const result = await this.rsiWebsiteService.getStarmapSystems({
            search: (args.query as string | undefined) ?? '',
            limit: Math.min(limit, 10),
            page: 1,
          });
          return { total: result.total, systems: result.data };
        }

        // ── Manufacturers ─────────────────────────────────────────────────
        case 'get_manufacturers': {
          const list = await this.gameDataService.ships.getShipManufacturers(env);
          return { manufacturers: list };
        }

        // ── DB brute ──────────────────────────────────────────────────────
        case 'query_database': {
          const validation = validateQueryDatabaseSql(args.sql, args.params);
          if (!validation.ok) {
            logger.warn('Chat database query rejected', { module: 'Chat', reason: validation.error });
            return { error: validation.error };
          }
          logger.info('Chat database query accepted', { module: 'Chat', params: validation.params.length });
          const rows = await (this.prisma as any).$queryRawUnsafe(validation.sql, ...validation.params);
          const data = Array.isArray(rows) ? rows.slice(0, 50) : rows;
          return { rows: data, count: Array.isArray(data) ? data.length : 1 };
        }

        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (e) {
      return { error: String(e) };
    }
  }

  // ── Stream ────────────────────────────────────────────────────────────────

  async streamChat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    const groqMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      // Phase 1 — agentic loop: resolve tool calls (non-streaming)
      // Tool calls from the same response are executed IN PARALLEL.
      let iterations = 0;
      while (iterations < MAX_ITER) {
        const response = await this.openai.chat.completions.create({
          model: TOOL_MODEL,
          messages: groqMessages,
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 512,
          temperature: 0.1,
          stream: false,
        });

        const msg = response.choices[0]?.message;
        if (!msg) break;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          iterations++;
          groqMessages.push(msg);

          // PARALLEL execution of all tool calls in the response
          const results = await Promise.all(
            msg.tool_calls.map(async (tc) => {
              if (tc.type !== 'function') return { id: tc.id, result: null };
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tc.function.arguments);
              } catch {
                /* ignore */
              }
              const result = await this.executeTool(tc.function.name, args);
              return { id: tc.id, result };
            }),
          );

          // Inject results in order (required by the API)
          for (const { id, result } of results) {
            groqMessages.push({
              role: 'tool',
              tool_call_id: id,
              content: JSON.stringify(this.trim(result)),
            });
          }
          continue;
        }
        break;
      }

      // Phase 2 — stream the final response (tool_choice: none to force a text response)
      const stream = await this.openai.chat.completions.create({
        model: RESPONSE_MODEL,
        messages: groqMessages,
        tools: TOOLS,
        tool_choice: 'none',
        max_tokens: 4096,
        temperature: 0.2,
        stream: true,
      });

      let fullText = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) fullText += delta;
      }
      onChunk(fullText || 'No response generated.');
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e : new Error(String(e)));
    }
  }

  // ── Ask (non-streaming, pour Discord) ────────────────────────────────────

  async ask(messages: ChatMessage[]): Promise<string> {
    const groqMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      let iterations = 0;
      while (iterations < MAX_ITER) {
        const response = await this.openai.chat.completions.create({
          model: TOOL_MODEL,
          messages: groqMessages,
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 512,
          temperature: 0.1,
          stream: false,
        });

        const msg = response.choices[0]?.message;
        if (!msg) break;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          iterations++;
          groqMessages.push(msg);
          const results = await Promise.all(
            msg.tool_calls.map(async (tc) => {
              if (tc.type !== 'function') return { id: tc.id, result: null };
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tc.function.arguments);
              } catch {
                /* ignore */
              }
              const result = await this.executeTool(tc.function.name, args);
              return { id: tc.id, result };
            }),
          );
          for (const { id, result } of results) {
            groqMessages.push({ role: 'tool', tool_call_id: id, content: JSON.stringify(this.trim(result)) });
          }
          continue;
        }
        break;
      }

      const final = await this.openai.chat.completions.create({
        model: RESPONSE_MODEL,
        messages: groqMessages,
        tools: TOOLS,
        tool_choice: 'none',
        max_tokens: 4096,
        temperature: 0.2,
        stream: false,
      });

      const content = final.choices[0]?.message?.content;
      const text = content?.trim() ? content : 'No response generated.';
      return text;
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
}
