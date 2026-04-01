/**
 * audit-locations.ts
 * 
 * Analyse les StarMapObject ignorés par classifyByPath() pour détecter des
 * locations manquantes. Groupe les chemins skippés par pattern de dossier.
 */
import { DataForgeService } from '../src/dataforge-service.js';

const p4kPath =
  process.env.P4K_PATH ||
  'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k';

const MAX_SAMPLES = 5;

function classifyByPath(filePath: string): string | null {
  const fp = filePath.replace(/\\/g, '/').toLowerCase();
  if (
    fp.includes('/mission_item/') || fp.includes('/test/') ||
    fp.includes('/template') || fp.includes('template.xml') ||
    fp.endsWith('_template.xml')
  ) return null;
  if (/solarsystem\.xml$/.test(fp)) return 'system';
  if (fp.includes('jumppoint')) return 'jump_point';
  if (
    fp.includes('asteroidcluster') || fp.includes('asteroidring') || fp.includes('asteroidbelt') ||
    fp.includes('glaciemring') || fp.includes('keegebelt') || fp.includes('keegerbelt') ||
    fp.includes('nyx_kaboos')
  ) return 'asteroid_field';
  const celestialMatch = fp.match(/\/system\/[^/]+\/([^/]+)\/(?:starmapobject\.\1|\1)\.xml$/);
  if (celestialMatch) {
    const folder = celestialMatch[1];
    if (folder.includes('star') || folder.includes('sun')) return 'star';
    if (/[a-z]+\d+[a-z]+$/.test(folder)) return 'moon';
    return 'planet';
  }
  if (/\/system\/[^/]+\/[a-z]*(?:star|sun)[^/]*\.xml$/.test(fp)) return 'star';
  // Sub-locations under moon (letter+digit+letter suffix)
  if (/\/system\/[^/]+\/[a-z]+\d+[a-z]+\//.test(fp)) {
    if (fp.includes('/landingzone/')) return 'landing_zone';
    if (fp.includes('/outpost/')) return 'outpost';
    if (fp.includes('/commarray/') || fp.includes('/comm_array/')) return 'comm_array';
    if (fp.includes('/miningclaim/') || fp.includes('/mining_claim/')) return 'mining_claim';
    if (fp.includes('/junksite/') || fp.includes('/junk_site/')) return 'junk_site';
    if (fp.includes('/distributioncentre/') || fp.includes('/distribution_centre/')) return 'warehouse';
    if (fp.includes('/cave/')) return 'cave';
    if (fp.includes('/ruins/')) return 'ruins';
    return null;
  }
  // Sub-locations under planet (letter+digit suffix)
  if (/\/system\/[^/]+\/[a-z]+\d+\//.test(fp)) {
    if (fp.includes('/landingzone/')) return 'landing_zone';
    if (fp.includes('/outpost/')) return 'outpost';
    if (fp.includes('/commarray/') || fp.includes('/comm_array/')) return 'comm_array';
    if (fp.includes('/miningclaim/') || fp.includes('/mining_claim/')) return 'mining_claim';
    if (fp.includes('/junksite/') || fp.includes('/junk_site/')) return 'junk_site';
    if (fp.includes('/distributioncentre/') || fp.includes('/distribution_centre/')) return 'warehouse';
    if (fp.includes('/cave/')) return 'cave';
    if (fp.includes('/ruins/')) return 'ruins';
    return null;
  }
  if (fp.includes('/station/reststop/') || fp.includes('/reststop/')) return 'rest_stop';
  if (fp.includes('/station/motel/') || fp.includes('/motel/')) return 'station';
  if (fp.includes('/station/') || fp.includes('/spacestation/') || fp.includes('/orbital_station/')) return 'station';
  if (fp.includes('/outpost/')) return 'outpost';
  return null;
}

async function main() {
  const svc = new DataForgeService(p4kPath);
  await svc.init();
  process.stdout.write('Loading DataForge...\n');
  await svc.loadDataForge((m) => process.stdout.write(`  ${m}\n`));

  const dfData = svc.getDfData();
  if (!dfData) { console.error('No DfData'); process.exit(1); }

  const smoIdx = dfData.structDefs.findIndex((s: { name: string }) => s.name === 'StarMapObject');
  if (smoIdx === -1) { console.error('No StarMapObject struct'); process.exit(1); }

  const extracted: string[] = [];
  const skipped: string[] = [];
  const skippedTemplate: string[] = [];

  for (const rec of dfData.records) {
    if (rec.structIndex !== smoIdx) continue;
    const fp = rec.fileName.replace(/\\/g, '/').toLowerCase();
    const isTemplate =
      fp.includes('/mission_item/') || fp.includes('/test/') ||
      fp.includes('/template') || fp.includes('template.xml') ||
      fp.endsWith('_template.xml');
    const type = classifyByPath(rec.fileName);
    if (type !== null) {
      extracted.push(rec.fileName);
    } else if (isTemplate) {
      skippedTemplate.push(rec.fileName);
    } else {
      skipped.push(rec.fileName);
    }
  }

  console.log(`\n=== AUDIT LOCATIONS ===`);
  console.log(`Total StarMapObject records : ${extracted.length + skipped.length + skippedTemplate.length}`);
  console.log(`  Extraits                  : ${extracted.length}`);
  console.log(`  Ignorés (templates/test)  : ${skippedTemplate.length}`);
  console.log(`  Ignorés (non classifiés)  : ${skipped.length}`);

  if (skipped.length === 0) {
    console.log('\n✓ Aucun enregistrement non classifié — tout est extrait ou intentionnellement ignoré.');
    return;
  }

  // Grouper les skipped par segment de chemin significatif
  const groups = new Map<string, string[]>();
  for (const fp of skipped) {
    const normalized = fp.replace(/\\/g, '/').toLowerCase();
    // Extraire les 2 derniers segments du chemin comme clé de groupe
    const parts = normalized.split('/').filter(Boolean);
    // Trouver le segment après "starmap/pu" ou similaire comme contexte
    const smoIdx2 = parts.indexOf('starmap');
    const keyParts = smoIdx2 >= 0 ? parts.slice(smoIdx2 + 1) : parts.slice(-4);
    const key = keyParts.slice(0, -1).join('/'); // sans le nom de fichier
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(fp);
  }

  console.log(`\n=== CHEMINS IGNORÉS (${skipped.length} entrées, ${groups.size} groupes) ===\n`);

  // Trier par nombre d'occurrences décroissant
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  for (const [groupKey, paths] of sorted) {
    console.log(`[${paths.length}x] ${groupKey}/`);
    for (const p of paths.slice(0, MAX_SAMPLES)) {
      // Extraire juste le nom de fichier + classe depuis le chemin
      const parts = p.replace(/\\/g, '/').split('/');
      const filename = parts[parts.length - 1];
      console.log(`       └ ${filename}`);
    }
    if (paths.length > MAX_SAMPLES) console.log(`       └ ... (${paths.length - MAX_SAMPLES} autres)`);
    console.log();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
