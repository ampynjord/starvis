/**
 * Diagnostic 2 — deep read SSolarSystem + MissionLocationTemplate + nyx_system.xml
 */
import { DataForgeService } from '../src/dataforge-service.js';

const p4kPath =
  process.env.P4K_PATH ||
  'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k';

async function main() {
  const svc = new DataForgeService(p4kPath);
  await svc.init();
  process.stdout.write('Loading DataForge...\n');
  await svc.loadDataForge((m) => process.stdout.write(`  ${m}\n`));

  // 1. Read all SSolarSystem records
  process.stdout.write('\n=== SSolarSystem records ===\n');
  const sysSamples = svc.searchByStructType('^SSolarSystem$', 10);
  for (const r of sysSamples) {
    process.stdout.write(`\n[${r.name}] fileName: ${r.fileName}\n`);
    const data = svc.readRecordByGuid(r.uuid, 3);
    if (data) process.stdout.write(JSON.stringify(data, null, 2).slice(0, 3000) + '\n');
  }

  // 2. Read MissionLocationTemplate samples
  process.stdout.write('\n\n=== MissionLocationTemplate samples ===\n');
  const locTemplates = svc.searchByStructType('^MissionLocationTemplate$', 300);
  process.stdout.write(`Total MissionLocationTemplate records: ${locTemplates.length}\n`);
  // Show all record names
  for (const r of locTemplates) {
    process.stdout.write(`  ${r.name} | ${r.fileName}\n`);
  }

  // 3. Deep read a few MissionLocationTemplate
  process.stdout.write('\n=== Deep read first 3 MissionLocationTemplate ===\n');
  for (const r of locTemplates.slice(0, 3)) {
    process.stdout.write(`\n[${r.name}]\n`);
    const data = svc.readRecordByGuid(r.uuid, 3);
    if (data) process.stdout.write(JSON.stringify(data, null, 2).slice(0, 2000) + '\n');
  }

  // 4. Read nyx_system.xml (first 5KB)
  process.stdout.write('\n\n=== nyx_system.xml (first 5KB) ===\n');
  const buf = await svc.readFile('Data\\Prefabs\\persistent_universe\\nyx_system.xml');
  if (buf) {
    process.stdout.write(buf.toString('utf8').slice(0, 5000) + '\n');
  } else {
    process.stdout.write('Not found\n');
  }

  // 5. StarMapObject records
  process.stdout.write('\n\n=== StarMapObject records (all) ===\n');
  const smObjects = svc.searchByStructType('^StarMapObject$', 500);
  process.stdout.write(`Total: ${smObjects.length}\n`);
  for (const r of smObjects) {
    process.stdout.write(`  ${r.name} | ${r.fileName}\n`);
  }

  // 6. Deep read a few StarMapObjects
  process.stdout.write('\n=== Deep read first 3 StarMapObjects ===\n');
  for (const r of smObjects.slice(0, 3)) {
    process.stdout.write(`\n[${r.name}]\n`);
    const data = svc.readRecordByGuid(r.uuid, 3);
    if (data) process.stdout.write(JSON.stringify(data, null, 2).slice(0, 2000) + '\n');
  }

  // 7. InstancedInteriorLocationParams
  process.stdout.write('\n\n=== InstancedInteriorLocationParams ===\n');
  const interiorLocs = svc.searchByStructType('^InstancedInteriorLocationParams$', 100);
  process.stdout.write(`Total: ${interiorLocs.length}\n`);
  for (const r of interiorLocs) {
    process.stdout.write(`  ${r.name}\n`);
    const data = svc.readRecordByGuid(r.uuid, 2);
    if (data) process.stdout.write('  ' + JSON.stringify(data).slice(0, 500) + '\n');
  }

  await svc.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
