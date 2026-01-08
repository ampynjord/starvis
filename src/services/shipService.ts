import { ShipScraper } from '../scraper/shipScraper';
import { ShipData, ScrapeResult } from '../types/ship';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ShipService {
  private scraper: ShipScraper;
  private cache: Map<string, { data: ShipData; expiresAt: number }> = new Map();
  private cacheDir = './cache';
  private cacheDuration: number;

  constructor(cacheDuration: number = 3600000) {
    this.scraper = new ShipScraper();
    this.cacheDuration = cacheDuration;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true }).catch(() => {});
    await this.loadCacheFromDisk();
    await this.scraper.init();
  }

  async close(): Promise<void> {
    await this.scraper.close();
  }

  private async loadCacheFromDisk(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(path.join(this.cacheDir, file), 'utf-8');
          const entry = JSON.parse(data);
          if (Date.now() <= entry.expiresAt) {
            const key = file.replace('.json', '');
            this.cache.set(key, entry);
          }
        }
      }
    } catch (error) {}
  }

  private async saveCacheToDisk(key: string, data: ShipData): Promise<void> {
    const entry = { data, expiresAt: Date.now() + this.cacheDuration };
    const filePath = path.join(this.cacheDir, `${key}.json`);
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2)).catch(() => {});
  }

  async getShipBySlug(manufacturer: string, slug: string, forceRefresh = false): Promise<ScrapeResult> {
    const cacheKey = `${manufacturer}-${slug}`;

    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() <= cached.expiresAt) {
        console.log(`Cache hit: ${cacheKey}`);
        return { success: true, data: cached.data };
      }
    }

    const url = `https://robertsspaceindustries.com/en/pledge/ships/${manufacturer}/${slug}`;
    console.log(`Scraping: ${url}`);

    const result = await this.scraper.scrapeShip(url);

    if (result.success && result.data) {
      this.cache.set(cacheKey, { data: result.data, expiresAt: Date.now() + this.cacheDuration });
      await this.saveCacheToDisk(cacheKey, result.data);
    }

    return result;
  }

  async getShipByUrl(url: string, forceRefresh = false): Promise<ScrapeResult> {
    const match = url.match(/\/ships\/([^\/]+)\/([^\/\?]+)/);
    if (!match) return { success: false, error: 'Invalid URL format' };
    const [, manufacturer, slug] = match;
    return this.getShipBySlug(manufacturer, slug, forceRefresh);
  }

  async getAllCachedShips(): Promise<ShipData[]> {
    return Array.from(this.cache.values())
      .filter(entry => Date.now() <= entry.expiresAt)
      .map(entry => entry.data);
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(files.map(f => fs.unlink(path.join(this.cacheDir, f))));
    } catch (error) {}
  }

  async deleteShipCache(manufacturer: string, slug: string): Promise<void> {
    const cacheKey = `${manufacturer}-${slug}`;
    this.cache.delete(cacheKey);
    await fs.unlink(path.join(this.cacheDir, `${cacheKey}.json`)).catch(() => {});
  }
}
