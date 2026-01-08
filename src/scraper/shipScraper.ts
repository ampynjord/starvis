import puppeteer, { Browser } from 'puppeteer';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import { ShipData, ShipSpecification, ShipImage, ShipPrice, ScrapeResult } from '../types/ship';

export class ShipScraper {
  private browser: Browser | null = null;

  async init(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close();
  }

  async scrapeShip(url: string): Promise<ScrapeResult> {
    try {
      if (!this.browser) await this.init();
      const page = await this.browser!.newPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait a bit for lazy-loaded content like holoviewer
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract 3D model URL using Puppeteer (JavaScript-rendered content)
      const model3dUrl = await page.evaluate(() => {
        // @ts-ignore - Code runs in browser context
        const doc = typeof document !== 'undefined' ? document : null;
        if (!doc) return null;

        // Try multiple selectors for the holoviewer
        const selectors = [
          '[class*="holoviewer"] iframe',
          '[class*="Holoviewer"] iframe',
          'iframe[src*="holoviewer"]',
          '.holoviewer iframe',
          '#holoviewer iframe',
          '.ship-holoviewer iframe',
          '[data-holoviewer]',
          '[data-model]',
          'iframe[src*="hologram"]',
          'iframe[src*="3d"]'
        ];

        for (const selector of selectors) {
          const element = doc.querySelector(selector);
          if (element) {
            if ((element as any).tagName === 'IFRAME') {
              const src = (element as any).src;
              if (src) return src;
            }
            const dataUrl = (element as any).getAttribute('data-holoviewer') ||
                           (element as any).getAttribute('data-model') ||
                           (element as any).getAttribute('data-src');
            if (dataUrl) return dataUrl;
          }
        }

        // Check all iframes as last resort
        const allIframes = Array.from(doc.querySelectorAll('iframe'));
        for (const iframe of allIframes) {
          const src = (iframe as any).src;
          if (src && (src.includes('holoviewer') || src.includes('hologram') || src.includes('3d-model'))) {
            return src;
          }
        }

        return null;
      });

      const html = await page.content();
      await page.close();

      const shipData = this.parseHtml(html, url);

      // Add 3D model URL if found
      if (model3dUrl && !shipData.model3d) {
        shipData.model3d = { viewerUrl: model3dUrl };
      } else if (model3dUrl && shipData.model3d) {
        shipData.model3d.viewerUrl = model3dUrl;
      }

      return { success: true, data: shipData };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async scrapeAllShips(): Promise<string[]> {
    try {
      if (!this.browser) await this.init();
      const page = await this.browser!.newPage();
      const allShipUrls: string[] = [];

      // First, load the initial page to get total number of pages
      await page.goto('https://robertsspaceindustries.com/pledge/ships', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Get total number of pages from pagination buttons
      const totalPages = await page.evaluate(() => {
        // @ts-ignore - Code runs in browser context
        const doc = typeof document !== 'undefined' ? document : null;
        if (!doc) return 1;

        const pageButtons = Array.from(doc.querySelectorAll('.orion-c-pagination__item button'));
        const pageNumbers = pageButtons
          .map((btn: any) => parseInt(btn.textContent?.trim() || '0'))
          .filter(num => !isNaN(num) && num > 0);
        return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
      });

      console.log(`Found ${totalPages} pages to scrape`);

      // Loop through all pages
      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        console.log(`Scraping page ${currentPage}/${totalPages}...`);

        if (currentPage > 1) {
          await page.goto(`https://robertsspaceindustries.com/pledge/ships?page=${currentPage}`, {
            waitUntil: 'networkidle2',
            timeout: 30000
          });
        }

        // Extract ship URLs from current page
        const shipUrls = await page.$$eval('a[href*="/pledge/ships/"]', (links) =>
          links.map((link) => (link as any).href).filter(href => /\/pledge\/ships\/[^/]+\/[^/]+$/.test(href))
        );

        allShipUrls.push(...shipUrls);
        console.log(`  Found ${shipUrls.length} ships on page ${currentPage}`);

        // Small delay between page requests
        if (currentPage < totalPages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      await page.close();
      const uniqueUrls = [...new Set(allShipUrls)];
      console.log(`Total unique ships found: ${uniqueUrls.length}`);
      return uniqueUrls;
    } catch (error) {
      console.error('Error scraping ships list:', error);
      return [];
    }
  }

  private parseHtml(html: string, url: string): ShipData {
    const $ = cheerio.load(html);
    const match = url.match(/\/ships\/([^\/]+)\/([^\/\?]+)/);
    const manufacturerSlug = match ? match[1] : '';
    const slug = match ? match[2] : '';

    const specifications = this.extractSpecs($);

    // Extract specific fields from specs
    const getSpecValue = (name: string) => {
      const spec = specifications.find(s => s.name.toLowerCase().includes(name.toLowerCase()));
      return spec?.value || undefined;
    };

    // Generate deterministic UUID from URL (v5 UUID with DNS namespace)
    const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace
    const uuid = crypto.createHash('sha1')
      .update(namespace + url)
      .digest('hex');
    const formattedUuid = `${uuid.substring(0, 8)}-${uuid.substring(8, 12)}-5${uuid.substring(13, 16)}-${uuid.substring(16, 20)}-${uuid.substring(20, 32)}`;

    // Get real manufacturer name from specs (brand only, not model)
    const manufacturerSpec = getSpecValue('manufacturer');
    let realManufacturer = '';

    if (manufacturerSpec) {
      realManufacturer = manufacturerSpec.trim();
    } else {
      // Map URL slugs to full manufacturer names
      const manufacturerMap: Record<string, string> = {
        'aegis': 'Aegis Dynamics',
        'anvil': 'Anvil Aerospace',
        'argo': 'Argo Astronautics',
        'banu': 'Banu',
        'c-o': 'Consolidated Outland',
        'consolidated-outland': 'Consolidated Outland',
        'crusader': 'Crusader Industries',
        'drake': 'Drake Interplanetary',
        'esperia': 'Esperia',
        'gatac': 'Gatac Manufacture',
        'greycat': 'Greycat Industrial',
        'kruger': 'Kruger Intergalactic',
        'misc': 'Musashi Industrial & Starflight Concern',
        'origin': 'Origin Jumpworks',
        'rsi': 'Roberts Space Industries',
        'vanduul': 'Vanduul',
        'xi-an': "Xi'an",
        'aopoa': "Aopoa",
        'atls': 'Argo Astronautics'
      };

      // Try full slug first, then first part before hyphen
      const slugLower = manufacturerSlug.toLowerCase();
      const firstPart = slugLower.split('-')[0];

      realManufacturer = manufacturerMap[slugLower] ||
                         manufacturerMap[firstPart] ||
                         manufacturerSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    return {
      id: formattedUuid,
      name: $('h1').first().text().trim() || slug,
      manufacturer: realManufacturer,
      slug, url,
      description: this.extractDescription($),
      price: this.extractPrice($),
      specifications,
      images: this.extractImages($),
      model3d: this.extract3DModel($),
      focus: getSpecValue('focus'),
      productionStatus: getSpecValue('production state') || getSpecValue('in-game status'),
      size: getSpecValue('size'),
      crew: {
        min: this.parseNumber(getSpecValue('min crew')),
        max: this.parseNumber(getSpecValue('max crew'))
      },
      scrapedAt: new Date()
    };
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) return undefined;
    const num = parseFloat(value.replace(/[^\d.]/g, ''));
    return isNaN(num) ? undefined : num;
  }

  private extractPrice($: cheerio.CheerioAPI): ShipPrice | undefined {
    const priceText = $('.price').first().text().trim();
    const match = priceText.match(/[\$€£]?\s*([\d,]+\.?\d*)/);
    if (match) {
      return {
        amount: parseFloat(match[1].replace(/,/g, '')),
        currency: priceText.includes('€') ? 'EUR' : priceText.includes('£') ? 'GBP' : 'USD'
      };
    }
    return undefined;
  }

  private extractSpecs($: cheerio.CheerioAPI): ShipSpecification[] {
    const specs: ShipSpecification[] = [];
    const seen = new Set<string>();

    // Extract from a-shipContentSpecification elements
    $('.a-shipContentSpecification').each((_, elem) => {
      const labelElem = $(elem).find('.a-shipContentSpecification__label .a-fontStyle');
      const valueElem = $(elem).find('.a-shipContentSpecification__value .a-fontStyle, .a-shipContentSpecification__values .a-fontStyle');

      if (labelElem.length && valueElem.length) {
        let label = labelElem.first().text().trim();
        let value = valueElem.first().text().trim();

        // Remove duplication if label contains itself twice
        const words = label.split(' ');
        if (words.length % 2 === 0) {
          const half = words.length / 2;
          const firstHalf = words.slice(0, half).join(' ');
          const secondHalf = words.slice(half).join(' ');
          if (firstHalf === secondHalf) {
            label = firstHalf;
          }
        }

        const key = `${label}:${value}`;
        if (label && value && !seen.has(key)) {
          seen.add(key);
          specs.push({ name: label, value });
        }
      }
    });

    return specs;
  }

  private extractImages($: cheerio.CheerioAPI): ShipImage[] {
    const images: ShipImage[] = [];
    const seen = new Set<string>();

    $('img').each((_, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src') || $(elem).attr('data-lazy-src');
      const alt = $(elem).attr('alt') || '';

      // Skip placeholders, base64, cookiebot, and empty ship images
      if (src &&
          !src.includes('base64') &&
          !src.includes('placeholder') &&
          !src.includes('cookiebot') &&
          !src.includes('empty-ship') &&
          !seen.has(src)) {
        seen.add(src);

        const fullUrl = src.startsWith('http') ? src : src.startsWith('//') ? `https:${src}` : `https://robertsspaceindustries.com${src}`;

        // Determine image type based on className or URL
        let type: 'thumbnail' | 'gallery' | 'blueprint' | 'other' = 'other';
        if (src.includes('blueprint') || alt.includes('blueprint')) type = 'blueprint';
        else if (src.includes('thumb')) type = 'thumbnail';
        else if (fullUrl.includes('robertsspaceindustries.com/i/')) type = 'gallery';

        images.push({ url: fullUrl, type, alt });
      }
    });

    return images;
  }

  private extractDescription($: cheerio.CheerioAPI): string {
    // Try multiple selectors for description
    let desc = $('.description').first().text().trim();
    if (!desc) {
      desc = $('[class*="description"]').first().text().trim();
    }
    if (!desc) {
      // Get from specs if available
      const descSpec = $('.a-shipContentSpecification').filter((_, el) => {
        return $(el).find('.a-shipContentSpecification__label').text().trim() === 'Description';
      }).find('.a-shipContentSpecification__value').text().trim();
      desc = descSpec;
    }
    return desc;
  }

  private extract3DModel($: cheerio.CheerioAPI): { viewerUrl?: string; modelUrl?: string } | undefined {
    const model: { viewerUrl?: string; modelUrl?: string } = {};

    // Look for holoviewer iframe
    const holoviewerIframe = $('[class*="holoviewer"] iframe, iframe[src*="holoviewer"]').first();
    if (holoviewerIframe.length) {
      model.viewerUrl = holoviewerIframe.attr('src');
    }

    // Look for data attributes that might contain model URL
    $('[data-holoviewer], [data-model-url], [data-3d-model]').each((_, elem) => {
      const modelUrl = $(elem).attr('data-model-url') || $(elem).attr('data-3d-model') || $(elem).attr('data-holoviewer');
      if (modelUrl) model.modelUrl = modelUrl;
    });

    return model.viewerUrl || model.modelUrl ? model : undefined;
  }
}
