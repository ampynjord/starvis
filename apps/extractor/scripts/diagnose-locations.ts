/**
 * Diagnostic script — discover location-related data in DataForge + P4K
 * Usage: npx tsx scripts/diagnose-locations.ts 2>&1
 */
import { DataForgeService } from '../src/dataforge-service.js';

const p4kPath =
  process.env.P4K_PATH ||
  'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k';

const LOCATION_PATTERNS = [
  /starsystem/i,
  /solarsystem/i,
  /stellar/i,
  /planet/i,
  /moon/i,
  /satellite/i,
  /asteroid/i,
  /station/i,
  /landingzone/i,
  /landing_zone/i,
  /outpost/i,
  /settlement/i,
  /bunker/i,
  /cave/i,
  /warehouse/i,
  /distribution/i,
  /wreck/i,
  /graveyard/i,
  /ruin/i,
  /starmap/i,
  /universe/i,
  /location/i,
  /poi/i,
  /jumppoint/i,
  /lagrange/i,
];

async function main() {
  const svc = new DataForgeService(p4kPath);
  await svc.init();
  process.stdout.write('Loading DataForge...\n');
  await svc.loadDataForge((m) => process.stdout.write(`  ${m}\n`));
  process.stdout.write('DataForge loaded.\n\n');

  // 1. Find all struct types matching location patterns
  const allStructTypes = svc.getStructTypes();
  const matchingStructs = allStructTypes.filter((s) => LOCATION_PATTERNS.some((p) => p.test(s)));
  process.stdout.write(`=== Struct types matching location patterns (${matchingStructs.length}) ===\n`);
  // Count records per struct
  for (const st of matchingStructs.sort()) {
    const records = svc.searchByStructType(`^${st}$`, 5);
    process.stdout.write(`  ${st}: ${records.length > 0 ? `${records.length}+ records` : '0 records'}\n`);
    for (const r of records.slice(0, 3)) {
      process.stdout.write(`    ${r.name} | ${r.fileName}\n`);
    }
  }

  // 2. Find relevant P4K files
  process.stdout.write('\n=== P4K files matching location patterns ===\n');
  const filePatterns = [
    /starsystem/i,
    /starmap/i,
    /universe.*\.xml/i,
    /solar.*system/i,
    /planet.*\.xml/i,
    /station.*\.xml/i,
    /outpost.*\.xml/i,
  ];
  for (const fp of filePatterns) {
    const files = await svc.findFiles(fp.source, 10);
    if (files.length > 0) {
      process.stdout.write(`  Pattern /${fp.source}/:\n`);
      for (const f of files.slice(0, 5)) {
        process.stdout.write(`    ${f.fileName} (${(f.uncompressedSize / 1024).toFixed(1)} KB)\n`);
      }
    }
  }

  // 3. Sample a few starsystem-related records
  process.stdout.write('\n=== Sample records with "starsystem" or "planet" in filename ===\n');
  const sysRecords = svc.searchRecords('starsystem|planet|solarsystem|stellar', 50);
  const seen = new Set<string>();
  for (const r of sysRecords) {
    const key = r.structType;
    if (!seen.has(key)) {
      seen.add(key);
      process.stdout.write(`  [${r.structType}] ${r.name} | ${r.fileName}\n`);
    }
  }

  // 4. Search for any "Universe" or location config XMLs in specific directories
  process.stdout.write('\n=== P4K XML files in Data/Libs/Subsumption/Graphs or Universe dirs ===\n');
  const universeFiles = await svc.findFiles('Data/universe|Data/StarMap|Data/Libs/Config/StarSystem', 20);
  for (const f of universeFiles) {
    process.stdout.write(`  ${f.fileName}\n`);
  }

  // 5. Look at what struct type is used for known location names
  process.stdout.write('\n=== Records with known system/planet names ===\n');
  const knownNames = ['stanton', 'pyro', 'crusader', 'microtech', 'hurston', 'arccorp', 'yela', 'cellin'];
  for (const name of knownNames) {
    const recs = svc.searchRecords(name, 5);
    for (const r of recs.slice(0, 2)) {
      process.stdout.write(`  ${name}: [${r.structType}] ${r.name} | ${r.fileName}\n`);
    }
  }

  await svc.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
