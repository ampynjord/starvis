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
import logger from './logger.js';
import type { P4KProvider } from './p4k-provider.js';

/** Parsed localization entry */
interface LocEntry {
  key: string;
  value: string;
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

  private loaded = false;

  get isLoaded(): boolean {
    return this.loaded;
  }
  get entryCount(): number {
    return this.nameIndex.size;
  }

  /**
   * Load and parse global.ini from P4K provider.
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

    if (!buffer) {
      logger.warn('global.ini not found in P4K — localization will use fallback names', { module: 'localization' });
      this.loaded = true; // Mark as loaded but empty — fallback mode
      return 0;
    }

    return this.parseGlobalIni(buffer, onProgress);
  }

  /**
   * Parse global.ini buffer content.
   * Format: key=value lines, BOM-prefixed UTF-16LE or UTF-8
   */
  private parseGlobalIni(buffer: Buffer, onProgress?: (msg: string) => void): number {
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
          this.nameIndex.set(key, value);
          this.classNameIndex.set(className.toLowerCase(), value);
          parsed++;
        }
      }
      // Item descriptions: item_Desc{className}=Description
      else if (keyLower.startsWith('item_desc')) {
        const className = key.substring('item_Desc'.length);
        if (className) {
          this.descIndex.set(key, value);
          this.classNameDescIndex.set(className.toLowerCase(), value);
        }
      }
      // Vehicle names: vehicle_Name_{className}=Display Name
      else if (keyLower.startsWith('vehicle_name_')) {
        const className = key.substring('vehicle_Name_'.length);
        if (className) {
          this.nameIndex.set(key, value);
          this.classNameIndex.set(className.toLowerCase(), value);
          parsed++;
        }
      }
      // Generic LOC keys (catch-all for other patterns)
      else {
        this.nameIndex.set(key, value);
      }
    }

    this.loaded = true;
    logger.info(`Localization loaded: ${parsed} name entries, ${this.descIndex.size} descriptions`, { module: 'localization' });
    onProgress?.(`Localization: ${parsed} names, ${this.descIndex.size} descriptions`);
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
  resolveComponentName(className: string): string | null {
    if (!className) return null;
    const cn = className.toLowerCase();

    // Direct match
    const direct = this.classNameIndex.get(cn);
    if (direct) return direct;

    // Try without manufacturer prefix (e.g., BEHR_LaserRepeater_S2 → LaserRepeater_S2)
    const withoutMfg = className.replace(/^[A-Z]{3,5}_/, '');
    if (withoutMfg !== className) {
      const mfgStripped = this.classNameIndex.get(withoutMfg.toLowerCase());
      if (mfgStripped) return mfgStripped;
    }

    // Try variants with/without SCItem suffix
    const withSCItem = this.classNameIndex.get(cn.endsWith('_scitem') ? cn : cn + '_scitem');
    if (withSCItem) return withSCItem;

    const withoutSCItem = cn.endsWith('_scitem') ? this.classNameIndex.get(cn.replace(/_scitem$/, '')) : null;
    if (withoutSCItem) return withoutSCItem;

    return null;
  }

  /**
   * Resolve a display name for a ship className.
   */
  resolveShipName(className: string): string | null {
    if (!className) return null;
    const cn = className.toLowerCase();

    // Direct match
    const direct = this.classNameIndex.get(cn);
    if (direct) return direct;

    // Try vehicle_Name_ prefix pattern
    const vehicleKey = `vehicle_Name_${className}`;
    const veh = this.nameIndex.get(vehicleKey);
    if (veh) return veh;

    return null;
  }

  /**
   * Resolve a description for a given className.
   */
  resolveDescription(className: string): string | null {
    if (!className) return null;
    return this.classNameDescIndex.get(className.toLowerCase()) || null;
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
