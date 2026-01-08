import * as cheerio from "cheerio";
import cors from "cors";
import * as crypto from "crypto";
import "dotenv/config";
import express from "express";
import * as fs from "fs/promises";
import mysql from "mysql2/promise";
import * as path from "path";
import puppeteer, { Browser } from "puppeteer";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

// ===== DATABASE =====
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "starapi",
};

let dbPool: mysql.Pool | null = null;

async function initDatabase() {
  try {
    dbPool = mysql.createPool(dbConfig);
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS ships (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        manufacturer VARCHAR(255),
        slug VARCHAR(255),
        url TEXT,
        description TEXT,
        price_amount DECIMAL(10,2),
        price_currency VARCHAR(10),
        focus VARCHAR(255),
        production_status VARCHAR(100),
        size VARCHAR(50),
        crew_min INT,
        crew_max INT,
        model3d_viewer_url TEXT,
        model3d_model_url TEXT,
        scraped_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_manufacturer (manufacturer),
        INDEX idx_slug (slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS ship_specifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ship_id VARCHAR(255),
        name VARCHAR(255),
        value TEXT,
        FOREIGN KEY (ship_id) REFERENCES ships(id) ON DELETE CASCADE,
        INDEX idx_ship_id (ship_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS ship_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ship_id VARCHAR(255),
        url TEXT,
        type VARCHAR(50),
        alt VARCHAR(255),
        FOREIGN KEY (ship_id) REFERENCES ships(id) ON DELETE CASCADE,
        INDEX idx_ship_id (ship_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log("✅ Database initialized");
  } catch (error) {
    console.error(
      "❌ Database connection failed:",
      error instanceof Error ? error.message : error
    );
  }
}

async function closeDatabase() {
  if (dbPool) await dbPool.end();
}

// ===== TYPES =====
interface ShipSpecification {
  name: string;
  value: string;
}
interface ShipImage {
  url: string;
  type: "thumbnail" | "gallery" | "blueprint" | "other";
  alt?: string;
}
interface ShipPrice {
  amount: number;
  currency: string;
  warbond?: number;
}
interface Ship3DModel {
  viewerUrl?: string;
  modelUrl?: string;
}
interface ShipData {
  id: string;
  name: string;
  manufacturer: string;
  slug: string;
  url: string;
  description?: string;
  price?: ShipPrice;
  specifications: ShipSpecification[];
  images: ShipImage[];
  model3d?: Ship3DModel;
  focus?: string;
  productionStatus?: string;
  size?: string;
  crew?: { min?: number; max?: number };
  scrapedAt: Date;
}
interface ScrapeResult {
  success: boolean;
  data?: ShipData;
  error?: string;
}

// ===== SCRAPER =====
class ShipScraper {
  private browser: Browser | null = null;

  async init() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  async scrapeShip(url: string): Promise<ScrapeResult> {
    try {
      if (!this.browser) await this.init();
      const page = await this.browser!.newPage();

      // Intercepter les requêtes pour capturer les URLs .ctm
      const ctmRequests: string[] = [];
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const url = request.url();
        if (url.includes(".ctm") || url.includes("holoviewer")) {
          ctmRequests.push(url);
          console.log("🔍 Request intercepted:", url.substring(0, 100));
        }
        request.continue();
      });

      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      // Scroller la page pour déclencher le lazy loading du holoviewer
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await new Promise((r) => setTimeout(r, 2000));

      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise((r) => setTimeout(r, 5000)); // Attendre plus longtemps pour le chargement du holoviewer

      const model3dData = await page.evaluate(() => {
        const doc = typeof document !== "undefined" ? document : null;
        if (!doc) return null;

        // 1. Chercher dans window object (données React/Vue)
        const win = window as any;
        if (win.__INITIAL_STATE__ || win.__NEXT_DATA__ || win.__NUXT__) {
          const state =
            win.__INITIAL_STATE__ || win.__NEXT_DATA__ || win.__NUXT__;
          const stateStr = JSON.stringify(state);
          const ctmMatch = stateStr.match(/([^"']*\.ctm[^"']*)/);
          if (ctmMatch) {
            console.log("CTM found in window state:", ctmMatch[1]);
            return {
              viewerUrl: undefined,
              modelUrl: ctmMatch[1],
            };
          }
        }

        // 2. Chercher les iframes holoviewer
        const iframes = Array.from(doc.querySelectorAll("iframe"));
        for (const iframe of iframes) {
          const src = (iframe as HTMLIFrameElement).src;
          if (src && src.includes("holoviewer")) {
            const ctmMatch = src.match(/ctm=([^&]+)/);
            const modelUrl = ctmMatch ? decodeURIComponent(ctmMatch[1]) : null;

            console.log("Holoviewer iframe found:", src);
            if (modelUrl) console.log("Model URL extracted:", modelUrl);

            return {
              viewerUrl: src,
              modelUrl: modelUrl || undefined,
            };
          }
        }

        // 3. Chercher les divs avec data-attributes
        const holoElements = doc.querySelectorAll(
          '[class*="holo"], [id*="holo"], [data-model], [data-ctm]'
        );
        for (const elem of Array.from(holoElements)) {
          const attrs = (elem as HTMLElement).dataset;
          if (attrs.model || attrs.ctm || attrs.source) {
            const modelUrl = attrs.model || attrs.ctm || attrs.source;
            console.log("Model found in data-attribute:", modelUrl);
            return {
              viewerUrl: undefined,
              modelUrl: modelUrl,
            };
          }
        }

        // 4. Chercher dans tous les scripts
        const scripts = Array.from(doc.querySelectorAll("script"));
        for (const script of scripts) {
          const content = script.textContent || "";
          if (content.includes(".ctm")) {
            // Chercher les URLs .ctm avec différents patterns
            const patterns = [
              /"([^"]+\.ctm[^"]*)"/g,
              /'([^']+\.ctm[^']*)'/g,
              /https?:\/\/[^\s"']+\.ctm[^\s"']*/g,
              /\/[^\s"']+\.ctm[^\s"']*/g,
            ];

            for (const pattern of patterns) {
              const matches = content.match(pattern);
              if (matches && matches.length > 0) {
                const ctmUrl = matches[0].replace(/['"]/g, "");
                console.log("CTM found in script:", ctmUrl);
                return {
                  viewerUrl: undefined,
                  modelUrl: ctmUrl,
                };
              }
            }
          }
        }

        return null;
      });

      const html = await page.content();

      // Utiliser les URLs capturées par l'interception si aucune n'a été trouvée
      let finalModel3dData = model3dData;
      if (!finalModel3dData && ctmRequests.length > 0) {
        const ctmUrl = ctmRequests.find((r) => r.includes(".ctm"));
        if (ctmUrl) {
          console.log("🎯 CTM found via network interception:", ctmUrl);
          finalModel3dData = {
            viewerUrl: ctmRequests.find((r) => r.includes("holoviewer")),
            modelUrl: ctmUrl,
          };
        }
      }

      await page.close();

      const shipData = this.parseHtml(html, url);
      if (finalModel3dData) {
        shipData.model3d = finalModel3dData;
        console.log(
          `🎨 Model 3D detected: viewer=${
            finalModel3dData.viewerUrl?.substring(0, 50) || "N/A"
          }..., model=${finalModel3dData.modelUrl?.substring(0, 50)}...`
        );
      } else {
        console.log("⚠️  No 3D model found on page");
      }

      return { success: true, data: shipData };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async scrapeAllShips(): Promise<string[]> {
    try {
      if (!this.browser) await this.init();
      const page = await this.browser!.newPage();
      const allUrls: string[] = [];

      await page.goto("https://robertsspaceindustries.com/pledge/ships", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      const totalPages = await page.evaluate(() => {
        const doc = typeof document !== "undefined" ? document : null;
        if (!doc) return 1;
        const nums = Array.from(
          doc.querySelectorAll(".orion-c-pagination__item button")
        )
          .map((b: any) => parseInt(b.textContent?.trim() || "0"))
          .filter((n) => !isNaN(n) && n > 0);
        return nums.length > 0 ? Math.max(...nums) : 1;
      });

      for (let p = 1; p <= totalPages; p++) {
        if (p > 1)
          await page.goto(
            `https://robertsspaceindustries.com/pledge/ships?page=${p}`,
            { waitUntil: "networkidle2", timeout: 30000 }
          );
        const urls = await page.$$eval('a[href*="/pledge/ships/"]', (links) =>
          links
            .map((l) => (l as any).href)
            .filter((h) => /\/pledge\/ships\/[^/]+\/[^/]+$/.test(h))
        );
        allUrls.push(...urls);
        if (p < totalPages) await new Promise((r) => setTimeout(r, 1000));
      }

      await page.close();
      return [...new Set(allUrls)];
    } catch (error) {
      return [];
    }
  }

  private parseHtml(html: string, url: string): ShipData {
    const $ = cheerio.load(html);
    const match = url.match(/\/ships\/([^\/]+)\/([^\/\?]+)/);
    const manufacturerSlug = match?.[1] || "";
    const slug = match?.[2] || "";

    const specifications = this.extractSpecifications($);
    const getSpecValue = (name: string) =>
      specifications.find((s) =>
        s.name.toLowerCase().includes(name.toLowerCase())
      )?.value;

    const uuid = crypto
      .createHash("sha1")
      .update("6ba7b810-9dad-11d1-80b4-00c04fd430c8" + url)
      .digest("hex");
    const id = `${uuid.substring(0, 8)}-${uuid.substring(
      8,
      12
    )}-5${uuid.substring(13, 16)}-${uuid.substring(16, 20)}-${uuid.substring(
      20,
      32
    )}`;

    const manufMap: Record<string, string> = {
      aegis: "Aegis Dynamics",
      anvil: "Anvil Aerospace",
      argo: "Argo Astronautics",
      crusader: "Crusader Industries",
      drake: "Drake Interplanetary",
      origin: "Origin Jumpworks",
      rsi: "Roberts Space Industries",
      misc: "Musashi Industrial & Starflight Concern",
    };

    // Extraction du manufacturer
    const manufacturerKey = manufacturerSlug.split("-")[0];
    const manufacturer =
      getSpecValue("manufacturer") ||
      manufMap[manufacturerKey] ||
      manufacturerKey;

    // Nom complet du vaisseau
    const fullName = $("h1").first().text().trim() || slug;

    return {
      id,
      slug,
      url,
      name: fullName,
      manufacturer: manufacturer.trim(),
      description: this.extractDescription($),
      price: this.extractPrice($),
      specifications,
      images: this.extractImages($),
      model3d: undefined,
      focus: getSpecValue("focus"),
      productionStatus:
        getSpecValue("production state") || getSpecValue("in-game status"),
      size: getSpecValue("size"),
      crew: {
        min: this.parseNumber(getSpecValue("min crew")),
        max: this.parseNumber(getSpecValue("max crew")),
      },
      scrapedAt: new Date(),
    };
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) return undefined;
    const num = parseFloat(value.replace(/[^\d.]/g, ""));
    return isNaN(num) ? undefined : num;
  }

  private extractPrice($: cheerio.CheerioAPI): ShipPrice | undefined {
    const priceText = $(".price").first().text().trim();
    const match = priceText.match(/[\$€£]?\s*([\d,]+\.?\d*)/);
    if (match) {
      return {
        amount: parseFloat(match[1].replace(/,/g, "")),
        currency: priceText.includes("€")
          ? "EUR"
          : priceText.includes("£")
          ? "GBP"
          : "USD",
      };
    }
    return undefined;
  }

  private extractSpecifications($: cheerio.CheerioAPI): ShipSpecification[] {
    const specifications: ShipSpecification[] = [];
    const seenKeys = new Set<string>();

    $(".a-shipContentSpecification").each((_, elem) => {
      const label = $(elem)
        .find(".a-shipContentSpecification__label .a-fontStyle")
        .first()
        .text()
        .trim();
      const value = $(elem)
        .find(
          ".a-shipContentSpecification__value .a-fontStyle, .a-shipContentSpecification__values .a-fontStyle"
        )
        .first()
        .text()
        .trim();
      const key = `${label}:${value}`;
      if (label && value && !seenKeys.has(key)) {
        seenKeys.add(key);
        specifications.push({ name: label, value });
      }
    });

    return specifications;
  }

  private extractImages($: cheerio.CheerioAPI): ShipImage[] {
    const images: ShipImage[] = [];
    const seen = new Set<string>();

    // Filtres pour exclure les images non pertinentes
    const excludePatterns = [
      "base64",
      "placeholder",
      "cookiebot",
      "tracking",
      "analytics",
      "pixel",
      "1x1",
      "tracker",
      "beacon",
      ".gif",
      "logo",
      "icon",
      "favicon",
      "imgsct.cookiebot.com",
      "empty-ship",
    ];

    $("img").each((_, elem) => {
      const src = $(elem).attr("src") || $(elem).attr("data-src");
      const alt = $(elem).attr("alt") || "";

      if (!src || seen.has(src)) return;

      // Construire l'URL complète
      const url = src.startsWith("http")
        ? src
        : src.startsWith("//")
        ? `https:${src}`
        : `https://robertsspaceindustries.com${src}`;

      // Vérifier les patterns à exclure sur l'URL complète
      const srcLower = src.toLowerCase();
      const urlLower = url.toLowerCase();
      const altLower = alt.toLowerCase();
      if (
        excludePatterns.some(
          (pattern) =>
            srcLower.includes(pattern) ||
            urlLower.includes(pattern) ||
            altLower.includes(pattern)
        )
      )
        return;

      // Ignorer les images trop petites (probablement des trackers)
      const width = parseInt($(elem).attr("width") || "0");
      const height = parseInt($(elem).attr("height") || "0");
      if ((width > 0 && width < 50) || (height > 0 && height < 50)) return;

      seen.add(src);

      const type =
        src.includes("blueprint") || alt.toLowerCase().includes("blueprint")
          ? "blueprint"
          : src.includes("thumb") || alt.toLowerCase().includes("thumbnail")
          ? "thumbnail"
          : url.includes("/i/") || alt.toLowerCase().includes("gallery")
          ? "gallery"
          : src.includes("store") || alt.toLowerCase().includes("store")
          ? "store"
          : "screenshot";

      images.push({ url, type, alt });
    });

    return images;
  }

  private extractDescription($: cheerio.CheerioAPI): string {
    let desc = $(".description").first().text().trim();
    if (!desc) desc = $('[class*="description"]').first().text().trim();
    if (!desc) {
      desc = $(".a-shipContentSpecification")
        .filter(
          (_, el) =>
            $(el).find(".a-shipContentSpecification__label").text().trim() ===
            "Description"
        )
        .find(".a-shipContentSpecification__value")
        .text()
        .trim();
    }
    return desc;
  }
}

// ===== SERVICE =====
class ShipService {
  private scraper = new ShipScraper();
  private cache = new Map<string, { data: ShipData; expiresAt: number }>();
  private cacheDir = "./cache";
  private cacheDuration = 3600000;

  async init() {
    await fs.mkdir(this.cacheDir, { recursive: true }).catch(() => {});
    await this.loadFromCache();
    await this.scraper.init();
    await initDatabase();
  }

  async close() {
    await this.scraper.close();
    await closeDatabase();
  }

  private async loadFromCache() {
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        const data = JSON.parse(
          await fs.readFile(path.join(this.cacheDir, file), "utf-8")
        );
        if (Date.now() <= data.expiresAt)
          this.cache.set(file.replace(".json", ""), data);
      }
    } catch {}
  }

  private async saveToCache(cacheKey: string, data: ShipData) {
    const entry = { data, expiresAt: Date.now() + this.cacheDuration };
    await fs
      .writeFile(
        path.join(this.cacheDir, `${cacheKey}.json`),
        JSON.stringify(entry, null, 2)
      )
      .catch(() => {});
  }

  private async saveToDatabase(data: ShipData) {
    if (!dbPool) return;

    try {
      const conn = await dbPool.getConnection();

      try {
        await conn.beginTransaction();

        // Insert/Update ship
        await conn.execute(
          `INSERT INTO ships (
            id, name, manufacturer, slug, url, description,
            price_amount, price_currency, focus, production_status, size,
            crew_min, crew_max, model3d_viewer_url, model3d_model_url, scraped_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name=VALUES(name), manufacturer=VALUES(manufacturer),
            description=VALUES(description), price_amount=VALUES(price_amount),
            price_currency=VALUES(price_currency), focus=VALUES(focus),
            production_status=VALUES(production_status), size=VALUES(size),
            crew_min=VALUES(crew_min), crew_max=VALUES(crew_max),
            model3d_viewer_url=VALUES(model3d_viewer_url),
            model3d_model_url=VALUES(model3d_model_url),
            scraped_at=VALUES(scraped_at)`,
          [
            data.id,
            data.name,
            data.manufacturer,
            data.slug,
            data.url,
            data.description || null,
            data.price?.amount || null,
            data.price?.currency || null,
            data.focus || null,
            data.productionStatus || null,
            data.size || null,
            data.crew?.min || null,
            data.crew?.max || null,
            data.model3d?.viewerUrl || null,
            data.model3d?.modelUrl || null,
            data.scrapedAt,
          ]
        );

        // Delete old specifications and images
        await conn.execute(
          "DELETE FROM ship_specifications WHERE ship_id = ?",
          [data.id]
        );
        await conn.execute("DELETE FROM ship_images WHERE ship_id = ?", [
          data.id,
        ]);

        // Insert specifications
        for (const spec of data.specifications) {
          await conn.execute(
            "INSERT INTO ship_specifications (ship_id, name, value) VALUES (?, ?, ?)",
            [data.id, spec.name, spec.value]
          );
        }

        // Insert images
        for (const img of data.images) {
          await conn.execute(
            "INSERT INTO ship_images (ship_id, url, type, alt) VALUES (?, ?, ?, ?)",
            [data.id, img.url, img.type, img.alt]
          );
        }

        await conn.commit();
        console.log(`💾 Saved to database: ${data.name}`);
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    } catch (error) {
      console.error(
        "Database save error:",
        error instanceof Error ? error.message : error
      );
    }
  }

  async getShipBySlug(
    manufacturer: string,
    slug: string,
    forceRefresh = false
  ): Promise<ScrapeResult> {
    const cacheKey = `${manufacturer}-${slug}`;

    // Check memory cache first
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() <= cached.expiresAt)
        return { success: true, data: cached.data };

      // Check database if not in memory cache
      const dbData = await this.getFromDatabase(cacheKey);
      if (dbData) {
        this.cache.set(cacheKey, {
          data: dbData,
          expiresAt: Date.now() + this.cacheDuration,
        });
        return { success: true, data: dbData };
      }
    }

    const url = `https://robertsspaceindustries.com/en/pledge/ships/${manufacturer}/${slug}`;
    const result = await this.scraper.scrapeShip(url);

    if (result.success && result.data) {
      this.cache.set(cacheKey, {
        data: result.data,
        expiresAt: Date.now() + this.cacheDuration,
      });
      await this.saveToCache(cacheKey, result.data);
      await this.saveToDatabase(result.data);
    }

    return result;
  }

  private async getFromDatabase(cacheKey: string): Promise<ShipData | null> {
    if (!dbPool) return null;

    try {
      const [rows] = (await dbPool.execute(
        'SELECT * FROM ships WHERE id = ? OR CONCAT(manufacturer, "-", slug) = ?',
        [cacheKey, cacheKey]
      )) as any;

      if (rows.length === 0) return null;

      const ship = rows[0];

      // Get specifications
      const [specs] = (await dbPool.execute(
        "SELECT name, value FROM ship_specifications WHERE ship_id = ?",
        [ship.id]
      )) as any;

      // Get images
      const [images] = (await dbPool.execute(
        "SELECT url, type, alt FROM ship_images WHERE ship_id = ?",
        [ship.id]
      )) as any;

      return {
        id: ship.id,
        name: ship.name,
        manufacturer: ship.manufacturer,
        slug: ship.slug,
        url: ship.url,
        description: ship.description,
        price: ship.price_amount
          ? {
              amount: ship.price_amount,
              currency: ship.price_currency,
            }
          : undefined,
        specifications: specs,
        images: images,
        model3d: ship.model3d_viewer_url
          ? {
              viewerUrl: ship.model3d_viewer_url,
              modelUrl: ship.model3d_model_url,
            }
          : undefined,
        focus: ship.focus,
        productionStatus: ship.production_status,
        size: ship.size,
        crew: {
          min: ship.crew_min,
          max: ship.crew_max,
        },
        scrapedAt: new Date(ship.scraped_at),
      };
    } catch (error) {
      console.error(
        "Database read error:",
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }

  async getAllShips(): Promise<ShipData[]> {
    if (!dbPool) return this.getAllCachedShips();

    try {
      const [rows] = (await dbPool.execute(
        "SELECT id, name, manufacturer, slug, url, size, production_status FROM ships ORDER BY manufacturer, name"
      )) as any;

      return rows.map((ship: any) => ({
        id: ship.id,
        name: ship.name,
        manufacturer: ship.manufacturer,
        slug: ship.slug,
        url: ship.url,
        size: ship.size,
        productionStatus: ship.production_status,
        specifications: [],
        images: [],
        scrapedAt: new Date(),
      }));
    } catch (error) {
      console.error(
        "Database list error:",
        error instanceof Error ? error.message : error
      );
      return this.getAllCachedShips();
    }
  }

  async getShipByUrl(url: string, forceRefresh = false): Promise<ScrapeResult> {
    const match = url.match(/\/ships\/([^\/]+)\/([^\/\?]+)/);
    if (!match) return { success: false, error: "Invalid URL format" };
    return this.getShipBySlug(match[1], match[2], forceRefresh);
  }

  async getAllCachedShips(): Promise<ShipData[]> {
    return Array.from(this.cache.values())
      .filter((e) => Date.now() <= e.expiresAt)
      .map((e) => e.data);
  }

  async clearCache() {
    this.cache.clear();
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map((f) => fs.unlink(path.join(this.cacheDir, f)))
      );
    } catch {}
  }

  async deleteCachedShip(manufacturer: string, slug: string) {
    const cacheKey = `${manufacturer}-${slug}`;
    this.cache.delete(cacheKey);
    await fs
      .unlink(path.join(this.cacheDir, `${cacheKey}.json`))
      .catch(() => {});
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
      version: "1.0.0",
      description:
        "API REST pour récupérer les données des vaisseaux Star Citizen",
      contact: {
        name: "API Support",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
    ],
    tags: [
      {
        name: "Ships",
        description: "Operations sur les vaisseaux",
      },
      {
        name: "System",
        description: "Operations système",
      },
    ],
  },
  apis: ["./server.ts"],
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
    name: "Star Citizen Ships API",
    version: "1.0.0",
    documentation: "/api-docs",
    endpoints: {
      "GET /api/ships": "Liste tous les vaisseaux",
      "GET /api/ships/:manufacturer/:slug": "Récupère un vaisseau",
      "POST /api/ships/scrape": "Scrappe depuis URL",
      "DELETE /api/ships/cache": "Vide le cache",
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 uptime:
 *                   type: number
 *                   example: 123.45
 */
app.get("/health", (req, res) =>
  res.json({ status: "ok", uptime: process.uptime() })
);

/**
 * @swagger
 * /api/ships:
 *   get:
 *     summary: Liste tous les vaisseaux
 *     tags: [Ships]
 *     responses:
 *       200:
 *         description: Liste des vaisseaux
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       manufacturer:
 *                         type: string
 *                       size:
 *                         type: string
 */
app.get("/api/ships", async (req, res) => {
  try {
    const ships = await service.getAllShips();
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
 *         description: Nom du manufacturer
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug du vaisseau
 *       - in: query
 *         name: refresh
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: Force le rafraîchissement depuis le site
 *     responses:
 *       200:
 *         description: Détails du vaisseau
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Vaisseau non trouvé
 */
app.get("/api/ships/:manufacturer/:slug", async (req, res) => {
  try {
    const { manufacturer, slug } = req.params;
    const result = await service.getShipBySlug(
      manufacturer,
      slug,
      req.query.refresh === "true"
    );
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res
        .status(404)
        .json({ success: false, error: result.error || "Not found" });
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
 * /api/ships/scrape:
 *   post:
 *     summary: Scrappe un vaisseau depuis une URL
 *     tags: [Ships]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: URL du vaisseau sur robertsspaceindustries.com
 *                 example: https://robertsspaceindustries.com/pledge/ships/anvil-arrow/Arrow
 *               forceRefresh:
 *                 type: boolean
 *                 description: Force le scraping même si le cache existe
 *                 default: false
 *     responses:
 *       200:
 *         description: Scraping réussi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Erreur de validation ou de scraping
 */
app.post("/api/ships/scrape", async (req, res) => {
  try {
    const { url, forceRefresh } = req.body;
    if (!url)
      return res.status(400).json({ success: false, error: "URL required" });

    const result = await service.getShipByUrl(url, forceRefresh);
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res
        .status(400)
        .json({ success: false, error: result.error || "Scraping failed" });
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
 * /api/ships/cache:
 *   delete:
 *     summary: Vide le cache des vaisseaux
 *     tags: [Ships]
 *     responses:
 *       200:
 *         description: Cache vidé avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Cache cleared
 *       500:
 *         description: Erreur serveur
 */
app.delete("/api/ships/cache", async (req, res) => {
  try {
    await service.clearCache();
    res.json({ success: true, message: "Cache cleared" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error",
    });
  }
});

// ===== CLI MODE =====
const args = process.argv.slice(2);
if (args[0] === "scrape") {
  const scrapeUrl =
    args[1] ||
    "https://robertsspaceindustries.com/pledge/ships/anvil-arrow/Arrow";
  console.log("🔄 Mode scraping - URL:", scrapeUrl);

  (async () => {
    await service.init();
    const result = await service.getShipByUrl(scrapeUrl, true);
    console.log(
      result.success ? "✅ Scraping réussi" : "❌ Échec:",
      result.error || ""
    );
    if (result.success && result.data) {
      console.log("📦 Vaisseau:", result.data.name);
      console.log("🏭 Manufacturer:", result.data.manufacturer);
      if (result.data.model3d?.modelUrl)
        console.log("🎮 Modèle 3D:", result.data.model3d.modelUrl);
    }
    await service.close();
    process.exit(result.success ? 0 : 1);
  })();
} else {
  // Server mode
  app.listen(port, async () => {
    await service.init();
    console.log(`🚀 Server running on http://localhost:${port}`);
  });
}
