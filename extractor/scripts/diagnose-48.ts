/**
 * Diagnostic DataForge 4.8 — liste les structs/records disponibles
 * Usage: npx tsx extractor/scripts/diagnose-48.ts
 */
import { parseDataForge } from '../src/dataforge-parser.js';
import { P4KProvider } from '../src/p4k-provider.js';

const P4K_PATH = 'C:/Program Files/Roberts Space Industries/StarCitizen/PTU/Data.p4k';

const KEYWORDS = [
  // Véhicules
  'vehicle', 'entity', 'ship', 'aircraft', 'spacecraft',
  // Fabricants
  'manufacturer', 'brand', 'maker',
  // Mining
  'mineable', 'mine', 'rock', 'ore', 'composition', 'deposit',
  // Crafting
  'craft', 'blueprint', 'recipe', 'fabricat',
  // Contrats
  'contract', 'mission', 'generator',
  // Items
  'scitem', 'item', 'component',
];

async function main() {
  console.log('Opening P4K...');
  const provider = new P4KProvider(P4K_PATH);
  await provider.open();
  await provider.loadAllEntries();

  const dcbEntry = await provider.getEntry('Data\\Game2.dcb');
  if (!dcbEntry) throw new Error('Game2.dcb not found');
  console.log(`Game2.dcb: ${(dcbEntry.uncompressedSize / 1024 / 1024).toFixed(1)} MB`);

  const buf = await provider.readFileFromEntry(dcbEntry);
  const df = parseDataForge(buf);

  console.log(`\nDataForge header version: ${df.header.version}`);
  console.log(`Struct count: ${df.structDefs.length}`);
  console.log(`Record count: ${df.records.length}`);

  // 1. Tous les structs triés alphabétiquement
  const allStructs = df.structDefs.map((s) => s.name).sort();
  console.log('\n=== ALL STRUCTS (' + allStructs.length + ') ===');
  for (const s of allStructs) console.log(' ', s);

  // 2. Structs par keyword
  console.log('\n=== STRUCTS BY KEYWORD ===');
  for (const kw of KEYWORDS) {
    const matches = allStructs.filter((s) => s.toLowerCase().includes(kw.toLowerCase()));
    if (matches.length > 0) console.log(`\n[${kw}]\n  ${matches.join('\n  ')}`);
  }

  // 3. Comptage des records par struct (top 30)
  const countByStruct = new Map<string, number>();
  for (const r of df.records) {
    const struct = df.structDefs[r.structIndex]?.name ?? 'UNKNOWN';
    countByStruct.set(struct, (countByStruct.get(struct) ?? 0) + 1);
  }
  const sorted = [...countByStruct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  console.log('\n=== TOP 40 STRUCTS BY RECORD COUNT ===');
  for (const [name, count] of sorted) console.log(`  ${count.toString().padStart(6)} × ${name}`);

  // 4. Records dont le fichier contient "vehicles" ou "ships"
  const vehicleRecords = df.records.filter(
    (r) => r.fileName?.toLowerCase().includes('vehicle') || r.fileName?.toLowerCase().includes('/ships/'),
  );
  const vehicleStructNames = [...new Set(vehicleRecords.map((r) => df.structDefs[r.structIndex]?.name))];
  console.log('\n=== STRUCTS USED IN vehicle/ships PATHS ===');
  for (const s of vehicleStructNames.sort()) console.log(' ', s);

  // 5. Recherche de patterns de noms de records (ex: AEGS_Avenger_*)
  const sampleVehicles = df.records
    .filter((r) => {
      const name = r.name ?? '';
      return /^[A-Z]{2,5}_[A-Z][a-z]/.test(name);
    })
    .slice(0, 20);
  console.log('\n=== SAMPLE RECORDS MATCHING VEHICLE NAME PATTERN ===');
  for (const r of sampleVehicles) {
    console.log(`  [${df.structDefs[r.structIndex]?.name}] ${r.name} @ ${r.fileName}`);
  }

  await provider.close();
}

main().catch(console.error);
