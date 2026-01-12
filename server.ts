import cors from "cors";
import express from "express";
import type { Pool } from "mysql2/promise";
import * as mysql from "mysql2/promise";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import {
  GRAPHQL_FILTER_OPTIONS,
  GraphQLProvider,
  ShipMatrixProvider,
  TransformedShip,
} from "./src/providers/rsi-providers.js";

// ===== CONFIGURATION =====
const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "starapi",
  password: process.env.DB_PASSWORD || "starapi",
  database: process.env.DB_NAME || "starapi",
  waitForConnections: true,
  connectionLimit: 10,
};

// ===== DATABASE =====
let dbPool: Pool | null = null;

async function initDatabase(): Promise<void> {
  try {
    dbPool = mysql.createPool(DB_CONFIG);
    const conn = await dbPool.getConnection();

    // Créer les tables si elles n'existent pas
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ships (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        manufacturer VARCHAR(255),
        slug VARCHAR(255),
        url VARCHAR(512),
        description TEXT,
        focus VARCHAR(255),
        production_status VARCHAR(100),
        size VARCHAR(50),
        type VARCHAR(100),
        crew_min INT,
        crew_max INT,
        mass_kg BIGINT,
        cargo_capacity INT,
        length_m DECIMAL(10,2),
        beam_m DECIMAL(10,2),
        height_m DECIMAL(10,2),
        scm_speed INT,
        afterburner_speed INT,
        pitch_max DECIMAL(10,2),
        yaw_max DECIMAL(10,2),
        roll_max DECIMAL(10,2),
        x_axis_acceleration DECIMAL(10,2),
        y_axis_acceleration DECIMAL(10,2),
        z_axis_acceleration DECIMAL(10,2),
        model3d_ctm_url TEXT,
        model3d_angular_url TEXT,
        price_usd DECIMAL(10,2),
        pledge_url VARCHAR(512),
        media_store_thumb VARCHAR(512),
        media_store_banner VARCHAR(512),
        data_source VARCHAR(50) DEFAULT 'ship-matrix',
        synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_manufacturer (manufacturer),
        INDEX idx_size (size),
        INDEX idx_type (type),
        INDEX idx_production_status (production_status)
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ship_components (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ship_id VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        type VARCHAR(100),
        name VARCHAR(255),
        mounts INT,
        component_size VARCHAR(50),
        details TEXT,
        quantity INT DEFAULT 1,
        manufacturer VARCHAR(255),
        FOREIGN KEY (ship_id) REFERENCES ships(id) ON DELETE CASCADE,
        INDEX idx_ship_id (ship_id),
        INDEX idx_category (category)
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ship_media (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ship_id VARCHAR(255) NOT NULL,
        source_name VARCHAR(255),
        source_url TEXT,
        derived_data JSON,
        FOREIGN KEY (ship_id) REFERENCES ships(id) ON DELETE CASCADE,
        INDEX idx_ship_id (ship_id)
      )
    `);

    conn.release();
    console.log("✅ Database connected and tables ready");
  } catch (error) {
    console.error(
      "❌ Database connection failed:",
      error instanceof Error ? error.message : error
    );
    console.log("⚠️  Running without database - data won't be persisted");
  }
}

async function closeDatabase(): Promise<void> {
  if (dbPool) {
    await dbPool.end();
    dbPool = null;
  }
}

// ===== SERVICE =====
class ShipService {
  private shipMatrixProvider = new ShipMatrixProvider();
  private graphqlProvider = new GraphQLProvider();
  private memoryCache: Map<string, TransformedShip> = new Map();
  private lastSync: Date | null = null;

  async syncFromShipMatrix(): Promise<{
    total: number;
    synced: number;
    errors: number;
  }> {
    console.log("🔄 Syncing ships from Ship-Matrix API...");

    const stats = { total: 0, synced: 0, errors: 0 };

    try {
      const ships = await this.shipMatrixProvider.getAllShips();
      stats.total = ships.length;

      for (const ship of ships) {
        try {
          const transformed = this.shipMatrixProvider.transformShipData(ship);

          // Save to memory cache
          this.memoryCache.set(transformed.id, transformed);

          // Save to database if available
          if (dbPool) {
            await this.saveToDatabase(transformed, ship);
          }

          stats.synced++;
        } catch (error) {
          console.error(
            `❌ Error processing ${ship.name}:`,
            error instanceof Error ? error.message : error
          );
          stats.errors++;
        }
      }

      this.lastSync = new Date();
      console.log(
        `✅ Sync complete: ${stats.synced}/${stats.total} ships (${stats.errors} errors)`
      );
    } catch (error) {
      console.error(
        "❌ Sync failed:",
        error instanceof Error ? error.message : error
      );
      throw error;
    }

    return stats;
  }

  private async saveToDatabase(
    ship: TransformedShip,
    rawData: any
  ): Promise<void> {
    if (!dbPool) return;

    const conn = await dbPool.getConnection();
    try {
      await conn.beginTransaction();

      // Insert/Update ship
      await conn.execute(
        `
        INSERT INTO ships (
          id, name, manufacturer, slug, url, description, focus,
          production_status, size, type, crew_min, crew_max,
          mass_kg, cargo_capacity, length_m, beam_m, height_m,
          scm_speed, afterburner_speed, pitch_max, yaw_max, roll_max,
          x_axis_acceleration, y_axis_acceleration, z_axis_acceleration,
          pledge_url, media_store_thumb, media_store_banner, data_source, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ship-matrix', NOW())
        ON DUPLICATE KEY UPDATE
          name=VALUES(name), manufacturer=VALUES(manufacturer), slug=VALUES(slug),
          url=VALUES(url), description=VALUES(description), focus=VALUES(focus),
          production_status=VALUES(production_status), size=VALUES(size), type=VALUES(type),
          crew_min=VALUES(crew_min), crew_max=VALUES(crew_max), mass_kg=VALUES(mass_kg),
          cargo_capacity=VALUES(cargo_capacity), length_m=VALUES(length_m),
          beam_m=VALUES(beam_m), height_m=VALUES(height_m), scm_speed=VALUES(scm_speed),
          afterburner_speed=VALUES(afterburner_speed), pitch_max=VALUES(pitch_max),
          yaw_max=VALUES(yaw_max), roll_max=VALUES(roll_max),
          x_axis_acceleration=VALUES(x_axis_acceleration),
          y_axis_acceleration=VALUES(y_axis_acceleration),
          z_axis_acceleration=VALUES(z_axis_acceleration),
          pledge_url=VALUES(pledge_url), media_store_thumb=VALUES(media_store_thumb),
          media_store_banner=VALUES(media_store_banner), synced_at=NOW()
      `,
        [
          ship.id,
          ship.name,
          ship.manufacturer,
          ship.slug,
          ship.url,
          ship.description,
          ship.focus,
          ship.productionStatus,
          ship.size,
          ship.type,
          ship.crew?.min,
          ship.crew?.max,
          ship.mass,
          ship.cargocapacity,
          ship.length,
          ship.beam,
          ship.height,
          ship.scmSpeed,
          ship.afterburnerSpeed,
          ship.pitchMax,
          ship.yawMax,
          ship.rollMax,
          ship.xAxisAcceleration,
          ship.yAxisAcceleration,
          ship.zAxisAcceleration,
          ship.pledgeUrl,
          ship.media?.storeThumb,
          ship.media?.storeBanner,
        ]
      );

      // Delete old components
      await conn.execute("DELETE FROM ship_components WHERE ship_id = ?", [
        ship.id,
      ]);

      // Insert components from raw data
      if (rawData.compiled) {
        for (const [category, types] of Object.entries(rawData.compiled)) {
          if (typeof types === "object" && types !== null) {
            for (const [type, components] of Object.entries(types as object)) {
              if (Array.isArray(components)) {
                for (const comp of components) {
                  await conn.execute(
                    `
                    INSERT INTO ship_components (ship_id, category, type, name, mounts, component_size, details, quantity, manufacturer)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `,
                    [
                      ship.id,
                      category,
                      type,
                      comp.name || null,
                      comp.mounts || null,
                      comp.component_size || comp.size || null,
                      comp.details || null,
                      comp.quantity || 1,
                      comp.manufacturer || null,
                    ]
                  );
                }
              }
            }
          }
        }
      }

      // Delete old media
      await conn.execute("DELETE FROM ship_media WHERE ship_id = ?", [ship.id]);

      // Insert media
      if (rawData.media && Array.isArray(rawData.media)) {
        for (const media of rawData.media) {
          await conn.execute(
            `
            INSERT INTO ship_media (ship_id, source_name, source_url, derived_data)
            VALUES (?, ?, ?, ?)
          `,
            [
              ship.id,
              media.source_name || null,
              media.source_url || null,
              media.derived_data ? JSON.stringify(media.derived_data) : null,
            ]
          );
        }
      }

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async getAllShips(): Promise<TransformedShip[]> {
    // Try database first
    if (dbPool) {
      try {
        const [rows] = (await dbPool.execute(`
          SELECT * FROM ships ORDER BY manufacturer, name
        `)) as any;

        return rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          manufacturer: row.manufacturer,
          slug: row.slug,
          url: row.url,
          description: row.description,
          focus: row.focus,
          productionStatus: row.production_status,
          size: row.size,
          type: row.type,
          crew: { min: row.crew_min, max: row.crew_max },
          mass: row.mass_kg,
          cargocapacity: row.cargo_capacity,
          length: parseFloat(row.length_m),
          beam: parseFloat(row.beam_m),
          height: parseFloat(row.height_m),
          scmSpeed: row.scm_speed,
          afterburnerSpeed: row.afterburner_speed,
          pitchMax: parseFloat(row.pitch_max),
          yawMax: parseFloat(row.yaw_max),
          rollMax: parseFloat(row.roll_max),
          xAxisAcceleration: parseFloat(row.x_axis_acceleration),
          yAxisAcceleration: parseFloat(row.y_axis_acceleration),
          zAxisAcceleration: parseFloat(row.z_axis_acceleration),
          pledgeUrl: row.pledge_url,
          media: {
            storeThumb: row.media_store_thumb,
            storeBanner: row.media_store_banner,
          },
          syncedAt: row.synced_at,
        }));
      } catch (error) {
        console.error("Database read error:", error);
      }
    }

    // Fallback to memory cache
    return Array.from(this.memoryCache.values());
  }

  async getShipById(id: string): Promise<TransformedShip | null> {
    if (dbPool) {
      try {
        const [rows] = (await dbPool.execute(
          "SELECT * FROM ships WHERE id = ?",
          [id]
        )) as any;

        if (rows.length > 0) {
          const row = rows[0];

          // Get components
          const [components] = (await dbPool.execute(
            "SELECT * FROM ship_components WHERE ship_id = ?",
            [id]
          )) as any;

          // Get media
          const [media] = (await dbPool.execute(
            "SELECT * FROM ship_media WHERE ship_id = ?",
            [id]
          )) as any;

          return {
            id: row.id,
            name: row.name,
            manufacturer: row.manufacturer,
            slug: row.slug,
            url: row.url,
            description: row.description,
            focus: row.focus,
            productionStatus: row.production_status,
            size: row.size,
            type: row.type,
            crew: { min: row.crew_min, max: row.crew_max },
            mass: row.mass_kg,
            cargocapacity: row.cargo_capacity,
            length: parseFloat(row.length_m),
            beam: parseFloat(row.beam_m),
            height: parseFloat(row.height_m),
            scmSpeed: row.scm_speed,
            afterburnerSpeed: row.afterburner_speed,
            pitchMax: parseFloat(row.pitch_max),
            yawMax: parseFloat(row.yaw_max),
            rollMax: parseFloat(row.roll_max),
            xAxisAcceleration: parseFloat(row.x_axis_acceleration),
            yAxisAcceleration: parseFloat(row.y_axis_acceleration),
            zAxisAcceleration: parseFloat(row.z_axis_acceleration),
            model3d: {
              ctmUrl: row.model3d_ctm_url,
              angularUrl: row.model3d_angular_url,
            },
            priceUSD: parseFloat(row.price_usd),
            pledgeUrl: row.pledge_url,
            media: {
              storeThumb: row.media_store_thumb,
              storeBanner: row.media_store_banner,
            },
            components: components.map((c: any) => ({
              category: c.category,
              type: c.type,
              name: c.name,
              mounts: c.mounts,
              size: c.component_size,
              details: c.details,
              quantity: c.quantity,
              manufacturer: c.manufacturer,
            })),
            mediaGallery: media.map((m: any) => {
              const derivedData =
                typeof m.derived_data === "string"
                  ? JSON.parse(m.derived_data)
                  : m.derived_data;

              // Générer toutes les URLs d'images à partir du source_url
              const baseUrl = m.source_url?.replace(/\/[^/]+$/, "") || "";
              const extension = m.source_url?.split(".").pop() || "jpg";
              const allImages: Record<string, string> = {
                source: m.source_url,
              };

              if (derivedData?.sizes) {
                Object.keys(derivedData.sizes).forEach((size) => {
                  allImages[size] = `${baseUrl}/${size}.${extension}`;
                });
              }

              return {
                sourceName: m.source_name,
                sourceUrl: m.source_url,
                images: allImages,
              };
            }),
            syncedAt: row.synced_at,
            lastModified: row.synced_at,
            chassisId: row.id,
          };
        }
      } catch (error) {
        console.error("Database read error:", error);
      }
    }

    return this.memoryCache.get(id) || null;
  }

  async getShipBySlug(
    manufacturerSlug: string,
    shipSlug: string
  ): Promise<TransformedShip | null> {
    if (dbPool) {
      try {
        const [rows] = (await dbPool.execute(
          "SELECT * FROM ships WHERE slug = ?",
          [shipSlug]
        )) as any;

        if (rows.length > 0) {
          return this.getShipById(rows[0].id);
        }
      } catch (error) {
        console.error("Database read error:", error);
      }
    }

    // Search in memory cache
    for (const ship of this.memoryCache.values()) {
      if (ship.slug === shipSlug) {
        return ship;
      }
    }

    return null;
  }

  async enrichWithGraphQL(shipId: string): Promise<TransformedShip | null> {
    const ship = await this.getShipById(shipId);
    if (!ship) return null;

    try {
      // Get GraphQL data for CTM and price
      const graphqlData = await this.graphqlProvider.getShipBySlug(ship.slug);

      if (graphqlData && dbPool) {
        // Update with CTM and price
        await dbPool.execute(
          `
          UPDATE ships SET
            model3d_ctm_url = ?,
            model3d_angular_url = ?,
            price_usd = ?
          WHERE id = ?
        `,
          [
            graphqlData.ctm?.url || null,
            graphqlData.ctm?.angularUrl || null,
            graphqlData.price?.amount || null,
            shipId,
          ]
        );

        // Update memory cache
        if (this.memoryCache.has(shipId)) {
          const cached = this.memoryCache.get(shipId)!;
          cached.model3d = {
            ctmUrl: graphqlData.ctm?.url,
            angularUrl: graphqlData.ctm?.angularUrl,
          };
          cached.priceUSD = graphqlData.price?.amount;
        }

        return this.getShipById(shipId);
      }
    } catch (error) {
      console.error(`Failed to enrich ship ${shipId} with GraphQL:`, error);
    }

    return ship;
  }

  async searchShips(query: string): Promise<TransformedShip[]> {
    if (dbPool) {
      try {
        const searchTerm = `%${query}%`;
        const [rows] = (await dbPool.execute(
          `
          SELECT * FROM ships 
          WHERE name LIKE ? OR manufacturer LIKE ? OR description LIKE ?
          ORDER BY manufacturer, name
        `,
          [searchTerm, searchTerm, searchTerm]
        )) as any;

        return rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          manufacturer: row.manufacturer,
          slug: row.slug,
          size: row.size,
          type: row.type,
          productionStatus: row.production_status,
          media: {
            storeThumb: row.media_store_thumb,
          },
        }));
      } catch (error) {
        console.error("Search error:", error);
      }
    }

    // Fallback to memory search
    const lowerQuery = query.toLowerCase();
    return Array.from(this.memoryCache.values()).filter(
      (ship) =>
        ship.name.toLowerCase().includes(lowerQuery) ||
        ship.manufacturer?.toLowerCase().includes(lowerQuery)
    );
  }

  async getStats(): Promise<{
    totalShips: number;
    byManufacturer: Record<string, number>;
    bySize: Record<string, number>;
    byStatus: Record<string, number>;
    lastSync: Date | null;
  }> {
    const stats = {
      totalShips: 0,
      byManufacturer: {} as Record<string, number>,
      bySize: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      lastSync: this.lastSync,
    };

    if (dbPool) {
      try {
        const [total] = (await dbPool.execute(
          "SELECT COUNT(*) as count FROM ships"
        )) as any;
        stats.totalShips = total[0].count;

        const [byManu] = (await dbPool.execute(
          "SELECT manufacturer, COUNT(*) as count FROM ships GROUP BY manufacturer"
        )) as any;
        for (const row of byManu) {
          stats.byManufacturer[row.manufacturer || "Unknown"] = row.count;
        }

        const [bySize] = (await dbPool.execute(
          "SELECT size, COUNT(*) as count FROM ships GROUP BY size"
        )) as any;
        for (const row of bySize) {
          stats.bySize[row.size || "Unknown"] = row.count;
        }

        const [byStatus] = (await dbPool.execute(
          "SELECT production_status, COUNT(*) as count FROM ships GROUP BY production_status"
        )) as any;
        for (const row of byStatus) {
          stats.byStatus[row.production_status || "Unknown"] = row.count;
        }
      } catch (error) {
        console.error("Stats error:", error);
      }
    }

    return stats;
  }

  getGraphQLFilters() {
    return GRAPHQL_FILTER_OPTIONS;
  }
}

// ===== API SERVER =====
const app = express();
const port = process.env.PORT || 3000;
const service = new ShipService();

// ===== SWAGGER =====
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Star Citizen Ships API",
      version: "2.0.0",
      description:
        "API REST pour les données des vaisseaux Star Citizen (via Ship-Matrix API)",
      contact: { name: "API Support" },
    },
    servers: [
      { url: `http://localhost:${port}`, description: "Development server" },
    ],
    tags: [
      { name: "Ships", description: "Opérations sur les vaisseaux" },
      { name: "System", description: "Opérations système" },
      { name: "Admin", description: "Administration" },
    ],
  },
  apis: ["./server-new.ts"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: Page d'accueil de l'API
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Informations générales sur l'API
 */
app.get("/", (req, res) =>
  res.json({
    name: "Starapi",
    version: "2.0.0",
    description: "Star Citizen Ships API - Powered by Ship-Matrix",
    documentation: "/api-docs",
    endpoints: {
      "GET /api/ships": "Liste tous les vaisseaux",
      "GET /api/ships/:id": "Récupère un vaisseau par ID",
      "GET /api/ships/search?q=": "Recherche de vaisseaux",
      "GET /api/ships/stats": "Statistiques des vaisseaux",
      "GET /api/ships/filters": "Options de filtrage GraphQL",
      "POST /api/ships/:id/enrich": "Enrichit avec données GraphQL (CTM, prix)",
      "POST /admin/sync": "Synchronise depuis Ship-Matrix",
    },
  })
);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Status de l'API
 */
app.get("/health", (req, res) =>
  res.json({
    status: "ok",
    uptime: process.uptime(),
    database: dbPool ? "connected" : "disconnected",
  })
);

/**
 * @swagger
 * /api/ships:
 *   get:
 *     summary: Liste tous les vaisseaux
 *     tags: [Ships]
 *     parameters:
 *       - in: query
 *         name: manufacturer
 *         schema:
 *           type: string
 *         description: Filtrer par fabricant
 *       - in: query
 *         name: size
 *         schema:
 *           type: string
 *         description: Filtrer par taille
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filtrer par statut de production
 *     responses:
 *       200:
 *         description: Liste des vaisseaux
 */
app.get("/api/ships", async (req, res) => {
  try {
    let ships = await service.getAllShips();

    // Apply filters
    const { manufacturer, size, status, type } = req.query;
    if (manufacturer)
      ships = ships.filter((s) =>
        s.manufacturer
          ?.toLowerCase()
          .includes((manufacturer as string).toLowerCase())
      );
    if (size)
      ships = ships.filter(
        (s) => s.size?.toLowerCase() === (size as string).toLowerCase()
      );
    if (status)
      ships = ships.filter(
        (s) =>
          s.productionStatus?.toLowerCase() === (status as string).toLowerCase()
      );
    if (type)
      ships = ships.filter(
        (s) => s.type?.toLowerCase() === (type as string).toLowerCase()
      );

    res.json({ success: true, count: ships.length, data: ships });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error",
    });
  }
});

/**
 * @swagger
 * /api/ships/search:
 *   get:
 *     summary: Recherche de vaisseaux
 *     tags: [Ships]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Terme de recherche
 *     responses:
 *       200:
 *         description: Résultats de recherche
 */
app.get("/api/ships/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query)
      return res
        .status(400)
        .json({ success: false, error: "Query parameter 'q' required" });

    const ships = await service.searchShips(query);
    res.json({ success: true, count: ships.length, data: ships });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error",
    });
  }
});

