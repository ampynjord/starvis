/**
 * patchnote-48.ts — Patch note complet 4.7 → 4.8
 * Compare ships, components, FPS weapons/armor directly from DataForge P4K files.
 * Usage: npx tsx extractor/scripts/patchnote-48.ts
 */
import { extractAllComponents } from '../src/component-extractor.js';
import { DataForgeService } from '../src/dataforge-service.js';

const LIVE = 'C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k';
const PTU = 'C:/Program Files/Roberts Space Industries/StarCitizen/PTU/Data.p4k';

// ─── Utils ────────────────────────────────────────────────────────────────────

function pct(a: number, b: number): string {
  if (!a || !b) return '';
  const d = ((b - a) / a) * 100;
  const sign = d >= 0 ? '+' : '';
  return ` (${sign}${d.toFixed(1)}%)`;
}

function diff(label: string, a: number | undefined, b: number | undefined, unit = ''): string | null {
  if (a == null && b == null) return null;
  if (a == null) return `  - ${label}: — → **${b}${unit}** (new)`;
  if (b == null) return `  - ${label}: ~~${a}${unit}~~ → removed`;
  if (Math.abs(a - b) < 0.001) return null;
  const p = pct(a, b);
  return `  - ${label}: ${a}${unit} → **${b}${unit}**${p}`;
}

function load(svc: DataForgeService, label: string) {
  return svc
    .loadDataForge((m) => process.stdout.write(`\r  [${label}] ${m}                    `))
    .then(() => {
      console.log();
    });
}

// ─── Ships ────────────────────────────────────────────────────────────────────

