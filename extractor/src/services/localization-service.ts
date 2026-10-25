/**
 * LocalizationService — Parses Star Citizen global.ini localization files
 * from P4K to resolve human-readable display names for components and ships.
 *
 * The global.ini file contains lines like:
 *   @item_NameBEHR_LaserRepeater_S2=Attrition-2 Repeater
 *   @item_DescBEHR_LaserRepeater_S2=The Attrition-2 is a size 2 energy repeater...
 *   @vehicle_Name_AEGS_Gladius=Gladius
 *
 * This service builds an index of these keys for fast lookup.
 */

import { readFile } from 'node:fs/promises';
import { SCRAPER_USER_AGENT } from '../config.js';
import type { P4KProvider } from '../dataforge/p4k-provider.js';
import logger from '../logger.js';

export type SupportedLocale = 'en' | 'fr';

const DEFAULT_FR_GLOBAL_INI_URL =
  'https://raw.githubusercontent.com/Circuspes/Star-Citizen-FR/main/data/Localization/french_(france)/global.ini';

interface LocaleIndexSet {
  nameIndex: Map<string, string>;
  descIndex: Map<string, string>;
  classNameIndex: Map<string, string>;
  classNameDescIndex: Map<string, string>;
  classNameCanonicalIndex: Map<string, string>;
  classNameDescCanonicalIndex: Map<string, string>;
}

export class LocalizationService {
  /** LOC key → display name */
  private nameIndex = new Map<string, string>();
  /** LOC key → description */
  private descIndex = new Map<string, string>();
  /** className (normalized) → display name */
  private classNameIndex = new Map<string, string>();
  /** className (normalized) → description */
  private classNameDescIndex = new Map<string, string>();
  /** Canonical className → display name (separator/case-insensitive) */
  private classNameCanonicalIndex = new Map<string, string>();
  /** Canonical className → description (separator/case-insensitive) */
  private classNameDescCanonicalIndex = new Map<string, string>();

  /** French (fr) indexes */
  private frIndexes: LocaleIndexSet = {
    nameIndex: new Map<string, string>(),
    descIndex: new Map<string, string>(),
    classNameIndex: new Map<string, string>(),
    classNameDescIndex: new Map<string, string>(),
    classNameCanonicalIndex: new Map<string, string>(),
    classNameDescCanonicalIndex: new Map<string, string>(),
  };

  private loaded = false;
  private frLoaded = false;

  private getIndexes(lang: SupportedLocale = 'en'): LocaleIndexSet {
    if (lang === 'fr') return this.frIndexes;
    return {
      nameIndex: this.nameIndex,
      descIndex: this.descIndex,
      classNameIndex: this.classNameIndex,
      classNameDescIndex: this.classNameDescIndex,
      classNameCanonicalIndex: this.classNameCanonicalIndex,
      classNameDescCanonicalIndex: this.classNameDescCanonicalIndex,
    };
  }

