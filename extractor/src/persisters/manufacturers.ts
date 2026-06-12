/**
 * MANUFACTURERS → manufacturers table
 */
import logger from '../logger.js';
import type { PersistContext } from './context.js';

export async function saveManufacturersFromData(ctx: PersistContext): Promise<number> {
  const { conn, df, loc } = ctx;
  // Source: Manufacturer records extracted directly from the DataForge (SCItemManufacturer struct).
  const manufacturers = df.extractAllManufacturers();

  if (manufacturers.size === 0) {
    logger.warn('No manufacturer records found in DataForge — manufacturer table may be incomplete', { module: 'extraction' });
  }

  let saved = 0;
  for (const mfg of manufacturers.values()) {
    // Resolve loc key (e.g. "@manufacturer_NameAEGS") → human-readable name via global.ini
    let name = mfg.code;
    if (mfg.locKey && loc.isLoaded) {
      const resolved = loc.resolveKey(mfg.locKey);
      // Reject CIG placeholder strings (e.g. "<= PLACEHOLDER =>")
      if (resolved && !resolved.startsWith('<=')) name = resolved;
    }
    try {
      await conn.query(
        `INSERT INTO game.manufacturers (code, name) VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
        [mfg.code, name],
      );
      saved++;
    } catch (e: unknown) {
      logger.error(`Manufacturer ${mfg.code}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return saved;
}
