/**
 * ChatService — IA Starvis, Mistral AI avec tool use exhaustif.
 *
 * Couverture DB complète (schémas game + rsi + meta) :
 *   Ships / Ground / Gravlev — stats complètes, loadout, hardpoints, variants
 *   Components              — armes, boucliers, thrusters, QD, coolers…
 *   Items                   — armures, casques, armes FPS, gadgets
 *   Crafting                — recettes, ingrédients, slot modifiers
 *   Mining                  — éléments, compositions rocheuses
 *   Missions                — types, factions, récompenses
 *   Locations               — planètes, lunes, stations, avant-postes
 *   Commodities             — matières premières, prix d'achat/vente
 *   Trade routes            — meilleurs itinéraires de commerce
 *   Shops                   — inventaires
 *   Manufacturers           — constructeurs
 *   Ship Matrix (RSI)       — données officielles RSI (dimensions, prix, lore)
 *   Galactapedia            — lore RSI
 *   Comm-links              — communications CIG
 *   Starmap                 — systèmes stellaires
 */

import OpenAI from 'openai';
import type { PrismaLike } from '@starvis/db';
import type { GameDataService } from './game-data-service.js';
import type { RsiWebsiteService } from './rsi-website-service.js';
import type { ShipMatrixService } from './ship-matrix-service.js';

const TOOL_MODEL = 'mistral-small-latest';
const RESPONSE_MODEL = 'mistral-small-latest';
const MAX_ITER = 2;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt — expert Star Citizen + guide d'utilisation des outils
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es Starvis, l'IA officielle de la base de données Starvis — données extraites directement du jeu Star Citizen (version LIVE).

## Langue
Réponds en **français** par défaut. Adapte-toi à la langue de l'utilisateur.

## Règle absolue
Pour toute question sur Star Citizen, **utilise toujours un outil** pour interroger la base avant de répondre. Ne jamais inventer de statistiques.

---

## Données disponibles & champs importants

### Vaisseaux (schema game, table ships)
Identité : uuid, class_name, name, manufacturer_code, manufacturer_name, career, role, vehicle_category (ship/ground/gravlev), variant_type, production_status, short_name
Physique : mass (kg), total_hp, size_x (largeur m), size_y (longueur m), size_z (hauteur m)
Vol : scm_speed (m/s), max_speed (m/s), boost_speed_forward, boost_speed_backward, pitch_max, yaw_max, roll_max (degrés/s), boost_ramp_up/down (s)
Ressources : hydrogen_fuel_capacity (L), quantum_fuel_capacity (L), cargo_capacity (SCU), crew_size
Combat : shield_hp (HP total boucliers), weapon_damage_total (DPS armes), missile_damage_total (dégâts missiles)
Armure : armor_physical, armor_energy, armor_distortion, armor_hp, armor_phys_resist, armor_energy_resist
Signatures : armor_signal_ir (chaleur), armor_signal_em (électromagnétique), armor_signal_cs (cross-section)
Assurance : insurance_claim_time (min), insurance_expedite_cost (aUEC)
RSI : ship_matrix_id, thumbnail, production_status (Flight Ready / In Production / In Concept), store_url, min_crew, max_crew, sm_description

### Stats agrégées du loadout (via get_ship_full_stats)
weapons_dps_total, weapons_alpha_total, shield_capacity_total, shield_regen_total, shield_faces, power_output_total, heat_dissipation_total, qd_range (AU), qd_speed (m/s), qd_cooldown (s), countermeasure_count, missile_damage_total, hardpoints (liste des emplacements)

### Composants (schema game, table components)
uuid, name, class_name, type (WeaponGun/Shield/PowerPlant/Cooler/QuantumDrive/Countermeasure/Missile/Radar/MainThruster/ManoThrust…), sub_type, size (1-10), grade (1-4, A=meilleur), manufacturer_code, mass
Armes : fire_rate (coups/min), ammo_speed (m/s), ammo_lifetime (s), range (m), dmg_physical, dmg_energy, dmg_distortion, dmg_thermal, dmg_biochemical, burst_dps, sustained_dps, alpha_damage
Boucliers : shield_capacity, shield_regen, face_coverage (faces protégées)
QD : qd_range (AU), qd_speed (m/s), qd_cooldown (s), qd_fuel_rate
Power plants : power_output
Coolers : cooling_rate