/**
 * @swagger
 * /api/ships/stats:
 *   get:
 *     summary: Statistiques des vaisseaux
 *     tags: [Ships]
 *     responses:
 *       200:
 *         description: Statistiques
 */
app.get("/api/ships/stats", async (req, res) => {
  try {
    const stats = await service.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error",
    });
  }
});

/**
 * @swagger
 * /api/ships/filters:
 *   get:
 *     summary: Options de filtrage disponibles (GraphQL)
 *     tags: [Ships]
 *     responses:
 *       200:
 *         description: Options de filtrage
 */
app.get("/api/ships/filters", (req, res) => {
  res.json({ success: true, data: service.getGraphQLFilters() });
});

/**
 * @swagger
 * /api/ships/{id}:
 *   get:
 *     summary: Récupère un vaisseau par ID
 *     tags: [Ships]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du vaisseau
 *     responses:
 *       200:
 *         description: Détails du vaisseau
 *       404:
 *         description: Vaisseau non trouvé
 */
app.get("/api/ships/:id", async (req, res) => {
  try {
    const ship = await service.getShipById(req.params.id);
    if (ship) {
      res.json({ success: true, data: ship });
    } else {
      res.status(404).json({ success: false, error: "Ship not found" });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error",
    });
  }
});

/**
 * @swagger
 * /api/ships/{manufacturer}/{slug}:
 *   get:
 *     summary: Récupère un vaisseau par manufacturer et slug
 *     tags: [Ships]
 *     parameters:
 *       - in: path
 *         name: manufacturer
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Détails du vaisseau
 *       404:
 *         description: Vaisseau non trouvé
 */