  private static canonicalizeClassName(value: string): string {
    return value
      .toLowerCase()
      .replace(/^entityclassdefinition\./, '')
      .replace(/^@+/, '')
      .replace(/_?scitem$/i, '')
      .replace(/^[^a-z0-9]+/, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private static buildClassNameCandidates(className: string): string[] {
    const seed = className.replace(/^entityclassdefinition\./i, '');
    const candidates = new Set<string>([seed]);

    const queue = [seed];
    while (queue.length) {
      const current = queue.pop()!;
      const trimmed = current.replace(/^_+/, '');
      const withLeading = current.startsWith('_') ? current : `_${current}`;
      const noScItem = current.replace(/_?scitem$/i, '');
      const withScItem = /_scitem$/i.test(current) ? current : `${current}_SCItem`;
      const noMfg = current.replace(/^[A-Z]{3,5}_/, '');
      const variants = [trimmed, withLeading, noScItem, withScItem, noMfg];

      for (const v of variants) {
        if (v && !candidates.has(v)) {
          candidates.add(v);
          queue.push(v);
        }
      }
    }

    return [...candidates];
  }

  get isLoaded(): boolean {
    return this.loaded;
  }
  get isFrenchLoaded(): boolean {
    return this.frLoaded;
  }
  get entryCount(): number {
    return this.nameIndex.size;
  }
  get frenchEntryCount(): number {
    return this.frIndexes.nameIndex.size;
  }

  /**
   * Load and parse global.ini from P4K provider (English + French).
   * Tries multiple known paths for different SC versions.
   */
  async loadFromP4K(provider: P4KProvider, onProgress?: (msg: string) => void): Promise<number> {
    const paths = [
      'Data/Localization/english/global.ini',
      'Data/Localization/English/global.ini',
      'Data\\Localization\\english\\global.ini',
      'Data\\Localization\\English\\global.ini',
    ];

    let buffer: Buffer | null = null;
    for (const path of paths) {
      try {
        const entry = await provider.getEntry(path);
        if (entry) {
          onProgress?.(`Loading localization: ${path} (${(entry.uncompressedSize / 1024).toFixed(0)} KB)`);
          buffer = await provider.readFileFromEntry(entry);
          break;
        }
      } catch {
        // Try next path
      }
    }

    let enCount = 0;
    if (!buffer) {
      logger.warn('global.ini not found in P4K — localization will use fallback names', { module: 'localization' });
      this.loaded = true; // Mark as loaded but empty — fallback mode
    } else {
      enCount = this.parseGlobalIni(buffer, onProgress, 'en');
    }

    await this.loadFrenchLocalization(provider, onProgress);
    return enCount;
  }

  /**
   * Load French (fr) global.ini from local override, P4K, or community SC-FR GitHub repository.
   */
  async loadFrenchLocalization(provider?: P4KProvider | null, onProgress?: (msg: string) => void): Promise<number> {
    let buffer: Buffer | null = null;

    const customFrPath = process.env.FR_GLOBAL_INI_PATH?.trim();
    if (customFrPath) {
      try {
        buffer = await readFile(customFrPath);
        onProgress?.(`Loading French localization from file: ${customFrPath}`);
      } catch (err) {
        logger.warn(`Failed to read FR_GLOBAL_INI_PATH (${customFrPath}): ${(err as Error).message}`, { module: 'localization' });
      }
    }

    if (!buffer && provider) {
      const p4kFrPaths = [
        'Data/Localization/french_(france)/global.ini',
        'Data/Localization/French_(France)/global.ini',
        'Data\\Localization\\french_(france)\\global.ini',
        'Data\\Localization\\French_(France)\\global.ini',
      ];
      for (const path of p4kFrPaths) {
        try {
          const entry = await provider.getEntry(path);
          if (entry) {
            onProgress?.(`Loading French localization from P4K: ${path} (${(entry.uncompressedSize / 1024).toFixed(0)} KB)`);
            buffer = await provider.readFileFromEntry(entry);
            break;
          }
        } catch {
          // Try next path
        }
      }
    }

    if (!buffer && process.env.SKIP_FR_LOC_DOWNLOAD !== 'true' && process.env.NODE_ENV !== 'test') {
      const url = (process.env.FR_GLOBAL_INI_URL ?? DEFAULT_FR_GLOBAL_INI_URL).trim();
      try {
        onProgress?.(`Fetching French localization (SC-FR) from ${url}…`);
        const res = await fetch(url, {
          headers: { 'User-Agent': SCRAPER_USER_AGENT },
          signal: AbortSignal.timeout(25_000),
        });
        if (res.ok) {
          const ab = await res.arrayBuffer();
          buffer = Buffer.from(ab);
        }
      } catch (err) {
        logger.warn(`French localization download skipped: ${(err as Error).message}`, { module: 'localization' });
      }
    }

    if (!buffer) {
      this.frLoaded = true;
      return 0;
    }

    return this.parseGlobalIni(buffer, onProgress, 'fr');
  }

  /**
   * Parse global.ini buffer content.
   * Format: key=value lines, BOM-prefixed UTF-16LE or UTF-8
   */
  public parseGlobalIni(buffer: Buffer, onProgress?: (msg: string) => void, lang: SupportedLocale = 'en'): number {
    let content: string;

    // Detect encoding: UTF-16LE BOM = 0xFF 0xFE
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      content = buffer.toString('utf16le');
    } else if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      // UTF-8 BOM
      content = buffer.toString('utf8').substring(1);
    } else {
      content = buffer.toString('utf8');
    }

    const lines = content.split(/\r?\n/);
    let parsed = 0;
    const idx = this.getIndexes(lang);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;

      const rawKey = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      if (!value) continue;

      // Normalize key: strip leading @
      const key = rawKey.startsWith('@') ? rawKey.substring(1) : rawKey;
      const keyLower = key.toLowerCase();

      // Item names: item_Name{className}=Display Name
      if (keyLower.startsWith('item_name')) {
        const className = key.substring('item_Name'.length);
        if (className) {
          idx.nameIndex.set(key, value);
          idx.classNameIndex.set(className.toLowerCase(), value);
          const canonical = LocalizationService.canonicalizeClassName(className);
          if (canonical && !idx.classNameCanonicalIndex.has(canonical)) {
            idx.classNameCanonicalIndex.set(canonical, value);
          }
          parsed++;
        }
      }
      // Item descriptions: item_Desc{className}=Description
      else if (keyLower.startsWith('item_desc')) {
        const className = key.substring('item_Desc'.length);
        if (className) {
          idx.descIndex.set(key, value);
          idx.classNameDescIndex.set(className.toLowerCase(), value);
          const canonical = LocalizationService.canonicalizeClassName(className);
          if (canonical && !idx.classNameDescCanonicalIndex.has(canonical)) {
            idx.classNameDescCanonicalIndex.set(canonical, value);
          }
        }
      }
      // Vehicle names: vehicle_Name_{className}=Display Name
      else if (keyLower.startsWith('vehicle_name_')) {
        const className = key.substring('vehicle_Name_'.length);
        if (className) {
          idx.nameIndex.set(key, value);
          idx.classNameIndex.set(className.toLowerCase(), value);
          const canonical = LocalizationService.canonicalizeClassName(className);
          if (canonical && !idx.classNameCanonicalIndex.has(canonical)) {
            idx.classNameCanonicalIndex.set(canonical, value);
          }
          parsed++;
        }
      }
      // Generic LOC keys (catch-all for other patterns)
      else {
        idx.nameIndex.set(key, value);
      }
    }