### Items (schema game, table items)
uuid, name, class_name, type (Char_Armor_Torso/Char_Helmet/WeaponPersonal/FoodProduct…), sub_type, manufacturer_code, mass
Armures FPS : armor_physical, armor_energy, armor_distortion, armor_signal_ir, armor_signal_em

### Crafting (schema game, table crafting_recipes)
uuid, name, output_item_name, output_item_uuid, category, station_type, craft_time (s), quantity_produced, schematic_uuid
Ingrédients : item_name, quantity, is_optional, scu
Slot modifiers : slot_name, property_name, start_quality, end_quality, modifier_at_start, modifier_at_end

### Mining (schema game)
Éléments : uuid, name, description, instability, resistance, mass, inert_material
Compositions rocheuses : liste d'éléments avec pourcentages

### Missions (schema game, table missions)
uuid, name, type, faction, system_name, category, danger_level (1-5), completion_time_secs, reward_min, reward_max, required_reputation, reputation_reward, base_xp

### Locations (schema game, table locations)
uuid, name, type (Planet/Moon/Station/Outpost/City/LagrangePoint…), system, parent_name, has_shops, has_landing_zone, has_refuel, has_restock, has_repair

### Commodities (schema game, table commodities)
uuid, name, type, description, occupancy_scu (SCU par unité), is_illegal, is_volatile

### Prix de commodités (schema game, table commodity_prices)
buy_price (aUEC/unité), sell_price, stock, demand, shop_name, system, city

### Trade routes (calculées à la volée)
commodity_name, buy_price, buy_shop, buy_system, sell_price, sell_shop, sell_system, profit_per_unit, profit_per_scu, total_profit (pour N SCU)

### Ship Matrix RSI (schema rsi, table ship_matrix)
name, manufacturer_code, manufacturer_name, length, beam, height, mass, cargo_capacity, min_crew, max_crew, scm_speed, afterburner_speed, pitch_max, yaw_max, roll_max, price_usd, price_uec (prix ingame), production_status, description, url

### Galactapedia (schema rsi)
id, title, content (texte lore), category, tags

### Comm-links (schema rsi)
id, title, content, url, published_at, category

### Starmap (schema rsi)
id, code, name, type, description, affiliation

---

## Calculs courants

**DPS d'une arme** = burst_dps (rafale) ou sustained_dps (soutenu) — déjà calculés en DB
**DPS total vaisseau** = weapon_damage_total (déjà calculé via loadout)
**Portée effective d'une arme** = ammo_speed × ammo_lifetime (en mètres)
**Profit trade** = (sell_price - buy_price) × scu_quantity / occupancy_scu
**Ratio SCU/budget** = budget / buy_price = SCU max achetables
**Autonomie QD** = quantum_fuel_capacity / qd_fuel_rate (en AU)

---

## Noms de vaisseaux avec fabricant

Quand l'utilisateur mentionne un vaisseau avec son fabricant (ex : "Anvil Arrow", "Origin 300i", "Drake Cutlass Black"), utilise **le code constructeur dans `manufacturer`** et **le modèle seul dans `query`** :
- "Anvil Arrow" → `manufacturer: "ANVL", query: "Arrow"`
- "Origin 300i" → `manufacturer: "ORIG", query: "300i"`
- "Drake Cutlass Black" → `manufacturer: "DRAK", query: "Cutlass Black"`
- "RSI Constellation Andromeda" → `manufacturer: "RSI", query: "Constellation Andromeda"`

Si tu ne connais pas le code constructeur, passe juste le modèle dans `query` sans le nom du fabricant.

## Stratégie d'utilisation des outils

1. Question vaisseau → search_ships (liste) puis get_ship_details (stats brutes) et/ou get_ship_full_stats (loadout agrégé)
2. Comparer des vaisseaux → search_ships pour chacun puis get_ship_full_stats
3. Meilleure arme d'un calibre → search_components avec type+size, trier par sustained_dps
4. Route commerciale → find_trade_routes
5. Prix d'une commodité → get_commodity_prices
6. Recette de craft → search_crafting puis get_recipe_details
7. Lore / histoire → search_galactapedia ou search_comm_links
8. Où acheter un item → search_shops
9. Variants d'un vaisseau → get_ship_variants

## Formatage des réponses

