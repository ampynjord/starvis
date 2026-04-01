/**
 * Diagnose StarMapObject file paths to understand classification
 */
import { DataForgeService } from '../src/dataforge-service.js';

const P4K = 'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k';

const df = new DataForgeService(P4K);
await df.init();
await df.loadDataForge();
const data = df.getDfData()!;

const smoIdx = data.structDefs.findIndex((s) => s.name === 'StarMapObject');

// Collect all paths under /system/
const systemPaths: string[] = [];
const otherPaths: string[] = [];

for (const r of data.records) {
  if (r.structIndex !== smoIdx) continue;
  const fp = (r.fileName ?? '').replace(/\\/g, '/').toLowerCase();
  if (fp.includes('/system/')) {
    systemPaths.push(fp);
  } else {
    otherPaths.push(fp);
  }
}

console.log(`Total StarMapObjects: ${systemPaths.length + otherPaths.length}`);
console.log(`Under /system/: ${systemPaths.length}`);
console.log(`Other: ${otherPaths.length}`);

// For system paths, compute depth relative to /system/SYSNAME/
// depth 0 = directly in system folder (e.g. /system/stanton/stanton1.xml)
// depth 1 = one level under (e.g. /system/stanton/stanton1/landingzone/xxx.xml → depth 1)
console.log('\n=== Paths at depth 0-1 under /system/SYSNAME/ (likely planets/moons) ===');
for (const fp of systemPaths) {
  const m = fp.match(/\/system\/[a-z]+\/(.+)/);
  if (!m) continue;
  const rest = m[1]; // everything after /system/SYSNAME/
  const depth = (rest.match(/\//g) ?? []).length;
  if (depth === 0) {
    console.log('DEPTH0:', fp);
  } else if (depth === 1) {
    console.log('DEPTH1:', fp);
  }
}

console.log('\n=== All "starmapobject." named files ===');
for (const fp of [...systemPaths, ...otherPaths]) {
  if (fp.includes('starmapobject.')) console.log(fp);
}

console.log('\n=== Non-system paths (first 20) ===');
for (const fp of otherPaths.slice(0, 20)) console.log(fp);