app.get("/api/ships/:manufacturer/:slug", async (req, res) => {
  try {
    const ship = await service.getShipBySlug(
      req.params.manufacturer,
      req.params.slug
    );
    if (ship) {
      res.json({ success: true, data: ship });
    } else {
      res.status(404).json({ success: false, error: "Ship not found" });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error",
    });
  }
});

/**
 * @swagger
 * /api/ships/{id}/enrich:
 *   post:
 *     summary: Enrichit un vaisseau avec données GraphQL (CTM, prix)
 *     tags: [Ships]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vaisseau enrichi
 *       404:
 *         description: Vaisseau non trouvé
 */
app.post("/api/ships/:id/enrich", async (req, res) => {
  try {
    const ship = await service.enrichWithGraphQL(req.params.id);
    if (ship) {
      res.json({ success: true, data: ship });
    } else {
      res.status(404).json({ success: false, error: "Ship not found" });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error",
    });
  }
});

/**
 * @swagger
 * /admin/sync:
 *   post:
 *     summary: Synchronise les données depuis Ship-Matrix API
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Synchronisation terminée
 */
app.post("/admin/sync", async (req, res) => {
  try {
    const stats = await service.syncFromShipMatrix();
    res.json({
      success: true,
      message: `Synchronized ${stats.synced} ships`,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error",
    });
  }
});

// ===== STARTUP =====
async function start() {
  await initDatabase();

  // Initial sync if database is empty
  if (dbPool) {
    try {
      const [rows] = (await dbPool.execute(
        "SELECT COUNT(*) as count FROM ships"
      )) as any;
      if (rows[0].count === 0) {
        console.log("📥 Database empty, performing initial sync...");
        await service.syncFromShipMatrix();
      } else {
        console.log(`📊 Database has ${rows[0].count} ships`);
      }
    } catch (error) {
      console.error("Startup check error:", error);
    }
  }

  app.listen(port, () => {
    console.log(`🚀 Starapi v2.0 running on http://localhost:${port}`);
    console.log(`📚 Documentation: http://localhost:${port}/api-docs`);
  });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  await closeDatabase();
  process.exit(0);
});

start();