- **Gras** pour les chiffres clés et noms importants.
- **Listes à puces** pour énumérer.
- **Tableaux** : utilise TOUJOURS des blocs de code (triple backtick) pour les tableaux — jamais la syntaxe pipe/markdown qui ne s'affiche pas correctement sur Discord et l'interface web. Exemple de rendu attendu dans un bloc code :
  Vaisseau      | SCM   | Cargo
  Carrack       | 120   | 456 SCU
  Constellation | 185   | 96 SCU
- Réponds de façon **concise** : pas de section inutile si l'info tient en quelques lignes.`;

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  // ── Ships ────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_ships',
      description: 'Recherche des vaisseaux, véhicules terrestres ou gravlev. Retourne les stats de base de plusieurs résultats.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom partiel du vaisseau' },
          manufacturer: { type: 'string', description: 'Code constructeur (ORIG, ANVL, RSI, CRUS, DRAK, MISC, BANU, XI-AN, VANDUL…)' },
          category: { type: 'string', description: '"ship" | "ground" | "gravlev"' },
          role: { type: 'string', description: 'Rôle (fighter, bomber, mining, cargo, exploration, stealth, support…)' },
          career: { type: 'string', description: 'Carrière (Combat, Transport, Exploration, Industrial, Support…)' },
          env: { type: 'string', description: '"live" (défaut) | "ptu"' },
          limit: { type: 'number', description: 'Max résultats (défaut 10, max 20)' },
          sort: { type: 'string', description: 'Champ de tri (scm_speed, cargo_capacity, shield_hp, mass…)' },
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
      description: 'Stats complètes d\'un vaisseau spécifique (données brutes jeu + RSI). Inclut toutes les colonnes : vitesses, HP, cargo, armure, signaux, assurance.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom exact ou partiel du vaisseau (ex: "Carrack", "Constellation Andromeda")' },
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
      description: 'Stats agrégées du loadout d\'un vaisseau : DPS total, capacité de bouclier totale, puissance, refroidissement, portée QD, liste des hardpoints. UTILISER pour comparer les performances de combat ou de vol.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom du vaisseau' },
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
      description: 'Liste détaillée de tous les hardpoints d\'un vaisseau et les composants actuellement équipés (type, taille, nom, stats).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom du vaisseau' },
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
      description: 'Liste tous les variants d\'un vaisseau (même châssis, rôles différents). Ex: Cutlass Black/Blue/Red/Steel.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom du vaisseau de base' },
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
      description: 'Données officielles RSI d\'un vaisseau : dimensions officielles, prix ($USD et aUEC), lore, statut de production, description officielle.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom du vaisseau' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_ships',
      description: 'Compare 2 à 4 vaisseaux côte-à-côte : stats brutes ET stats agrégées du loadout (DPS, boucliers, QD). UTILISER en priorité pour toute demande de comparaison — évite plusieurs appels séparés.',
      parameters: {
        type: 'object',
        properties: {
          names: { type: 'array', items: { type: 'string' }, description: 'Liste des noms de vaisseaux à comparer (2-4)' },
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
      description: 'Recherche des composants vaisseau. Retourne stats détaillées (DPS, portée, capacité bouclier, output power…).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom du composant' },
          type: { type: 'string', description: 'Type : WeaponGun | Shield | PowerPlant | Cooler | QuantumDrive | Countermeasure | Missile | Radar | MainThruster | ManoThrust | EMP | QuantumInterdictionGenerator' },
          size: { type: 'number', description: 'Taille 1-10' },
          grade: { type: 'number', description: 'Grade 1-4 (4=grade A, meilleur)' },
          manufacturer: { type: 'string', description: 'Code constructeur' },
          env: { type: 'string', description: '"live" | "ptu"' },
          sort: { type: 'string', description: 'Tri : sustained_dps, burst_dps, shield_capacity, qd_range, power_output…' },
          order: { type: 'string', description: '"asc" | "desc" (défaut desc)' },
          limit: { type: 'number', description: 'Max résultats (défaut 15)' },
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
      description: 'Recherche items FPS : armures, casques, armes, gadgets, nourriture, équipements médicaux…',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom de l\'item' },
          type: { type: 'string', description: 'Type : Char_Armor_Torso | Char_Armor_Legs | Char_Armor_Arms | Char_Helmet | Char_Armor_Backpack | WeaponPersonal | FoodProduct | MedicalDevice…' },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max résultats (défaut 15)' },
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
      description: 'Recherche de recettes de craft. Retourne nom, catégorie, station, temps de craft, quantité produite.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom de la recette ou de l\'item craftable' },
          category: { type: 'string', description: 'Catégorie de craft' },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max résultats (défaut 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recipe_details',
      description: 'Détails complets d\'une recette de craft : ingrédients (quantités, optionnels), slot modifiers (qualité, modificateurs), station requise.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom exact de la recette' },
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
      description: 'Recherche des éléments minables : instabilité, résistance, masse, matière inerte.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom de l\'élément (Quantanium, Laranite, Bexalite, Taranite…)' },
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
      description: 'Recherche de missions : type, faction, danger, récompenses aUEC et XP, réputation requise.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom ou type de mission' },
          faction: { type: 'string', description: 'Faction (Crusader Security, Advocacy, Nine Tails, Violent Nomad…)' },
          type: { type: 'string', description: 'Type de mission' },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max résultats (défaut 10)' },
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
      description: 'Recherche de lieux in-game : planètes, lunes, stations, avant-postes, villes. Indique si ravitaillement/réparations/atterrissage disponibles.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom du lieu' },
          type: { type: 'string', description: 'Type : Planet | Moon | Station | Outpost | City | LagrangePoint | JumpPoint' },
          system: { type: 'string', description: 'Système stellaire (Stanton, Pyro, Nyx…)' },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max résultats (défaut 15)' },
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
      description: 'Recherche de commodités échangeables : type, SCU/unité, légalité.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom de la commodité' },
          type: { type: 'string', description: 'Type de commodité' },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max résultats (défaut 15)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_commodity_prices',
      description: 'Prix d\'achat et de vente d\'une commodité dans tous les shops. Utile pour identifier où acheter au meilleur prix ou vendre le plus cher.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom de la commodité (ex: "Quantanium", "Medical Supplies")' },
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
      description: 'Calcule les meilleures routes commerciales selon ton SCU et budget. Retourne profit/unité, profit/SCU et profit total.',
      parameters: {
        type: 'object',
        properties: {
          scu: { type: 'number', description: 'Capacité cargo disponible en SCU' },
          budget: { type: 'number', description: 'Budget d\'achat en aUEC (optionnel)' },
          commodity: { type: 'string', description: 'Filtrer sur une commodité spécifique (optionnel)' },
          buy_system: { type: 'string', description: 'Système d\'achat (Stanton, Pyro…)' },
          sell_system: { type: 'string', description: 'Système de vente' },
          limit: { type: 'number', description: 'Nombre de routes retournées (défaut 10)' },
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
      description: 'Recherche des magasins (shops) et leur inventaire. Utile pour savoir où acheter un item ou composant.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom du shop ou de la location' },
          system: { type: 'string', description: 'Système stellaire' },
          env: { type: 'string', description: '"live" | "ptu"' },
          limit: { type: 'number', description: 'Max résultats (défaut 10)' },
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
      description: 'Recherche dans la Galactapedia RSI : articles de lore sur les races, factions, lieux, vaisseaux, histoire de l\'univers Star Citizen.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Sujet à rechercher' },
          category: { type: 'string', description: 'Catégorie Galactapedia' },
          limit: { type: 'number', description: 'Max résultats (défaut 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_comm_links',
      description: 'Recherche dans les Comm-links CIG : annonces officielles, lettres des fondateurs, notes de patch, lore.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Sujet à rechercher' },
          limit: { type: 'number', description: 'Max résultats (défaut 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_starmap',
      description: 'Recherche des systèmes stellaires dans la Starmap RSI : description, affiliation, type.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom du système (Stanton, Pyro, Terra, Magnus…)' },
          limit: { type: 'number', description: 'Max résultats (défaut 5)' },
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
      description: 'Liste tous les constructeurs avec leur code, nom et nombre de vaisseaux.',
      parameters: {
        type: 'object',
        properties: {
          env: { type: 'string', description: '"live" | "ptu"' },
        },
        required: [],
      },
    },
  },
  // ── DB brute ─────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'query_database',
      description: `Exécute une requête SQL SELECT libre sur la base de données du jeu.
Utilise cet outil pour des agrégations complexes, classements, statistiques croisées ou toute requête non couverte par les autres outils.
Schémas disponibles : game, rsi.
Tables principales :
  game.ships, game.components, game.items, game.missions, game.locations,
  game.commodities, game.commodity_prices, game.crafting_recipes, game.crafting_ingredients,
  game.ship_loadouts, game.ship_paints, game.shops, game.shop_inventory, game.manufacturers,
  rsi.ship_matrix, rsi.galactapedia, rsi.comm_links, rsi.starmap
Uniquement SELECT. Utilise $1, $2… pour les paramètres.`,
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'Requête SELECT SQL paramétrée (pas de INSERT/UPDATE/DELETE)',
          },
          params: {
            type: 'array',
            items: { type: ['string', 'number', 'boolean'] },
            description: 'Paramètres de la requête ($1, $2…)',
          },
        },
        required: ['sql'],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convertit les tableaux markdown pipe (| col | col |) en blocs de code,
 * qui s'affichent correctement sur Discord et dans les embeds web.
 * Les tableaux déjà dans un bloc de code existant sont ignorés.
 */
