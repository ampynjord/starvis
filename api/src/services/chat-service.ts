/**
 * ChatService — AI chatbot backed by Groq (Llama 3.3 70B) with tool use.
 *
 * Tools give the LLM live access to the Starvis database:
 *   search_ships       — search ships by name/manufacturer/category
 *   get_ship_details   — full ship data by uuid or name
 *   search_components  — search weapon/shield/thruster components
 *   search_items       — search items (armor, clothing, gadgets…)
 *   search_crafting    — search crafting recipes
 *   search_mining      — list mineable elements
 *   search_missions    — search missions
 *   search_locations   — search in-game locations
 *   search_commodities — search tradeable commodities
 */

import Groq from 'groq-sdk';
import type { GameDataService } from './game-data-service.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `Tu es Starvis, l'IA officielle de la base de données Starvis pour Star Citizen.

Tu réponds en **français** par défaut, mais tu t'adaptes à la langue de l'utilisateur.

Ton rôle :
- Répondre aux questions sur les vaisseaux, composants, armes, armures, objets, recettes de craft, missions, ressources minières et lieux du jeu Star Citizen.
- Utiliser tes outils pour consulter la base de données Starvis en temps réel — les données sont extraites directement du jeu (version LIVE).
- Être concis, précis et utile. Évite les longues introductions.

Règles :
- Si une question concerne Star Citizen, utilise **toujours** un outil pour chercher dans la base avant de répondre.
- Ne pas inventer de statistiques — utilise uniquement les données de tes outils.
- Pour comparer des vaisseaux, utilise search_ships puis get_ship_details.
- Formate les réponses en markdown pour la lisibilité (tableaux, listes).
- Si tu ne trouves pas la donnée, dis-le clairement.

