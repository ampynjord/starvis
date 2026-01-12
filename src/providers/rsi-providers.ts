// =====================================================
// RSI DATA PROVIDERS - Sources de données RSI
// =====================================================

export interface RSIShipData {
  id: number;
  chassis_id: number;
  name: string;
  slug: string;
  url: string;
  description: string;
  time_modified: string;
  "time_modified.unfiltered": string;
  type: string;
  focus: string;
  size: string;
  production_status: string;
  manufacturer: {
    id: number;
    name: string;
    code: string;
  };
  // Dimensions & specs
  length: number;
  beam: number;
  height: number;
  mass: number;
  cargocapacity: number;
  min_crew: number;
  max_crew: number;
  scm_speed: number;
  afterburner_speed: number;
  // Components
  compiled: {
    RSIWeapon?: {
      weapons?: any[];
      missiles?: any[];
      turrets?: any[];
      utility_items?: any[];
    };
    RSIModular?: {
      power_plants?: any[];
      coolers?: any[];
      shield_generators?: any[];
    };
    RSIPropulsion?: {
      fuel_intakes?: any[];
      fuel_tanks?: any[];
      quantum_drives?: any[];
      jump_modules?: any[];
      quantum_fuel_tanks?: any[];
    };
    RSIThruster?: {
      main_thrusters?: any[];
      maneuvering_thrusters?: any[];
    };
    RSIAvionic?: {
      radar?: any[];
      computers?: any[];
    };
  };
  // Media
  media: Array<{
    source_url: string;
    images: Record<string, string>;
  }>;
}

export interface RSIGraphQLShipData {
  id: string;
  name: string;
  slug: string;
  url: string;
  type: string;
  focus: string;
  size: string;
  msrp: number; // Prix en cents
  productionStatus: string;
  manufacturer: { name: string; code: string };
  media?: { ctm?: string };
  ctm?: { url?: string; angularUrl?: string };
  price?: { amount?: number; currency?: string };
}

// =====================================================
// SHIP-MATRIX API - Source principale (sans auth)
// =====================================================

export class ShipMatrixProvider {
  private baseUrl = "https://robertsspaceindustries.com";

  /**
   * Récupère TOUS les vaisseaux via l'API ship-matrix
   * Avantages: Pas d'auth, rapide, données complètes
   */
  async getAllShips(): Promise<RSIShipData[]> {
    console.log("📦 Fetching all ships from ship-matrix API...");

    const response = await fetch(`${this.baseUrl}/ship-matrix/index`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Ship-matrix API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      success: number;
      data: RSIShipData[];
    };

    if (data.success !== 1 || !data.data) {
      throw new Error("Invalid ship-matrix response");
    }

    console.log(`✅ Retrieved ${data.data.length} ships from ship-matrix`);
    return data.data;
  }