function wrapTablesInCodeBlock(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inCodeBlock = false;
  let inTable = false;

  for (const line of lines) {
    // Suivi des blocs de code existants
    if (/^\s*```/.test(line)) {
      if (inTable) { inTable = false; out.push('```'); }
      inCodeBlock = !inCodeBlock;
      out.push(line);
      continue;
    }

    if (inCodeBlock) {
      out.push(line);
      continue;
    }

    const isTableLine = /^\s*\|/.test(line);
    if (isTableLine && !inTable) {
      inTable = true;
      out.push('```');
    } else if (!isTableLine && inTable) {
      inTable = false;
      out.push('```');
    }
    // Nettoie le gras (**text**) à l'intérieur des cellules de tableau
    out.push(inTable ? line.replace(/\*\*(.*?)\*\*/g, '$1') : line);
  }
  if (inTable) out.push('```');

  return out.join('\n');
}

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
    this.openai = new OpenAI({ apiKey: process.env.MISTRAL_API_KEY, baseURL: 'https://api.mistral.ai/v1' });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async resolveShipUuid(name: string, env: string): Promise<{ uuid: string; data: Record<string, unknown> } | null> {
    const result = await this.gameDataService.ships.getAllShips({ env, search: name, limit: 1, page: 1 });
    if (result.data.length) {
      const ship = result.data[0] as Record<string, unknown>;
      return { uuid: ship['uuid'] as string, data: ship };
    }
    // Fallback: strip the first word to handle "Anvil Arrow" → "Arrow", "Drake Cutlass Black" → "Cutlass Black"
    if (!name.includes(' ')) return null;
    const shorter = name.slice(name.indexOf(' ') + 1);
    const r2 = await this.gameDataService.ships.getAllShips({ env, search: shorter, limit: 1, page: 1 });
    if (!r2.data.length) return null;
    const ship = r2.data[0] as Record<string, unknown>;
    return { uuid: ship['uuid'] as string, data: ship };
  }

  /** Supprime les champs lourds inutiles pour le LLM (blobs, URLs longues, JSON brut) */
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
        if (TRUNC_KEYS.has(k) && typeof v === 'string') { out[k] = v.slice(0, MAX_STR); continue; }
        out[k] = this.trim(v);
      }
      return out;
    }
    if (typeof obj === 'string' && obj.length > 600) return obj.slice(0, 600) + '…';
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
              name: s['name'], manufacturer: s['manufacturer_code'], role: s['role'], career: s['career'],
              vehicle_category: s['vehicle_category'], size_y: s['size_y'],
              scm_speed: s['scm_speed'], max_speed: s['max_speed'],
              cargo_capacity: s['cargo_capacity'], crew_size: s['crew_size'],
              shield_hp: s['shield_hp'], total_hp: s['total_hp'],
              weapon_damage_total: s['weapon_damage_total'],
              production_status: s['production_status'], uuid: s['uuid'],
            })),
          };
        }

        case 'get_ship_details': {
          const found = await this.resolveShipUuid(args.name as string, env);
          if (!found) return { error: `Vaisseau "${args.name}" introuvable` };
          const details = await this.gameDataService.ships.getShipByUuid(found.uuid, env);
          return details ?? found.data;
        }

        case 'get_ship_full_stats': {
          const found = await this.resolveShipUuid(args.name as string, env);
          if (!found) return { error: `Vaisseau "${args.name}" introuvable` };
          const stats = await this.gameDataService.loadouts.getShipStats(found.uuid, env);
          return stats ?? { error: 'Stats de loadout non disponibles' };
        }

        case 'get_ship_loadout': {
          const found = await this.resolveShipUuid(args.name as string, env);
          if (!found) return { error: `Vaisseau "${args.name}" introuvable` };
          const [loadout, hardpoints] = await Promise.all([
            this.gameDataService.loadouts.getShipLoadout(found.uuid, env),
            this.gameDataService.loadouts.getShipHardpoints(found.uuid, env),
          ]);
          return { ship: found.data['name'], loadout, hardpoints };
        }

        case 'get_ship_variants': {
          const found = await this.resolveShipUuid(args.name as string, env);
          if (!found) return { error: `Vaisseau "${args.name}" introuvable` };
          const variants = await this.gameDataService.ships.getShipVariants(found.uuid, env);
          return { base_ship: found.data['name'], variants };
        }

        case 'compare_ships': {
          const names = (args.names as string[]).slice(0, 4);
          const results = await Promise.all(
            names.map(async (n) => {
              const found = await this.resolveShipUuid(n, env);
              if (!found) return { name: n, error: 'introuvable' };
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
          if (!entry) return { error: `"${args.name}" non trouvé dans la Ship Matrix RSI` };
          return entry;
        }

        // ── Components ────────────────────────────────────────────────────
        case 'search_components': {
          const result = await this.gameDataService.components.getAllComponents({
            env,
            search: (args.query as string | undefined) ?? '',
            type: args.type as string | undefined,
            grade: args.grade != null ? String(args.grade) : undefined,
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
          if (!search.data.length) return { error: `Recette "${args.name}" introuvable` };
          const recipe = search.data[0] as Record<string, unknown>;
          const full = await this.gameDataService.crafting.getRecipeByUuid(recipe['uuid'] as string, env);
          return full ?? recipe;
        }

        // ── Mining ────────────────────────────────────────────────────────
        case 'search_mining': {
          const elements = await this.gameDataService.mining.getAllElements(env);
          const query = ((args.query as string | undefined) ?? '').toLowerCase();
          const filtered = query
            ? elements.filter((e: Record<string, unknown>) => String(e['name'] ?? '').toLowerCase().includes(query))
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
          if (!comms.data.length) return { error: `Commodité "${args.name}" introuvable` };
          const comm = comms.data[0] as Record<string, unknown>;
          const prices = await this.gameDataService.trade.getCommodityPrices(comm['uuid'] as string, env);
          return {
            commodity: comm['name'],
            occupancy_scu: comm['occupancy_scu'],
            prices: prices.map((p: Record<string, unknown>) => ({
              shop: p['shop_name'], system: p['system'], city: p['city'],
              buy_price: p['buy_price'], sell_price: p['sell_price'],
              stock: p['stock'], demand: p['demand'],
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
          const sql = (args.sql as string).trim();
          if (!/^\s*SELECT\b/i.test(sql)) return { error: 'Seules les requêtes SELECT sont autorisées' };
          const params = Array.isArray(args.params) ? args.params : [];
          const rows = await (this.prisma as any).$queryRawUnsafe(sql, ...params);
          const data = Array.isArray(rows) ? rows.slice(0, 50) : rows;
          return { rows: data, count: Array.isArray(data) ? data.length : 1 };
        }

        default:
          return { error: `Outil inconnu : ${name}` };
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
      // Phase 1 — boucle agentique : résolution des tool calls (non-streaming)
      // Les tool calls d'une même réponse sont exécutés EN PARALLÈLE.
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

          // Exécution PARALLÈLE de tous les tool calls de la réponse
          const results = await Promise.all(
            msg.tool_calls.map(async (tc) => {
              let args: Record<string, unknown> = {};
              try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
              const result = await this.executeTool(tc.function.name, args);
              return { id: tc.id, result };
            }),
          );

          // Injecter les résultats dans l'ordre (requis par l'API)
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

      // Phase 2 — stream la réponse finale (tool_choice: none pour forcer une réponse textuelle)
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
      onChunk(wrapTablesInCodeBlock(fullText || 'Aucune réponse générée.'));
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
              let args: Record<string, unknown> = {};
              try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
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
      const text = content && content.trim() ? content : 'Aucune réponse générée.';
      return wrapTablesInCodeBlock(text);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
}
