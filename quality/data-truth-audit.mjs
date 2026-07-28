#!/usr/bin/env node
/**
 * Audit de vérité des données.
 *
 * L'audit voisin (`api-data-audit.mjs`) vérifie que les endpoints répondent et
 * que leur premier élément a la bonne forme. Celui-ci porte sur le fond : la
 * population entière est-elle complète, cohérente, et d'accord avec les sources
 * dont elle est tirée ?
 *
 * Les seuils sont dérivés d'une mesure réelle (27/07/2026, patch 4.9.0) et posés
 * légèrement sous l'état constaté : ils attrapent une régression sans échouer
 * sur l'existant. Les relever au fil des corrections est le but.
 *
 * Usage :
 *   node quality/data-truth-audit.mjs
 *   node quality/data-truth-audit.mjs --base-url https://starvis.ampynjord.bzh
 */

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const baseUrl = argValue('--base-url', process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const env = argValue('--env', 'live');
const apiKey = process.env.STARVIS_AUDIT_API_KEY ?? process.env.SERVER_API_KEY ?? '';

const failures = [];
const facts = [];
const fail = (m, ctx) => failures.push({ m, ctx });
const fact = (m) => facts.push(m);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * L'audit émet une cinquantaine de requêtes contre la production. Sans reprise,
 * une seule coupure réseau passagère suffit à faire échouer le job entier — et un
 * audit qui rougit pour une raison qui n'est pas la qualité des données est un
 * audit qu'on finit par ignorer. Les 5xx sont retentés au même titre : ils
 * traduisent l'état du serveur à l'instant t, pas celui de la donnée.
 */
async function get(path, params = {}, attempts = 3) {
  const url = new URL(`${baseUrl}/api/v1${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { headers: apiKey ? { 'X-API-Key': apiKey } : {} });
      if (res.ok) return res.json();
      // Un 4xx est définitif : réessayer une route absente ou une clé refusée ne
      // ferait que retarder le diagnostic.
      if (res.status < 500) throw new Error(`HTTP ${res.status} on ${path}`);
      lastError = new Error(`HTTP ${res.status} on ${path}`);
    } catch (error) {
      if (/^HTTP 4/.test(error.message)) throw error;
      lastError = error;
    }
    if (attempt < attempts) await sleep(attempt * 1000);
  }
  throw lastError;
}

/** Parcourt toutes les pages, jusqu'à une borne de sécurité. */
async function getAll(path, params = {}, maxPages = 40) {
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    const body = await get(path, { ...params, page, limit: 200 });
    const chunk = body.data ?? [];
    rows.push(...chunk);
    const pages = body.pages ?? body.meta?.pages ?? 1;
    if (page >= pages || chunk.length === 0) break;
  }
  return rows;
}

/**
 * Une valeur est-elle réellement renseignée ?
 *
 * Zéro est une réponse valable pour une soute — un chasseur n'emporte rien —
 * mais pas pour une vitesse ou des points de structure, où il ne peut que
 * traduire une extraction muette. Les deux cas partagent cette fonction pour
 * qu'un champ ne soit jamais compté « présent » ici et « aberrant » ailleurs.
 */
const isPresent = (value, zeroIsMissing) => value != null && value !== '' && !(zeroIsMissing && Number(value) === 0);

/** Part des lignes où le champ est renseigné. Échoue sous le plancher. */
function requireCoverage(entity, rows, field, floor, { zeroIsMissing = false } = {}) {
  if (!rows.length) return fail(`${entity} : population vide, couverture invérifiable`);
  const filled = rows.filter((r) => isPresent(r[field], zeroIsMissing)).length;
  const pct = filled / rows.length;
  fact(`${entity}.${field} : ${filled}/${rows.length} (${(pct * 100).toFixed(1)}%)`);
  if (pct < floor) {
    fail(`${entity}.${field} : couverture ${(pct * 100).toFixed(1)}% sous le plancher ${(floor * 100).toFixed(0)}%`);
  }
}

/**
 * Un libellé destiné à l'affichage ne doit pas ressembler à un identifiant.
 *
 * L'underscore est le signe évident, mais pas le seul : « ATLS GEO Collector
 * Grad01 » n'en contient aucun et reste un nom d'atelier. On traque donc aussi
 * les suffixes de fabrication numérotés.
 *
 * `Mk2` et consorts sont volontairement absents de la liste : « Hornet F7CM Mk2
 * Heartseeker » est le nom commercial du vaisseau, pas une fuite d'identifiant.
 */
const TECHNICAL_NAME = /_|\b(?:grad|var|variant|tier|lvl|proto|test|dummy|placeholder)\s*\d+\b/i;

function requireHumanNames(entity, rows, tolerated = 0) {
  const technical = rows.filter((r) => typeof r.name === 'string' && TECHNICAL_NAME.test(r.name));
  fact(`${entity} : ${technical.length}/${rows.length} libellé(s) à consonance technique`);
  if (technical.length > tolerated) {
    fail(
      `${entity} : ${technical.length} libellé(s) techniques (toléré : ${tolerated})`,
      technical.slice(0, 5).map((r) => r.name),
    );
  }
}

/**
 * Le libellé est-il localisé, ou fabriqué à partir de l'identifiant ?
 *
 * C'est le contrôle qui compte le plus, et le moins visible. Quand la
 * localisation manque, l'extraction retombe sur le `class_name` dé-souligné et
 * capitalisé : `cbd_hat_03_01_cfp_var2` devient « CBD HAT 03 01 CFP Var2 ». Le
 * résultat n'a plus d'underscore, franchit donc `requireHumanNames` sans encombre,
 * et arrive tel quel dans l'IHM.
 *
 * Comparer les deux chaînes réduites à leurs seuls alphanumériques démasque le
 * procédé — c'est ainsi qu'on découvre que les 135 marchandises n'ont aucun
 * libellé propre.
 */
const reduce = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function requireLocalizedNames(entity, rows, ceiling) {
  const derived = rows.filter((r) => r.class_name && r.name && reduce(r.class_name) === reduce(r.name));
  const pct = derived.length / (rows.length || 1);
  fact(`${entity} : ${derived.length}/${rows.length} libellé(s) dérivé(s) du class_name (${(pct * 100).toFixed(1)}%)`);
  if (pct > ceiling) {
    fail(
      `${entity} : ${(pct * 100).toFixed(1)}% de libellés dérivés, au-dessus du plafond ${(ceiling * 100).toFixed(0)}%`,
      derived.slice(0, 5).map((r) => `${r.class_name} → ${r.name}`),
    );
  }
}

/** Bornes de vraisemblance : une valeur hors plage signale une unité ou un parsing erroné. */
function requirePlausible(entity, rows, field, { min, max, zeroIsMissing = false }) {
  // L'absence relève de la complétude, pas de la vraisemblance : sans ce filtre
  // `Number(null)` vaut 0 et chaque champ vide serait compté comme aberrant.
  const values = rows
    .filter((r) => isPresent(r[field], zeroIsMissing))
    .map((r) => Number(r[field]))
    .filter((v) => Number.isFinite(v));
  if (!values.length) return;
  const outliers = values.filter((v) => v < min || v > max);
  fact(`${entity}.${field} : ${values.length} valeur(s), ${outliers.length} hors [${min}, ${max}]`);
  if (outliers.length) {
    fail(`${entity}.${field} : ${outliers.length} valeur(s) invraisemblable(s)`, outliers.slice(0, 5));
  }
}

/**
 * La statistique sans laquelle un composant ne se choisit pas.
 *
 * Un refroidisseur sans taux de refroidissement, une centrale sans puissance :
 * la fiche affiche un nom, un type, une taille, et rien de ce qui permet de
 * décider. C'est une donnée manquante qu'aucun contrôle de complétude
 * générique ne voyait, parce que la colonne existe pour tous les composants et
 * n'a de sens que pour une famille.
 *
 * Relevé du 28/07 : douze familles sur quatorze sont à 99–100 %, et deux à zéro.
 * Le plancher est donc posé haut, avec deux exceptions nommées et datées plutôt
 * qu'un seuil bas qui les couvrirait en silence.
 */
const DEFINING_STAT = [
  { type: 'Shield', field: 'shield_hp', floor: 0.95 },
  { type: 'QuantumDrive', field: 'qd_speed', floor: 0.95 },
  { type: 'Thruster', field: 'thruster_max_thrust', floor: 0.95 },
  { type: 'Radar', field: 'radar_range', floor: 0.95 },
  { type: 'FuelTank', field: 'fuel_capacity', floor: 0.95 },
  { type: 'FuelIntake', field: 'fuel_intake_rate', floor: 0.95 },
  { type: 'Countermeasure', field: 'cm_ammo_count', floor: 0.95 },
  { type: 'MiningLaser', field: 'mining_speed', floor: 0.95 },
  // 65 % : les armes à faisceau portent `weapon_beam_dps` et non `weapon_dps`.
  // Le plancher tient compte de cette famille, il ne la masque pas.
  { type: 'WeaponGun', field: 'weapon_dps', floor: 0.6 },
  // Ces deux-là sont à zéro. Le plancher ne bloque rien, mais le décompte
  // paraît à chaque exécution — c'est ce qui manquait pour qu'on le sache.
  { type: 'Cooler', field: 'cooling_rate', floor: 0 },
  { type: 'PowerPlant', field: 'power_output', floor: 0 },
];

/**
 * En dessous de ce seuil, la famille est trop petite pour qu'un pourcentage
 * veuille dire quelque chose.
 *
 * Les prises de carburant visibles ne sont que cinq, dont trois portent leur
 * débit. Un plancher à 95 % y échouerait pour un seul manquant, ce qui ferait
 * rougir la CI sans rien apprendre. Le décompte reste affiché — c'est le
 * jugement qui est suspendu, pas la mesure.
 */
const MIN_FAMILY_FOR_FLOOR = 10;

function requireDefiningStats(components) {
  for (const { type, field, floor } of DEFINING_STAT) {
    const family = components.filter((c) => c.type === type);
    if (!family.length) continue;
    const applied = family.length >= MIN_FAMILY_FOR_FLOOR ? floor : 0;
    requireCoverage(`components ${type}`, family, field, applied, { zeroIsMissing: true });
  }
}

/**
 * Vaisseaux — deux populations, deux exigences.
 *
 * Un vaisseau « concept » n'existe qu'au Ship Matrix RSI : annoncé, vendu,
 * jamais construit. Il n'a par nature aucune donnée de vol, et lui réclamer une
 * vitesse SCM reviendrait à mesurer le nombre de concepts plutôt que la qualité
 * de l'extraction. Les seuils de vol ne portent donc que sur les pilotables.
 *
 * Sept pilotables échappent malgré tout à la règle : la famille ARGO ATLS, un
 * exosquelette de manutention classé `vehicle_category: 'ship'` alors qu'il ne
 * vole pas. C'est un défaut de classification à corriger à la source (étape 2) ;
 * en attendant, le plancher est posé juste sous leur poids.
 */
async function auditEntities() {
  const ships = await getAll('/ships', { env });
  const flyable = ships.filter((s) => s.is_concept_only !== true);
  const concepts = ships.filter((s) => s.is_concept_only === true);
  fact(`ships : ${flyable.length} pilotable(s), ${concepts.length} concept(s) sans donnée de vol`);

  requireCoverage('ships', ships, 'name', 1);
  requireCoverage('ships', ships, 'manufacturer_name', 1);
  // Trois ATLS tolérés (« …Grad01 »), le temps que l'étape 2 les renomme.
  requireHumanNames('ships', ships, 3);
  // Chez les concepts, le `class_name` EST le slug RSI du nom : « Crucible » et
  // `crucible` coïncident sans qu'aucune localisation manque. Seuls les
  // pilotables sont donc soumis au contrôle, et à tolérance nulle.
  requireLocalizedNames('ships pilotables', flyable, 0);

  requireCoverage('ships pilotables', flyable, 'career', 0.95);
  requireCoverage('ships pilotables', flyable, 'scm_speed', 0.95, { zeroIsMissing: true });
  requireCoverage('ships pilotables', flyable, 'total_hp', 0.95, { zeroIsMissing: true });
  // Un vaisseau plus lent que 10 m/s ou plus rapide que 5 000 relève de l'erreur
  // de parsing, pas du réglage de jeu.
  requirePlausible('ships pilotables', flyable, 'scm_speed', { min: 10, max: 5000, zeroIsMissing: true });
  requirePlausible('ships', ships, 'cargo_capacity', { min: 0, max: 200000 });

  const components = await getAll('/components', { env });
  requireCoverage('components', components, 'name', 1);
  requireCoverage('components', components, 'type', 1);
  requireHumanNames('components', components);
  // 3,6 % avant que les clés de localisation cessent d'être jetées, 1,9 % après
  // sur la population visible. Le reste tient à des prototypes et des montures
  // de minage que le jeu ne nomme pas. Le plafond garde un peu de marge : trop
  // près du constat, il céderait au premier composant ajouté.
  requireLocalizedNames('components', components, 0.03);
  requirePlausible('components', components, 'size', { min: 0, max: 12 });
  requireDefiningStats(components);

  const items = await getAll('/items', { env });
  requireCoverage('items', items, 'name', 1);
  requireCoverage('items', items, 'type', 1);
  // Un libellé toléré : « CBD HAT 03 01 CFP Var2 », que l'étape 2 doit reprendre.
  requireHumanNames('items', items, 1);
  // 9,9 % avant que les clés de localisation cessent d'être jetées, 0,5 % après.
  // Le plafond descend avec le défaut : c'est ce qui empêche une régression de
  // repasser inaperçue. Un seuil qui ne bouge jamais est un seuil que plus
  // personne ne lit.
  requireLocalizedNames('items', items, 0.01);

  // Les missions n'étaient pas couvertes, et c'est ce qui a laissé sept de leurs
  // colonnes vides passer inaperçues — `location_system`, `location_planet`,
  // `location_name`, `required_reputation`, `reputation_reward`, `base_xp` et
  // `blueprint_reward_uuid` sont nulles pour les 473 missions. Elles existent au
  // schéma, sortent dans le contrat, et l'extraction ne les remplit pas.
  //
  // Les planchers sont posés sur l'existant : ils gardent ce qui marche et
  // rendent visible, à chaque exécution, ce qui ne marche pas.
  const missions = await getAll('/missions', { env });
  requireCoverage('missions', missions, 'title', 1);
  requireCoverage('missions', missions, 'mission_type', 1);
  requireHumanNames('missions', missions);
  // 3 % aujourd'hui — 15 missions sur 473. Le plancher constate plutôt qu'il
  // n'exige : le relever suppose de combler l'extraction, pas de resserrer le
  // seuil.
  requireCoverage('missions', missions, 'description', 0.02);
  // Ces trois-là sont à zéro. Un plancher nul ne bloque rien, mais le décompte
  // paraît à chaque exécution — c'est ce qui manquait pour qu'on le sache.
  requireCoverage('missions', missions, 'location_name', 0);
  requireCoverage('missions', missions, 'base_xp', 0);
  requireCoverage('missions', missions, 'reputation_reward', 0);

  // Les éléments miniers ne sont pas paginés : la route rend les 42 d'un coup.
  //
  // Un pourcentage au-dessus de cent n'est pas un pourcentage. Ce contrôle
  // trivial aurait épargné un défaut bien réel : `probability` est stockée en
  // fraction et se multiplie par cent, `min_percentage` et `max_percentage` sont
  // déjà des pourcentages — les trois passaient par la même multiplication, et
  // l'Agricium sortait annoncé à 2502 %.
  const mining = (await get('/mining/elements', { env })).data ?? [];
  if (mining.length) {
    requireCoverage('mining elements', mining, 'name', 1);
    requirePlausible('mining elements', mining, 'avg_probability_pct', { min: 0, max: 100 });
    requirePlausible('mining elements', mining, 'avg_min_pct', { min: 0, max: 100 });
    requirePlausible('mining elements', mining, 'avg_max_pct', { min: 0, max: 100 });
  }

  const commodities = await getAll('/commodities', { env });
  requireCoverage('commodities', commodities, 'name', 1);
  requireHumanNames('commodities', commodities);
  // 100 % avant correction, 76 % après — et ce reste n'est plus un défaut : le
  // libellé résolu coïncide simplement avec l'identifiant, « Agricium » restant
  // « Agricium ». La mesure ne sait pas distinguer les deux cas ; sa limite est
  // écrite ici plutôt que masquée par un chiffre flatteur.
  //
  // Ce que le contrôle garde de vivant à ce niveau, c'est l'alerte si la part
  // remontait vers 100 % — signe que la résolution aurait cessé d'opérer.
  requireLocalizedNames('commodities', commodities, 0.8);

  return { flyable };
}

/**
 * Résolution des loadouts, par nature de port.
 *
 * Les ports `Other` portent le mobilier d'habitacle (sièges, écrans, volants) :
 * ils n'ont pas de composant équipable et leur non-résolution est normale. Les
 * ports d'équipement, eux, doivent se rattacher — un bouclier non résolu est une
 * donnée manquante, pas une particularité du jeu.
 */
const EQUIPMENT_PORTS = new Set([
  'WeaponGun',
  'Turret',
  'Shield',
  'Cooler',
  'PowerPlant',
  'QuantumDrive',
  'Thruster',
  'MissileRack',
  'Radar',
  'Scanner',
  'FlightController',
  'Countermeasure',
  'Gimbal',
]);

const LOADOUT_SAMPLE_SIZE = 30;

async function auditLoadouts(ships) {
  // Échantillon régulier plutôt que les 30 premiers : la liste arrive triée par
  // nom, et prendre la tête ne verrait que les constructeurs du début d'alphabet.
  // Le pas reste déterministe, donc deux exécutions comparent bien la même chose.
  const stride = Math.max(1, Math.floor(ships.length / LOADOUT_SAMPLE_SIZE));
  const sample = ships.filter((_, i) => i % stride === 0).slice(0, LOADOUT_SAMPLE_SIZE);

  let equipment = 0;
  let equipmentResolved = 0;
  let structural = 0;
  let unreachable = 0;

  for (const ship of sample) {
    const body = await get(`/ships/${encodeURIComponent(ship.uuid)}/loadout`, { env }).catch(() => null);
    if (body === null) {
      unreachable++;
      continue;
    }
    for (const node of body?.data ?? []) {
      if (!EQUIPMENT_PORTS.has(node.port_type)) {
        structural++;
        continue;
      }
      equipment++;
      if (node.component_uuid) equipmentResolved++;
    }
  }

  // Une erreur ponctuelle sur un vaisseau ne doit pas passer pour un échantillon
  // propre : sans ce compte, un endpoint qui répond 500 la moitié du temps
  // produirait un taux de résolution flatteur calculé sur ce qui a survécu.
  if (unreachable) fail(`loadouts : ${unreachable}/${sample.length} vaisseau(x) dont le loadout n'a pas répondu`);
  if (!equipment) return fail('loadouts : aucun port d’équipement dans l’échantillon');
  const rate = equipmentResolved / equipment;
  fact(
    `loadouts : ${equipmentResolved}/${equipment} port(s) d'équipement résolu(s) (${(rate * 100).toFixed(1)}%) sur ${sample.length} vaisseaux`,
  );
  fact(`loadouts : ${structural} port(s) structurel(s) ignoré(s) — mobilier d'habitacle, sans composant équipable`);
  // 83 % tant que les commandes de cockpit, écrans et sièges étaient comptés
  // comme de l'équipement ; 93 % une fois `classifyPort` corrigé. Le plancher
  // suit, avec la marge nécessaire à l'échantillonnage.
  if (rate < 0.85) fail(`loadouts : résolution ${(rate * 100).toFixed(1)}% sous le plancher 85%`);
}

/**
 * Confrontation P4K ↔ Ship Matrix RSI.
 *
 * Les deux sources décrivent les mêmes vaisseaux ; une absence de rattachement
 * signale une dérive du croisement, pas une donnée fausse en soi. On mesure la
 * couverture du lien, pas l'égalité des valeurs : RSI et le jeu divergent
 * légitimement sur les statistiques.
 *
 * Le taux ne porte que sur les pilotables : un concept vient du Ship Matrix et y
 * est rattaché par construction, l'inclure gonflerait la mesure de ce qu'elle
 * est censée éprouver.
 */
function auditCrossSource(flyable) {
  const linked = flyable.filter((s) => s.ship_matrix_id != null).length;
  const rate = linked / flyable.length;
  fact(`croisement Ship Matrix : ${linked}/${flyable.length} pilotable(s) rattaché(s) (${(rate * 100).toFixed(1)}%)`);
  if (rate < 0.75) fail(`croisement Ship Matrix : ${(rate * 100).toFixed(1)}% sous le plancher 75%`);
}

/**
 * Les libellés de boutiques sont fabriqués en titre-casant le nom de fichier
 * entier, segments techniques compris : « Ship Weapon HDShowcase Lorville »,
 * « Trauma Center Day06 ». Le contrôle porte sur les jetons qu'aucun nom
 * commercial ne contient — un numéro de journée de développement, un nombre nu,
 * un code constructeur à quatre lettres.
 *
 * Le seuil n'est pas zéro : le défaut est connu, mesuré, et sa correction
 * demande la table des franchises du P4K. Le plancher empêche qu'il s'aggrave
 * en attendant.
 */
async function auditShopLabels() {
  const shops = await getAll('/shops', { env }).catch(() => []);
  if (shops.length === 0) {
    fact('boutiques : aucune servie, contrôle des libellés ignoré');
    return;
  }

  const TECHNICAL_TOKEN =
    /\b(?:day\s*\d+|\d{1,2}|hdshowcase|reststop|truckstop|expohall|shipweap|aegs|anvl|drak|krig|cnou|tmbl|argo|banu|espr|orig|misc|aopoa|xnaa|umbr|rsi)\b/i;
  const suspicious = shops.filter((shop) => TECHNICAL_TOKEN.test(String(shop.name ?? '')));
  const ratio = suspicious.length / shops.length;

  fact(`boutiques : ${suspicious.length}/${shops.length} libellé(s) portant un jeton technique (${(ratio * 100).toFixed(1)}%)`);
  if (ratio > 0.2) {
    fail(`boutiques : ${(ratio * 100).toFixed(1)}% de libellés techniques au-dessus du plafond 20%`, {
      exemples: suspicious.slice(0, 5).map((shop) => shop.name),
    });
  }
}

async function main() {
  console.log(`Audit de vérité — ${baseUrl} (env ${env})\n`);
  const { flyable } = await auditEntities();
  await auditLoadouts(flyable);
  auditCrossSource(flyable);
  await auditShopLabels();

  for (const f of facts) console.log(`  ${f}`);
  console.log(`\nConstats : ${facts.length}`);
  console.log(`Échecs   : ${failures.length}`);
  for (const { m, ctx } of failures) {
    console.error(`  ÉCHEC ${m}`);
    if (ctx) console.error(`         ${JSON.stringify(ctx)}`);
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`Audit interrompu : ${error.message}`);
  process.exit(1);
});