  /**
   * Transforme les données ship-matrix vers notre format interne
   */
  transformShipData(ship: RSIShipData): TransformedShip {
    const baseUrl = "https://robertsspaceindustries.com";

    // Extraire les images
    const images: ShipImage[] = [];
    if (ship.media && ship.media.length > 0) {
      ship.media.forEach((m) => {
        // Image source haute résolution
        if (m.source_url) {
          const url = m.source_url.startsWith("http")
            ? m.source_url
            : `${baseUrl}${m.source_url}`;
          images.push({ url, type: "gallery", alt: ship.name });
        }
        // Images en différentes tailles
        if (m.images) {
          // Priorité aux grandes images
          const sizes = [
            "store_hub_large",
            "store_large",
            "slideshow_wide",
            "hub_large",
          ];
          for (const size of sizes) {
            if (m.images[size]) {
              const url = m.images[size].startsWith("http")
                ? m.images[size]
                : `${baseUrl}${m.images[size]}`;
              images.push({
                url,
                type: "gallery",
                alt: `${ship.name} - ${size}`,
              });
            }
          }
        }
      });
    }

    // Extraire les composants comme spécifications
    const specifications: ShipSpecification[] = [];

    // Specs de base
    if (ship.length)
      specifications.push({ name: "Length", value: `${ship.length} m` });
    if (ship.beam)
      specifications.push({ name: "Beam", value: `${ship.beam} m` });
    if (ship.height)
      specifications.push({ name: "Height", value: `${ship.height} m` });
    if (ship.mass)
      specifications.push({ name: "Mass", value: `${ship.mass} kg` });
    if (ship.cargocapacity)
      specifications.push({
        name: "Cargo Capacity",
        value: `${ship.cargocapacity} SCU`,
      });
    if (ship.scm_speed)
      specifications.push({
        name: "SCM Speed",
        value: `${ship.scm_speed} m/s`,
      });
    if (ship.afterburner_speed)
      specifications.push({
        name: "Afterburner Speed",
        value: `${ship.afterburner_speed} m/s`,
      });
    if (ship.min_crew)
      specifications.push({ name: "Min Crew", value: String(ship.min_crew) });
    if (ship.max_crew)
      specifications.push({ name: "Max Crew", value: String(ship.max_crew) });
    if (ship.focus) specifications.push({ name: "Focus", value: ship.focus });
    if (ship.size) specifications.push({ name: "Size", value: ship.size });
    if (ship.type) specifications.push({ name: "Type", value: ship.type });
    if (ship.production_status)
      specifications.push({
        name: "Production Status",
        value: ship.production_status,
      });
    specifications.push({
      name: "Manufacturer",
      value: ship.manufacturer?.name || "Unknown",
    });

    // Composants
    const compiled = ship.compiled || {};

    // Armes
    if (compiled.RSIWeapon?.weapons) {
      compiled.RSIWeapon.weapons.forEach((w: any) => {
        specifications.push({
          name: `Weapon (S${w.size || w.component_size})`,
          value: `${w.name} x${w.mounts || w.quantity || 1}`,
        });
      });
    }

    // Missiles
    if (compiled.RSIWeapon?.missiles) {
      compiled.RSIWeapon.missiles.forEach((m: any) => {
        specifications.push({
          name: `Missiles (S${m.size || m.component_size})`,
          value: `${m.name} x${m.quantity || 1}`,
        });
      });
    }

    // Shields
    if (compiled.RSIModular?.shield_generators) {
      compiled.RSIModular.shield_generators.forEach((s: any) => {
        specifications.push({
          name: `Shield Generator (S${s.size || s.component_size})`,
          value: `${s.name} x${s.mounts || 1}`,
        });
      });
    }

    // Power plants
    if (compiled.RSIModular?.power_plants) {
      compiled.RSIModular.power_plants.forEach((p: any) => {
        specifications.push({
          name: `Power Plant (S${p.size || p.component_size})`,
          value: `${p.name} x${p.mounts || 1}`,
        });
      });
    }

    // Coolers
    if (compiled.RSIModular?.coolers) {
      compiled.RSIModular.coolers.forEach((c: any) => {
        specifications.push({
          name: `Cooler (S${c.size || c.component_size})`,
          value: `${c.name} x${c.mounts || 1}`,
        });
      });
    }

    // Quantum drives
    if (compiled.RSIPropulsion?.quantum_drives) {
      compiled.RSIPropulsion.quantum_drives.forEach((q: any) => {
        specifications.push({
          name: `Quantum Drive (S${q.size || q.component_size})`,
          value: `${q.name} x${q.mounts || 1}`,
        });
      });
    }

    // Thrusters
    if (compiled.RSIThruster?.main_thrusters) {
      compiled.RSIThruster.main_thrusters.forEach((t: any) => {
        specifications.push({
          name: "Main Thruster",
          value: `${t.name} x${t.mounts || 1}`,
        });
      });
    }

    return {
      id: String(ship.id),
      chassisId: ship.chassis_id,
      name: ship.name,
      manufacturer: ship.manufacturer?.name || "Unknown",
      lastModified: ship["time_modified.unfiltered"],
      slug:
        ship.url?.split("/").pop() ||
        ship.name.toLowerCase().replace(/\s+/g, "-"),
      url: `${baseUrl}${ship.url}`,
      description: ship.description || "",
      focus: ship.focus,
      productionStatus: ship.production_status,
      size: ship.size,
      type: ship.type,
      crew: {
        min: ship.min_crew,
        max: ship.max_crew,
      },
      mass: ship.mass,
      cargocapacity: ship.cargocapacity,
      length: ship.length,
      beam: ship.beam,
      height: ship.height,
      scmSpeed: ship.scm_speed,
      afterburnerSpeed: ship.afterburner_speed,
      pitchMax: (ship as any).pitch_max,
      yawMax: (ship as any).yaw_max,
      rollMax: (ship as any).roll_max,
      xAxisAcceleration: (ship as any).xaxis_acceleration,
      yAxisAcceleration: (ship as any).yaxis_acceleration,
      zAxisAcceleration: (ship as any).zaxis_acceleration,
      pledgeUrl: ship.url ? `${baseUrl}${ship.url}` : undefined,
      media: {
        storeThumb: ship.media?.[0]?.images?.store_small
          ? ship.media[0].images.store_small.startsWith("http")
            ? ship.media[0].images.store_small
            : `${baseUrl}${ship.media[0].images.store_small}`
          : undefined,
        storeBanner: ship.media?.[0]?.images?.store_hub_large
          ? ship.media[0].images.store_hub_large.startsWith("http")
            ? ship.media[0].images.store_hub_large
            : `${baseUrl}${ship.media[0].images.store_hub_large}`
          : undefined,
      },
      specifications,
      mediaGallery: images,
      syncedAt: new Date(),
      dataSource: "ship-matrix",
    };
  }
}