    if (lang === 'fr') {
      this.frLoaded = true;
      logger.info(`French localization loaded: ${parsed} name entries, ${idx.descIndex.size} descriptions`, {
        module: 'localization',
      });
      onProgress?.(`Localization [FR]: ${parsed} names, ${idx.descIndex.size} descriptions`);
    } else {
      this.loaded = true;
      logger.info(`Localization loaded: ${parsed} name entries, ${idx.descIndex.size} descriptions`, { module: 'localization' });
      onProgress?.(`Localization: ${parsed} names, ${idx.descIndex.size} descriptions`);
    }
    return parsed;
  }

  /**
   * Resolve a display name for a given className.
   * Tries multiple key patterns used by CIG:
   *   1. Exact className match
   *   2. With common prefixes stripped (manufacturer codes)
   *   3. LOC key patterns: item_Name{className}
   *
   * @returns Resolved display name or null if not found
   */
  resolveComponentName(className: string, lang: SupportedLocale = 'en'): string | null {
    if (!className) return null;
    const idx = this.getIndexes(lang);
    for (const candidate of LocalizationService.buildClassNameCandidates(className)) {
      const direct = idx.classNameIndex.get(candidate.toLowerCase());
      if (direct) return direct;
    }

    for (const candidate of LocalizationService.buildClassNameCandidates(className)) {
      const canonical = LocalizationService.canonicalizeClassName(candidate);
      if (!canonical) continue;
      const mapped = idx.classNameCanonicalIndex.get(canonical);
      if (mapped) return mapped;
    }

    return null;
  }

  /**
   * Resolve a display name for a ship className.
   */
  resolveShipName(className: string, lang: SupportedLocale = 'en'): string | null {
    if (!className) return null;
    const idx = this.getIndexes(lang);
    const cn = className.toLowerCase();

    // Direct match
    const direct = idx.classNameIndex.get(cn);
    if (direct) return direct;

    // Try vehicle_Name_ prefix pattern
    const vehicleKey = `vehicle_Name_${className}`;
    const veh = idx.nameIndex.get(vehicleKey);
    if (veh) return veh;

    return null;
  }

  /**
   * Resolve a description for a given className.
   */
  resolveDescription(className: string, lang: SupportedLocale = 'en'): string | null {
    if (!className) return null;
    const idx = this.getIndexes(lang);
    for (const candidate of LocalizationService.buildClassNameCandidates(className)) {
      const direct = idx.classNameDescIndex.get(candidate.toLowerCase());
      if (direct) return direct;
    }
    for (const candidate of LocalizationService.buildClassNameCandidates(className)) {
      const canonical = LocalizationService.canonicalizeClassName(candidate);
      if (!canonical) continue;
      const mapped = idx.classNameDescCanonicalIndex.get(canonical);
      if (mapped) return mapped;
    }
    return null;
  }

  /**
   * Resolve a raw LOC key (with or without leading @) directly from the nameIndex.
   * Used for keys that don't follow className patterns, e.g. @hud_mining_rock_name_1
   */
  resolveKey(rawKey: string, lang: SupportedLocale = 'en'): string | null {
    if (!rawKey) return null;
    const idx = this.getIndexes(lang);
    const key = rawKey.startsWith('@') ? rawKey.substring(1) : rawKey;
    return idx.nameIndex.get(key) ?? idx.nameIndex.get(key.toLowerCase()) ?? null;
  }

  /**
   * Bulk resolve: try to resolve name for className, return fallback if not found.
   */
  resolveOrFallback(className: string, currentName: string): string {
    const resolved = this.resolveComponentName(className);
    if (resolved) return resolved;

    // Apply basic cleanup as fallback: strip prefix, replace underscores
    return this.cleanFallbackName(className, currentName);
  }

  /**
   * Improved fallback name cleaning (when LOC lookup fails):
   * - Strip manufacturer prefix (BEHR_, AEGS_, etc.)
   * - Strip SCItem / _SCItem suffix
   * - Replace underscores with spaces
   * - Handle size prefixes (S01_, S02_)
   * - Capitalize properly
   */
  private cleanFallbackName(className: string, currentName: string): string {
    // If currentName already looks clean (no underscores, not a class reference), use it
    if (currentName && !currentName.includes('_') && !currentName.startsWith('@')) {
      return currentName;
    }

    let name = currentName || className;

    // Strip @LOC reference
    if (name.startsWith('@')) name = className;

    // Strip manufacturer prefix
    name = name.replace(/^[A-Z]{3,5}_/, '');

    // Strip SCItem suffix
    name = name.replace(/_?SCItem\b.*$/i, '');
    name = name.replace(/_?scitem\b.*$/i, '');

    // Strip size prefix (S01_, S02_)
    name = name.replace(/^S\d{2}_?/i, '');

    // Strip _Resist suffixes
    name = name.replace(/_Resist.*$/i, '');

    // Replace underscores with spaces
    name = name.replace(/_/g, ' ');

    // Title case
    name = name.replace(/\b\w/g, (c) => c.toUpperCase());

    return name.trim() || currentName || className;
  }

  /**
   * Get all entries (for bulk DB insert)
   */
  getAllEntries(): Array<{ key: string; name: string; description: string | null }> {
    const entries: Array<{ key: string; name: string; description: string | null }> = [];
    for (const [key, name] of this.classNameIndex.entries()) {
      entries.push({
        key,
        name,
        description: this.classNameDescIndex.get(key) || null,
      });
    }
    return entries;
  }
}
