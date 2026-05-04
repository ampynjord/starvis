/**
 * Patch note script: compare ships between LIVE (4.7) and PTU (4.8)
 * Extracts vehicle stats from both DataForges and compares them.
 */

import { DataForgeService } from '../src/dataforge-service.js';

const LIVE_P4K = 'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k';
const PTU_P4K = 'C:/Program Files/Roberts Space Industries/StarCitizen/PTU/Data.p4k';

function pct(a: number, b: number): string {
  if (a === 0) return '+∞%';
  const p = ((b - a) / a) * 100;
  const s = p > 0 ? '+' : '';
  return `${s}${p.toFixed(1)}%`;
}

function diff(label: string, a: number | undefined, b: number | undefined, unit = ''): string | null {
  if (a === undefined && b === undefined) return null;
  if (a === undefined) return `  - ${label}: (new) ${b}${unit}`;
  if (b === undefined) return `  - ${label}: ${a}${unit} → (removed)`;
  if (Math.abs(a - b) < 0.001) return null;
  const change = Math.abs((b - a) / a) * 100;
  if (change < 1) return null; // ignore < 1% changes
  return `  - ${label}: ${a}${unit} → ${b}${unit} (${pct(a, b)})`;
}

async function loadAllVehicles(p4kPath: string): Promise<Map<string, any>> {
  console.error(`Loading ${p4kPath}...`);
  const svc = new DataForgeService(p4kPath);
  await svc.init();
  await svc.loadDataForge((m) => process.stderr.write(`\r${m}                    `));
  console.error('');
  console.error(`Version: ${svc.getVersion()}`);

  const vehicles = new Map<string, any>();
  const defs = svc.getVehicleDefinitions();
  console.error(`Vehicle index: ${defs.size} entries`);

  let count = 0;
  for (const [key, v] of defs) {
    count++;
    if (count % 50 === 0) process.stderr.write(`\rReading vehicle ${count}/${defs.size}...`);
    try {
      const stats = await svc.extractVehicleStats(v.className);
      vehicles.set(v.className, {
        className: v.className,
        uuid: v.uuid,
        stats: stats || {},
      });
    } catch (e) {
      // skip
    }
  }
  console.error(`\nLoaded ${vehicles.size} vehicles.`);
  await svc.close();
  return vehicles;
}

async function main() {
  const [liveVehicles, ptuVehicles] = await Promise.all([loadAllVehicles(LIVE_P4K), loadAllVehicles(PTU_P4K)]);

  const allKeys = new Set([...liveVehicles.keys(), ...ptuVehicles.keys()]);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ name: string; diffs: string[] }> = [];
  const unchanged: string[] = [];

  for (const key of allKeys) {
    const live = liveVehicles.get(key);
    const ptu = ptuVehicles.get(key);

    if (!live) {
      added.push(key);
      continue;
    }
    if (!ptu) {
      removed.push(key);
      continue;
    }

    const ls = live.stats;
    const ps = ptu.stats;

    const diffs: string[] = [];
    const checks: Array<[string, string, string]> = [
      ['scm_speed', 'SCM Speed', ' m/s'],
      ['afterburner_speed', 'AB Speed', ' m/s'],
      ['max_speed', 'Max Speed', ' m/s'],
      ['hull_hp', 'Hull HP', ''],
      ['actual_mass', 'Mass', ' kg'],
      ['length', 'Length', ' m'],
      ['beam', 'Beam', ' m'],
      ['height', 'Height', ' m'],
      ['crew_size', 'Crew', ''],
      ['pitch_max', 'Pitch Max', ' °/s'],
      ['yaw_max', 'Yaw Max', ' °/s'],
      ['roll_max', 'Roll Max', ' °/s'],
    ];

    for (const [field, label, unit] of checks) {
      const d = diff(label, ls[field], ps[field], unit);
      if (d) diffs.push(d);
    }

    if (diffs.length > 0) {
      changed.push({ name: key, diffs });
    } else {
      unchanged.push(key);
    }
  }

  // Output JSON result
  const result = {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort((a, b) => a.name.localeCompare(b.name)),
    unchanged: unchanged.length,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