// =====================================================
// GRAPHQL API - Source secondaire (pour CTM et prix)
// =====================================================

import puppeteer, { Browser } from "puppeteer";

export class GraphQLProvider {
  private browser: Browser | null = null;
  private tokens: { csrf: string; rsi: string } | null = null;

  async init() {
    this.browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  /**
   * Récupère les tokens d'authentification via une page RSI
   */
  async getTokens(): Promise<{ csrf: string; rsi: string }> {
    if (this.tokens) return this.tokens;

    if (!this.browser) await this.init();
    const page = await this.browser!.newPage();

    let csrf = "",
      rsi = "";

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.url().includes("graphql") && req.method() === "POST") {
        const headers = req.headers();
        if (headers["x-csrf-token"]) csrf = headers["x-csrf-token"];
        const cookie = headers["cookie"] || "";
        const match = cookie.match(/Rsi-Token=([^;]+)/);
        if (match) rsi = match[1];
      }
      req.continue();
    });

    await page.goto("https://robertsspaceindustries.com/pledge/ships", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await page.close();

    this.tokens = { csrf, rsi };
    console.log("🔐 GraphQL tokens acquired");
    return this.tokens;
  }

  /**
   * Récupère les données d'un vaisseau via GraphQL (inclut CTM et prix)
   */
  async getShipBySlug(graphqlSlug: string): Promise<RSIGraphQLShipData | null> {
    const tokens = await this.getTokens();

    const query = `query GetShip($query: SearchQuery!) {
      store(name: "pledge", browse: true) {
        search(query: $query) {
          resources {
            id name slug url type focus size msrp productionStatus
            manufacturer { name code }
            media { ctm }
          }
        }
      }
    }`;

    const response = await fetch("https://robertsspaceindustries.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": tokens.csrf,
        Cookie: `Rsi-Token=${tokens.rsi}`,
        Origin: "https://robertsspaceindustries.com",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify([
        {
          operationName: "GetShip",
          query,
          variables: {
            query: {
              ships: {
                slugs: [graphqlSlug],
                unslottedMedia: true,
              },
            },
          },
        },
      ]),
    });

    const data = (await response.json()) as any[];
    return data[0]?.data?.store?.search?.resources?.[0] || null;
  }

  /**
   * Récupère la liste des vaisseaux en vente avec filtres
   */
  async getShipsWithFilters(
    filters: GraphQLFilters
  ): Promise<RSIGraphQLShipData[]> {
    const tokens = await this.getTokens();

    // Capturer la query exacte du navigateur
    if (!this.browser) await this.init();
    const page = await this.browser!.newPage();

    let shipListQuery = "";
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.url().includes("graphql") && req.method() === "POST") {
        const postData = req.postData();
        if (postData) {
          try {
            const parsed = JSON.parse(postData);
            if (Array.isArray(parsed)) {
              const op = parsed.find(
                (o: any) => o.operationName === "GetShipList"
              );
              if (op) shipListQuery = op.query;
            }
          } catch {}
        }
      }
      req.continue();
    });

    await page.goto("https://robertsspaceindustries.com/pledge/ships", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await page.close();

    if (!shipListQuery) {
      throw new Error("Could not capture GetShipList query");
    }

    const response = await fetch("https://robertsspaceindustries.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": tokens.csrf,
        Cookie: `Rsi-Token=${tokens.rsi}`,
        Origin: "https://robertsspaceindustries.com",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify([
        {
          operationName: "GetShipList",
          query: shipListQuery,
          variables: {
            query: {
              page: filters.page || 1,
              limit: filters.limit || 20,
              sort: filters.sort || { field: "name", direction: "asc" },
              ships: {
                filters: {
                  sale: filters.sale,
                  classification: filters.classification,
                  status: filters.status,
                  size: filters.size,
                },
                imageComposer: [
                  {
                    name: "thumbnail",
                    size: "SIZE_400",
                    ratio: "RATIO_16_9",
                    extension: "WEBP",
                  },
                ],
                all: false,
              },
            },
          },
        },
      ]),
    });

    const data = (await response.json()) as any[];
    return data[0]?.data?.store?.search?.resources || [];
  }
}