async function compareShips(live: DataForgeService, ptu: DataForgeService): Promise<string> {
  const liveVehicles = live.getVehicleDefinitions();
  const ptuVehicles = ptu.getVehicleDefinitions();

  const lines: string[] = ['## Vaisseaux & Véhicules\n'];

  // New ships
  const newShips = [...ptuVehicles.values()].filter((v) => !liveVehicles.has(v.className.toLowerCase()));
  if (newShips.length) {
    lines.push(`### Nouveaux vaisseaux/véhicules (${newShips.length})`);
    for (const s of newShips.sort((a, b) => a.className.localeCompare(b.className))) {
      lines.push(`- **${s.className}**`);
    }
    lines.push('');
  }

  // Removed ships
  const removedShips = [...liveVehicles.values()].filter((v) => !ptuVehicles.has(v.className.toLowerCase()));
  if (removedShips.length) {
    lines.push(`### Vaisseaux supprimés (${removedShips.length})`);
    for (const s of removedShips.sort((a, b) => a.className.localeCompare(b.className))) {
      lines.push(`- ~~${s.className}~~`);
    }
    lines.push('');
  }

  // Stat changes on common ships
  const common = [...liveVehicles.values()].filter((v) => ptuVehicles.has(v.className.toLowerCase()));
  lines.push(`### Changements de stats (${common.length} vaisseaux communs analysés)`);
  const statChanges: string[] = [];

  for (const v of common) {
    const lStats = await live.extractVehicleStats(v.className);
    const pStats = await ptu.extractVehicleStats(v.className);
    if (!lStats || !pStats) continue;

    const diffs: string[] = [];
    const keys: [string, string, string][] = [
      ['hull_hp', 'Hull HP', ''],
      ['scm_speed', 'SCM', ' m/s'],
      ['afterburner_speed', 'Afterburner', ' m/s'],
      ['max_speed', 'Max Speed', ' m/s'],
      ['actual_mass', 'Masse', ' kg'],
      ['crew_size', 'Équipage', ''],
      ['length', 'Longueur', ' m'],
      ['beam', 'Largeur', ' m'],
      ['height', 'Hauteur', ' m'],
      ['pitch_max', 'Pitch max', ' °/s'],
      ['yaw_max', 'Yaw max', ' °/s'],
      ['roll_max', 'Roll max', ' °/s'],
    ];
    for (const [key, label, unit] of keys) {
      const d = diff(label, lStats[key], pStats[key], unit);
      if (d) diffs.push(d);
    }

    if (diffs.length) {
      statChanges.push(`\n**${v.className}**`);
      statChanges.push(...diffs);
    }
  }

  if (statChanges.length) {
    lines.push(...statChanges);
  } else {
    lines.push('_Aucun changement de stats détecté sur les vaisseaux communs._');
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Ship Components ──────────────────────────────────────────────────────────

async function compareComponents(live: DataForgeService, ptu: DataForgeService): Promise<string> {
  console.log('  Extracting components LIVE...');
  const liveComps = extractAllComponents(live);
  console.log(`  LIVE: ${liveComps.length} components`);
  console.log('  Extracting components PTU...');
  const ptuComps = extractAllComponents(ptu);
  console.log(`  PTU: ${ptuComps.length} components`);

  const liveByClass = new Map(liveComps.map((c) => [c.className as string, c]));
  const ptuByClass = new Map(ptuComps.map((c) => [c.className as string, c]));

  const lines: string[] = ['## Composants de vaisseau\n'];

  const types = [
    'Shield',
    'PowerPlant',
    'Cooler',
    'QuantumDrive',
    'WeaponGun',
    'Missile',
    'Radar',
    'MiningLaser',
    'TractorBeam',
    'SalvageHead',
  ];
  const typeLabels: Record<string, string> = {
    Shield: 'Boucliers',
    PowerPlant: 'Générateurs',
    Cooler: 'Refroidisseurs',
    QuantumDrive: 'Quantum Drives',
    WeaponGun: 'Armes montées',
    Missile: 'Missiles',
    Radar: 'Radars',
    MiningLaser: 'Lasers de minage',
    TractorBeam: 'Tracteur beams',
    SalvageHead: 'Têtes de salvage',
  };

  const compStatKeys: Record<string, [string, string, string][]> = {
    Shield: [
      ['shieldHp', 'HP Bouclier', ''],
      ['shieldRegen', 'Regen/s', ''],
      ['shieldRegenDelay', 'Délai regen', 's'],
      ['shieldHardening', 'Hardening', ''],
      ['powerDraw', 'Conso', ''],
    ],
    PowerPlant: [
      ['powerOutput', 'Puissance', ''],
      ['powerDraw', 'Conso idle', ''],
      ['heatGeneration', 'Chaleur', ''],
    ],
    Cooler: [
      ['coolingRate', 'Refroid. rate', ''],
      ['powerDraw', 'Conso', ''],
    ],
    QuantumDrive: [
      ['qdSpeed', 'Vitesse QD', 'm/s'],
      ['qdSpoolTime', 'Spool', 's'],
      ['qdCooldown', 'Cooldown', 's'],
      ['qdFuelRate', 'Conso carburant', ''],
      ['qdRange', 'Portée', ''],
    ],
    WeaponGun: [
      ['weaponDamage', 'DPS/shot', ''],
      ['weaponFireRate', 'Cadence', 'rpm'],
      ['weaponSpeed', 'Vitesse proj.', 'm/s'],
      ['weaponRange', 'Portée', 'm'],
      ['powerDraw', 'Conso', ''],
    ],
    Missile: [
      ['weaponDamage', 'Dommages', ''],
      ['weaponSpeed', 'Vitesse', 'm/s'],
      ['weaponRange', 'Portée', 'm'],
    ],
    Radar: [
      ['powerDraw', 'Conso', ''],
      ['hp', 'HP', ''],
    ],
    MiningLaser: [
      ['weaponDamage', 'Puissance', ''],
      ['weaponRange', 'Portée', 'm'],
      ['powerDraw', 'Conso', ''],
    ],
    TractorBeam: [
      ['weaponRange', 'Portée', 'm'],
      ['powerDraw', 'Conso', ''],
    ],
    SalvageHead: [
      ['hp', 'HP', ''],
      ['powerDraw', 'Conso', ''],
    ],
  };

  for (const type of types) {
    const liveT = liveComps.filter((c) => c.type === type);
    const ptuT = ptuComps.filter((c) => c.type === type);
    const liveSet = new Set(liveT.map((c) => c.className));
    const ptuSet = new Set(ptuT.map((c) => c.className));

    const added = ptuT.filter((c) => !liveSet.has(c.className));
    const removed = liveT.filter((c) => !ptuSet.has(c.className));
    const common = ptuT.filter((c) => liveSet.has(c.className));

    const statChanges: { name: string; diffs: string[] }[] = [];
    const keys = compStatKeys[type] ?? [];
    for (const pc of common) {
      const lc = liveByClass.get(pc.className)!;
      const diffs: string[] = [];
      for (const [key, label, unit] of keys) {
        const d = diff(label, lc[key], pc[key], unit);
        if (d) diffs.push(d);
      }
      if (diffs.length) statChanges.push({ name: pc.className, diffs });
    }

    if (!added.length && !removed.length && !statChanges.length) continue;

    lines.push(`### ${typeLabels[type] ?? type}\n`);

    if (added.length) {
      lines.push(`**Nouveaux (${added.length})**`);
      for (const c of added.sort((a, b) => (a.size ?? 0) - (b.size ?? 0) || a.className.localeCompare(b.className))) {
        const mfg = c.manufacturer ? `[${c.manufacturerCode}] ` : '';
        const sz = c.size != null ? ` S${c.size}` : '';
        const gr = c.grade != null ? ` Gr.${c.grade}` : '';
        lines.push(`- **${mfg}${c.name ?? c.className}**${sz}${gr}`);
      }
      lines.push('');
    }

    if (removed.length) {
      lines.push(`**Supprimés (${removed.length})**`);
      for (const c of removed) lines.push(`- ~~${c.name ?? c.className}~~`);
      lines.push('');
    }

    if (statChanges.length) {
      lines.push(`**Stats modifiées (${statChanges.length})**`);
      for (const sc of statChanges) {
        lines.push(`\n_${sc.name}_`);
        lines.push(...sc.diffs);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── FPS Items (weapons + armor) ─────────────────────────────────────────────

function extractFpsItems(svc: DataForgeService, type: 'weapon' | 'armor') {
  const df = svc.getDfData()!;
  const entityIdx = df.structDefs.findIndex((s) => s.name === 'EntityClassDefinition');
  if (entityIdx === -1) return [];

  const items: any[] = [];
  const weaponPathRx = /scitem\/(?:fps|personal).*(?:weapon|gun|rifle|pistol|smg|shotgun|lmg|crossbow)/i;
  const armorPathRx = /scitem\/(?:fps|personal).*(?:armor|armour|helmet|torso|legs|arms|undersuit|backpack|flightsuit)/i;

  for (const r of df.records) {
    if (r.structIndex !== entityIdx) continue;
    const fn = (r.fileName ?? '').toLowerCase();
    if (!fn.includes('scitem')) continue;
    const isWeapon = weaponPathRx.test(fn);
    const isArmor = armorPathRx.test(fn);
    if (type === 'weapon' && !isWeapon) continue;
    if (type === 'armor' && !isArmor) continue;

    const cn = (r.name ?? '').replace('EntityClassDefinition.', '');
    if (!cn || cn.toLowerCase().includes('_test') || cn.toLowerCase().includes('_template')) continue;

    try {
      const data = svc.readInstance(r.structIndex, r.instanceIndex, 0, 4);
      if (!data || !Array.isArray(data.Components)) continue;

      const item: any = { className: cn, uuid: r.id };
      for (const c of data.Components) {
        if (!c?.__type) continue;
        if (c.__type === 'SAttachableComponentParams') {
          const ad = c.AttachDef;
          if (ad) {
            if (typeof ad.Size === 'number') item.size = ad.Size;
            const loc = ad.Localization;
            if (loc?.Name && !String(loc.Name).startsWith('@') && !String(loc.Name).startsWith('LOC_')) {
              item.name = loc.Name;
            }
          }
        }
        if (c.__type === 'SHealthComponentParams' && typeof c.Health === 'number') item.hp = Math.round(c.Health);
        if (c.__type === 'SCItemWeaponComponentParams') {
          const fa = Array.isArray(c.fireActions) ? c.fireActions[0] : null;
          if (fa) {
            if (typeof fa.fireRate === 'number') item.fireRate = Math.round(fa.fireRate);
          }
        }
        if (c.__type === 'SAmmoContainerComponentParams') {
          if (typeof c.maxAmmoCount === 'number') item.ammoCount = c.maxAmmoCount;
          const ammoRef = c.ammoParamsRecord?.__ref;
          if (ammoRef) {
            try {
              const ammo = svc.readRecordByGuid(ammoRef, 4) as any;
              if (ammo) {
                if (typeof ammo.speed === 'number') item.projSpeed = Math.round(ammo.speed);
                const pp = ammo.projectileParams;
                if (pp?.damage) {
                  const d = pp.damage;
                  const total = (d.DamagePhysical ?? 0) + (d.DamageEnergy ?? 0) + (d.DamageBiochemical ?? 0) + (d.DamageStun ?? 0);
                  if (total > 0) item.damagePerBullet = Math.round(total * 100) / 100;
                }
              }
            } catch {
              /**/
            }
          }
        }
        if (c.__type === 'SArmor') {
          if (typeof c.DamageResistances?.DamagePhysical === 'number') item.physResist = c.DamageResistances.DamagePhysical;
          if (typeof c.DamageResistances?.DamageEnergy === 'number') item.energyResist = c.DamageResistances.DamageEnergy;
        }
      }
      items.push(item);
    } catch {
      /**/
    }
  }
  return items;
}

function compareFpsSection(liveItems: any[], ptuItems: any[], label: string, statKeys: [string, string, string][]): string {
  const liveByClass = new Map(liveItems.map((i) => [i.className, i]));
  const ptuByClass = new Map(ptuItems.map((i) => [i.className, i]));

  const added = ptuItems.filter((i) => !liveByClass.has(i.className));
  const removed = liveItems.filter((i) => !ptuByClass.has(i.className));
  const common = ptuItems.filter((i) => liveByClass.has(i.className));

  const statChanges: { name: string; diffs: string[] }[] = [];
  for (const pi of common) {
    const li = liveByClass.get(pi.className)!;
    const diffs: string[] = [];
    for (const [key, lbl, unit] of statKeys) {
      const d = diff(lbl, li[key], pi[key], unit);
      if (d) diffs.push(d);
    }
    if (diffs.length) statChanges.push({ name: pi.name ?? pi.className, diffs });
  }

  const lines: string[] = [`## ${label}\n`];
  if (added.length) {
    lines.push(`### Nouveaux (${added.length})`);
    for (const i of added.sort((a, b) => a.className.localeCompare(b.className))) lines.push(`- **${i.name ?? i.className}**`);
    lines.push('');
  }
  if (removed.length) {
    lines.push(`### Supprimés (${removed.length})`);
    for (const i of removed) lines.push(`- ~~${i.name ?? i.className}~~`);
    lines.push('');
  }
  if (statChanges.length) {
    lines.push(`### Stats modifiées (${statChanges.length})`);
    for (const sc of statChanges) {
      lines.push(`\n**${sc.name}**`);
      lines.push(...sc.diffs);
    }
    lines.push('');
  }
  if (!added.length && !removed.length && !statChanges.length) {
    lines.push('_Aucun changement détecté._\n');
  }
  return lines.join('\n');
}

// ─── New record types ─────────────────────────────────────────────────────────

function compareNewStructs(live: DataForgeService, ptu: DataForgeService): string {
  const liveSt = new Set(live.getDfData()!.structDefs.map((s) => s.name));
  const ptuSt = new Set(ptu.getDfData()!.structDefs.map((s) => s.name));
  const newSt = [...ptuSt].filter((s) => !liveSt.has(s));
  const delSt = [...liveSt].filter((s) => !ptuSt.has(s));

  const lines = ['## Nouveaux systèmes DataForge (structs)\n'];
  lines.push(`${newSt.length} nouveaux types de données en 4.8 :`);

  // Group by prefix
  const groups = new Map<string, string[]>();
  for (const s of newSt) {
    const prefix = s.replace(/([A-Z][a-z]+).*/, '$1');
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(s);
  }
  for (const [prefix, names] of [...groups.entries()].sort()) {
    lines.push(`\n**${prefix}** (${names.length})`);
    for (const n of names) lines.push(`- \`${n}\``);
  }
  if (delSt.length) {
    lines.push(`\n${delSt.length} types supprimés :`);
    for (const s of delSt) lines.push(`- ~~\`${s}\`~~`);
  }
  return lines.join('\n') + '\n';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading LIVE 4.7...');
  const liveSvc = new DataForgeService(LIVE);
  await liveSvc.init();
  await load(liveSvc, 'LIVE');

  console.log('Loading PTU 4.8...');
  const ptuSvc = new DataForgeService(PTU);
  await ptuSvc.init();
  await load(ptuSvc, 'PTU');

  const sections: string[] = [];

  sections.push(`# Patch Note Star Citizen 4.7 → 4.8\n_Généré automatiquement depuis les fichiers DataForge (Game2.dcb)_\n`);

  // 1. Ships
  console.log('\nComparing ships...');
  sections.push(await compareShips(liveSvc, ptuSvc));

  // 2. Components
  console.log('\nComparing ship components...');
  sections.push(await compareComponents(liveSvc, ptuSvc));

  // 3. FPS Weapons
  console.log('\nExtracting FPS weapons...');
  const liveFpsWeap = extractFpsItems(liveSvc, 'weapon');
  const ptuFpsWeap = extractFpsItems(ptuSvc, 'weapon');
  console.log(`  LIVE: ${liveFpsWeap.length}, PTU: ${ptuFpsWeap.length}`);
  sections.push(
    compareFpsSection(liveFpsWeap, ptuFpsWeap, 'Armes FPS', [
      ['damagePerBullet', 'Dégâts/balle', ''],
      ['fireRate', 'Cadence', 'rpm'],
      ['ammoCount', 'Munitions', ''],
      ['projSpeed', 'Vitesse proj.', 'm/s'],
      ['hp', 'Durabilité', ''],
    ]),
  );

  // 4. FPS Armor
  console.log('\nExtracting FPS armor...');
  const liveFpsArmor = extractFpsItems(liveSvc, 'armor');
  const ptuFpsArmor = extractFpsItems(ptuSvc, 'armor');
  console.log(`  LIVE: ${liveFpsArmor.length}, PTU: ${ptuFpsArmor.length}`);
  sections.push(
    compareFpsSection(liveFpsArmor, ptuFpsArmor, 'Armures & Équipements FPS', [
      ['hp', 'HP', ''],
      ['physResist', 'Résist. physique', ''],
      ['energyResist', 'Résist. énergie', ''],
    ]),
  );

  // 5. Crafting summary
  sections.push(`## Crafting

### Résumé
- **4.7 LIVE** : 1 083 blueprints (1 044 CraftingProcess_Creation + 39 legacy)
- **4.8 PTU** : 1 058 blueprints en DB (1 477 CraftingProcess_Creation dans DataForge, ~420 sont des templates vides)
- **5 nouvelles catégories** : VehicleComponentS0→S4, MissionItem

### Nouveaux blueprints en 4.8
- **329 composants véhicule** : Coolers (×75), Power Plants (×75), Shields (×62), Radars (×60), Quantum Drives (×57)
- **43 armes véhicule** : Tractor Beams (WEP ×9), Cannons (ESPR/MXOX/BANU/KBAR/GATS), Laser Gatling (TOAG)
- **22 outils** : Mining Lasers (×17), Salvage Scrapers (×5)
- **~43 FPS** : Flightsuits VGL/MRAI, sacs à dos QRT/CLD, armure KAP, arbalète UTFL, MR01 variants
- **2 Mission Items** : Microsatellite, Collector Material

### Blueprints FPSArmours supprimés en 4.8 (templates vidés)
5 marques entièrement retirées du crafting : **KAP, OMC, THP, CCC, FTA**
Marques fortement réduites : QRT (−108), CDS (−100), Outlaw (−72), RRS (−26), GRIN (−19)

### Nouveau type de modificateur
**LinearIntegerAdditive** (nouveau en 4.8) : modificateurs entiers additifs (ex: \`+5 → +10\`) pour les composants véhicule, vs multiplicatif (ex: \`×0.85 → ×1.15\`) pour les armures FPS.

### Changements de recettes
6 blueprints de sacs à dos : passage de 2 ingrédients → 1 ingrédient.
`);

  // 6. New DataForge structs
  console.log('\nComparing DataForge structs...');
  sections.push(compareNewStructs(liveSvc, ptuSvc));

  await liveSvc.close();
  await ptuSvc.close();

  const patchNote = sections.join('\n---\n\n');
  console.log('\n\n' + '='.repeat(80));
  console.log(patchNote);
  console.log('='.repeat(80));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
