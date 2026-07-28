import type { Pool } from 'pg';
import type { Logger } from '../logger.js';
import { type ExtractionModule, type GameEnv, MODULE_DELETIONS } from '../module-registry.js';
import type { SelectedModules } from './modules.js';

export interface PlannedDeletion {
  table: string;
  /** Lignes actuellement en base pour cet env — ce que la course effacerait. */
  rows: number;
}

export interface ExtractionPlan {
  env: GameEnv;
  modules: readonly (ExtractionModule | 'all')[];
  deletions: PlannedDeletion[];
  totalRows: number;
}

/**
 * Ce qu'une extraction ferait, sans le faire.
 *
 * La question qui retient avant de lancer une extraction n'est pas « combien de
 * temps » mais « qu'est-ce que je perds si la source est mauvaise ». Une
 * extraction efface avant d'ecrire : si le P4K est incomplet ou si une source
 * distante repond a moitie, la suppression a bien lieu et le remplissage non.
 *
 * Le plan lit `MODULE_DELETIONS`, la meme table que `cleanStaleGameData`
 * execute. Il ne peut donc pas annoncer autre chose que ce qui arrivera.
 *
 * Les comptages sont faits en lecture seule, hors transaction : aucun verrou
 * n'est pris, un plan ne peut pas bloquer une extraction en cours.
 */
export async function buildExtractionPlan(pool: Pool, env: GameEnv, modules: SelectedModules): Promise<ExtractionPlan> {
  const runAll = modules.has('all');
  const willRun = (moduleName: ExtractionModule): boolean => runAll || modules.has(moduleName);

  const deletions: PlannedDeletion[] = [];
  for (const deletion of MODULE_DELETIONS) {
    if (!deletion.modules.some(willRun)) continue;
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::bigint AS n FROM ${deletion.table} WHERE ${deletion.envColumn} = $1`,
      [env],
    );
    deletions.push({ table: deletion.table, rows: Number(rows[0]?.n ?? 0) });
  }

  return {
    env,
    modules: [...modules],
    deletions,
    totalRows: deletions.reduce((sum, deletion) => sum + deletion.rows, 0),
  };
}

export function reportExtractionPlan(plan: ExtractionPlan, logger: Logger): void {
  logger.info(`PLAN [${plan.env.toUpperCase()}] — aucune ecriture, aucun verrou`);

  if (plan.deletions.length === 0) {
    // Les modules reseau (starmap, galactapedia, UEX…) reconcilient plutot
    // qu'ils n'effacent : leur absence ici n'est pas une lacune du plan.
    logger.info('Aucune table effacee : les modules choisis ecrivent sans supprimer.');
    return;
  }

  const width = Math.max(...plan.deletions.map((d) => d.table.length));
  for (const deletion of plan.deletions) {
    logger.info(`  supprime  ${deletion.table.padEnd(width)}  ${String(deletion.rows).padStart(7)} lignes`);
  }
  logger.info(`  total     ${String(plan.totalRows)} lignes effacees puis reecrites`);

  const empty = plan.deletions.filter((deletion) => deletion.rows === 0);
  if (empty.length > 0 && empty.length < plan.deletions.length) {
    logger.warn(`Deja vides : ${empty.map((deletion) => deletion.table).join(', ')}`);
  }
}

export interface VerificationResult {
  plan: ExtractionPlan;
  empty: string[];
  ok: boolean;
}

/**
 * Ce qu'une extraction a laisse derriere elle.
 *
 * Le mode d'echec propre a une extraction n'est pas le plantage — un plantage se
 * voit — mais la course qui supprime puis n'arrive pas a remplir. Elle se
 * termine sans erreur, et la table reste vide.
 *
 * La regle est donc simple : toute table qu'un module reecrit doit etre
 * peuplee. Les vingt-cinq tables declarees le sont aujourd'hui en LIVE, ce qui
 * rend le zero significatif partout.
 *
 * Le controle porte sur l'existence, pas sur la justesse : la justesse est
 * l'affaire de l'audit de verite, qui interroge l'API.
 */
export async function verifyExtraction(pool: Pool, env: GameEnv, modules: SelectedModules): Promise<VerificationResult> {
  const plan = await buildExtractionPlan(pool, env, modules);
  const empty = plan.deletions.filter((deletion) => deletion.rows === 0).map((deletion) => deletion.table);
  return { plan, empty, ok: empty.length === 0 };
}

export function reportVerification(result: VerificationResult, logger: Logger): void {
  const { plan, empty } = result;
  logger.info(`VERIFY [${plan.env.toUpperCase()}] — ${plan.deletions.length} tables, ${plan.totalRows} lignes`);
  const width = plan.deletions.length > 0 ? Math.max(...plan.deletions.map((deletion) => deletion.table.length)) : 0;
  for (const deletion of plan.deletions) {
    const line = `  ${deletion.table.padEnd(width)}  ${String(deletion.rows).padStart(7)} lignes`;
    if (deletion.rows === 0) logger.fail(line);
    else logger.info(line);
  }
  if (empty.length === 0) logger.success('Toutes les tables reecrites sont peuplees.');
  else logger.fail(`${empty.length} table(s) vide(s) : ${empty.join(', ')}`);
}
