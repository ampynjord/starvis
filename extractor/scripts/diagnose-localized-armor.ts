import mysql from 'mysql2/promise';
import { P4KProvider } from '../src/p4k-provider.js';
import { LocalizationService } from '../src/localization-service.js';

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'starvis_user',
    password: process.env.DB_PASSWORD || 'starvis_dev_pass',
    database: process.env.DB_GAME_DB || 'live',
  });

  const [rows] = await pool.query(
    "SELECT class_name, name, type FROM items WHERE type IN ('Armor_Arms','Armor_Torso','Armor_Helmet','Armor_Legs','Undersuit')",
  );

  const p4kPath = process.env.P4K_PATH || 'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k';
  const p4k = new P4KProvider(p4kPath);
  await p4k.open();

  const loc = new LocalizationService();
  await loc.loadFromP4K(p4k);

  let total = 0;
  let resolved = 0;
  let changed = 0;
  let morozovResolved = 0;
  const sampleChanges: Array<{ class_name: string; current: string; localized: string }> = [];

  for (const row of rows as Array<{ class_name: string; name: string; type: string }>) {
    total += 1;
    const localized = loc.resolveComponentName(row.class_name);
    if (!localized) continue;

    resolved += 1;
    if (localized.toLowerCase().includes('morozov')) morozovResolved += 1;
    if (localized !== row.name) {
      changed += 1;
      if (sampleChanges.length < 50) {
        sampleChanges.push({ class_name: row.class_name, current: row.name, localized });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        p4kPath,
        totalArmorRows: total,
        resolvedByLocalization: resolved,
        changedFromCurrentName: changed,
        morozovLocalizedRows: morozovResolved,
        sampleChanges,
      },
      null,
      2,
    ),
  );

  await p4k.close();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