Tu es un expert Star Citizen. Tu connais le lore, les mécaniques de jeu et le contexte de chaque objet.`;

const TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_ships',
      description: 'Search ships, ground vehicles, and gravlev vehicles in the Starvis database. Use for questions about ship stats, comparisons, or finding ships matching criteria.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Ship name or partial name to search (optional)' },
          manufacturer: { type: 'string', description: 'Manufacturer code or name (e.g. "ORIG", "ANVL", "RSI")' },
          category: { type: 'string', description: 'Vehicle category: "ship", "ground", or "gravlev"' },
          role: { type: 'string', description: 'Ship role (e.g. "fighter", "mining", "cargo", "exploration")' },
          env: { type: 'string', description: 'Game environment: "live" (default) or "ptu"' },
          limit: { type: 'number', description: 'Max results (default 10, max 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ship_details',
      description: 'Get full detailed stats for a specific ship by name. Use after search_ships to get complete information.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exact or partial ship name (e.g. "Constellation Andromeda", "Carrack")' },
          env: { type: 'string', description: 'Game environment: "live" (default) or "ptu"' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_components',
      description: 'Search ship components (weapons, shields, thrusters, coolers, power plants, quantum drives, etc.)',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Component name to search' },
          type: { type: 'string', description: 'Component type (e.g. "WeaponGun", "Shield", "MainThruster", "QuantumDrive")' },
          grade: { type: 'number', description: 'Component grade (1-4)' },
          size: { type: 'number', description: 'Component size (1-10)' },
          manufacturer: { type: 'string', description: 'Manufacturer code' },
          env: { type: 'string', description: '"live" (default) or "ptu"' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_items',
      description: 'Search items: armor, helmets, clothing, gadgets, FPS weapons, medical supplies, etc.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Item name to search' },
          type: { type: 'string', description: 'Item type (e.g. "Char_Armor_Torso", "Char_Helmet", "WeaponPersonal")' },
          env: { type: 'string', description: '"live" (default) or "ptu"' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_crafting',
      description: 'Search crafting recipes — what can be crafted and what ingredients are needed.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Recipe or output item name to search' },
          env: { type: 'string', description: '"live" (default) or "ptu"' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_mining',
      description: 'Search mineable elements and their properties (instability, resistance, mass, etc.)',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Element name to search (e.g. "Quantanium", "Laranite")' },
          env: { type: 'string', description: '"live" (default) or "ptu"' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_missions',
      description: 'Search available missions in the game.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Mission name or type to search' },
          env: { type: 'string', description: '"live" (default) or "ptu"' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_locations',
      description: 'Search in-game locations: planets, moons, stations, outposts, cities.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Location name to search' },
          type: { type: 'string', description: 'Location type (e.g. "Planet", "Moon", "Station", "Outpost")' },
          env: { type: 'string', description: '"live" (default) or "ptu"' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_commodities',
      description: 'Search tradeable commodities and their prices at shops.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Commodity name to search' },
          env: { type: 'string', description: '"live" (default) or "ptu"' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
    },
  },
];

export class ChatService {
  private groq: Groq;

  constructor(private gameDataService: GameDataService) {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  /** Execute a tool call and return JSON-serialisable result */
  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const env = (args.env as string | undefined) ?? 'live';
    const limit = Math.min(Number(args.limit ?? 10), 20);

    try {
      switch (name) {
        case 'search_ships': {
          const result = await this.gameDataService.ships.getAllShips({
            env,
            search: (args.query as string | undefined) ?? '',
            manufacturer: args.manufacturer as string | undefined,
            role: args.role as string | undefined,
            vehicle_category: args.category as string | undefined,
            limit,
            page: 1,
          });
          return {
            total: result.total,
            ships: result.data.map((s: Record<string, unknown>) => ({
              uuid: s['uuid'],
              name: s['name'],
              manufacturer: s['manufacturer'],
              role: s['role'],
              size: s['size'],
              career: s['career'],
              scm_speed: s['scm_speed'],
              max_speed: s['max_speed'],
              cargo_scu: s['cargo_scu'],
              crew_min: s['crew_min'],
              crew_max: s['crew_max'],
              price_uec: s['price_uec'],
              price_usd: s['price_usd'],
              vehicle_category: s['vehicle_category'],
            })),
          };
        }

        case 'get_ship_details': {
          const search = await this.gameDataService.ships.getAllShips({
            env,
            search: args.name as string,
            limit: 1,
            page: 1,
          });
          if (!search.data.length) return { error: `Ship "${args.name}" not found` };
          const ship = search.data[0] as Record<string, unknown>;
          const details = await this.gameDataService.ships.getShipByUuid(ship['uuid'] as string, env);
          return details ?? { error: 'Details not available' };
        }

        case 'search_components': {
          const result = await this.gameDataService.components.getAllComponents({
            env,
            search: (args.query as string | undefined) ?? '',
            type: args.type as string | undefined,
            grade: args.grade != null ? String(args.grade) : undefined,
            size: args.size != null ? String(args.size) : undefined,
            manufacturer: args.manufacturer as string | undefined,
            limit,
            page: 1,
          });
          return { total: result.total, components: result.data };
        }

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

        case 'search_crafting': {
          const result = await this.gameDataService.crafting.getRecipes({
            env,
            search: (args.query as string | undefined) ?? '',
            limit,
            page: 1,
          });
          return { total: result.total, recipes: result.data };
        }

        case 'search_mining': {
          const elements = await this.gameDataService.mining.getAllElements(env);
          const query = ((args.query as string | undefined) ?? '').toLowerCase();
          const filtered = query
            ? elements.filter((e: Record<string, unknown>) => String(e['name'] ?? '').toLowerCase().includes(query))
            : elements;
          return { elements: filtered.slice(0, 20) };
        }

        case 'search_missions': {
          const result = await this.gameDataService.missions.getMissions({
            env,
            search: (args.query as string | undefined) ?? '',
            limit,
            page: 1,
          });
          return { total: result.total, missions: result.data };
        }

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

        case 'search_commodities': {
          const result = await this.gameDataService.commodities.getAllCommodities({
            env,
            search: (args.query as string | undefined) ?? '',
            limit,
            page: 1,
          });
          return { total: result.total, commodities: result.data };
        }

        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (e) {
      return { error: String(e) };
    }
  }

  /**
   * Stream a chat response with tool use to a writable stream.
   * Calls `onChunk` for each text delta and `onDone` when finished.
   */
  async streamChat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      // Phase 1 — agentic loop: resolve all tool calls (non-streaming)
      let toolIterations = 0;
      while (toolIterations < 5) {
        const response = await this.groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: groqMessages,
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 1024,
          temperature: 0.3,
          stream: false,
        });

        const choice = response.choices[0];
        if (!choice) break;

        const msg = choice.message;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          toolIterations++;
          groqMessages.push(msg);

          for (const tc of msg.tool_calls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              /* ignore */
            }
            const result = await this.executeTool(tc.function.name, args);
            groqMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            });
          }
          continue;
        }
        // No more tool calls — exit loop
        break;
      }

      // Phase 2 — stream the final answer
      const stream = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        max_tokens: 1024,
        temperature: 0.3,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) onChunk(delta);
      }

      onDone();
    } catch (e) {
      onError(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