// =====================================================
// Types partagés
// =====================================================

export interface ShipSpecification {
  name: string;
  value: string;
}

export interface ShipImage {
  url: string;
  type: "thumbnail" | "gallery" | "blueprint" | "other";
  alt?: string;
}

export interface ShipComponent {
  category: string;
  type: string;
  name?: string;
  mounts?: number;
  size?: string;
  details?: string;
  quantity?: number;
  manufacturer?: string;
}

export interface TransformedShip {
  lastModified: string | null;
  chassisId: number | null;
  id: string;
  name: string;
  manufacturer: string;
  slug: string;
  url: string;
  description: string;
  focus?: string;
  productionStatus?: string;
  size?: string;
  type?: string;
  crew?: { min?: number; max?: number };
  // Dimensions & Performance
  mass?: number;
  cargocapacity?: number;
  length?: number;
  beam?: number;
  height?: number;
  scmSpeed?: number;
  afterburnerSpeed?: number;
  pitchMax?: number;
  yawMax?: number;
  rollMax?: number;
  xAxisAcceleration?: number;
  yAxisAcceleration?: number;
  zAxisAcceleration?: number;
  // GraphQL data (CTM, price)
  model3d?: { ctmUrl?: string; angularUrl?: string };
  priceUSD?: number;
  pledgeUrl?: string;
  // Media
  media?: {
    storeThumb?: string;
    storeBanner?: string;
  };
  specifications?: ShipSpecification[];
  images?: ShipImage[];
  components?: ShipComponent[];
  mediaGallery?: any[];
  syncedAt?: Date;
  dataSource?: "ship-matrix" | "graphql" | "scraping";
}

export interface GraphQLFilters {
  page?: number;
  limit?: number;
  sort?: { field: string; direction: "asc" | "desc" };
  sale?: boolean[];
  classification?: string[]; // combat, transport, exploration, industrial, support, competition, ground, multi
  status?: string[]; // in-concept, flight-ready
  size?: string[]; // small, medium, large, capital, snub, vehicle
  msrp?: { from?: number; to?: number };
  minCrew?: { from?: number; to?: number };
  maxCrew?: { from?: number; to?: number };
}

// Filtres GraphQL disponibles
export const GRAPHQL_FILTER_OPTIONS = {
  classification: [
    { value: "combat", label: "Combat" },
    { value: "transport", label: "Transport" },
    { value: "exploration", label: "Exploration" },
    { value: "industrial", label: "Industrial" },
    { value: "support", label: "Support" },
    { value: "competition", label: "Competition" },
    { value: "ground", label: "Ground" },
    { value: "multi", label: "Multi" },
  ],
  status: [
    { value: "in-concept", label: "In Concept" },
    { value: "flight-ready", label: "Flight Ready" },
  ],
  size: ["small", "medium", "large", "capital", "snub", "vehicle"],
  sale: [
    { value: true, label: "Available for purchase" },
    { value: false, label: "Not for sale" },
  ],
};
