/**
 * MissionExtractor — ContractTemplate records from DataForge
 *
 * Extracts mission/contract definitions:
 *   - Mission type derived from class_name
 *   - Shareable / solo flags
 *   - Legal status (criminal missions)
 *   - Completion time limit
 *   - Title / description from LOC keys
 */
import type { DataForgeService } from './dataforge-service.js';
import logger from './logger.js';

export interface MissionRecord {
  uuid: string;
  className: string;
  title: string | null;
  description: string | null;
  missionType: string;
  canBeShared: boolean;
  onlyOwnerComplete: boolean;
  isLegal: boolean;
  completionTimeSecs: number | null;
  notForRelease: boolean;
  workInProgress: boolean;
}

const TYPE_PATTERNS: [RegExp, string][] = [
  [/bounty|headhunt|assassin/i, 'Bounty'],
  [/eliminat|assault|combat|attack|ambush|intercept|uwf|ugf|lawful|unlawful.*target/i, 'Combat'],
  [/deliver|package|courier|cargo(?!_drone)|smuggl/i, 'Delivery'],
  [/escort/i, 'Escort'],
  [/infiltrat|hack|sabotage|plant_bomb/i, 'Infiltration'],
  [/salvage/i, 'Salvage'],
  [/mining/i, 'Mining'],
  [/investigat|scan|probe|recon|survey|gather_intel/i, 'Investigation'],
  [/patrol/i, 'Patrol'],
  [/race/i, 'Race'],
  [/spy|espionage/i, 'Espionage'],
  [/recover|retriev|rescue/i, 'Recovery'],
  [/siege/i, 'Siege'],
  [/trade|buy|sell|purchase/i, 'Trade'],
  [/construct|build|repair/i, 'Construction'],
];

function deriveMissionType(className: string): string {
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(className)) return type;
  }
  return 'Misc';
}

function isLocEmpty(s: string | null | undefined): boolean {
  if (!s) return true;
  if (s.startsWith('@LOC_UNINIT') || s === '@LOC_EMPTY' || s === '@LOC_') return true;
  // Also catch the resolved placeholder string from global.ini
  const t = s.trim();
  return t.includes('UNINITIALIZED') || t === '<= UNINITIALIZED =>' || t.startsWith('<= UNINITIALIZED');
}

export function extractMissions(ctx: DataForgeService, locService?: { resolveKey(key: string): string | null }): MissionRecord[] {
  const records = ctx.searchByStructType('^ContractTemplate$', 99999);
  if (!records.length) {
    logger.warn('ContractTemplate: no records found in DataForge');
    return [];
  }

  const results: MissionRecord[] = [];

  for (const r of records) {
    try {
      const data = ctx.readRecordByGuid(r.uuid, 4) as Record<string, unknown>;
      if (!data) continue;

      const className = r.name.replace(/^ContractTemplate\./, '');
      const notForRelease = !!(data.notForRelease as boolean);
      const workInProgress = !!(data.workInProgress as boolean);

      const cc = (data.contractClass as Record<string, unknown>) ?? {};
      const params = (cc.additionalParams as Record<string, unknown>) ?? {};
      const autoFinish = (cc.autoFinishSettings as Record<string, unknown>) ?? {};

      const canBeShared = !!(params.canBeShared as boolean);
      const onlyOwnerComplete = !!(params.onlyOwnerCanComplete as boolean);
      // Missions that fail when you become criminal = legal missions
      const isLegal = (autoFinish.failIfBecameCriminal as boolean) !== false;

      const deadline = (autoFinish.contractDeadline as Record<string, unknown>) ?? {};
      const completionTimeSecs =
        typeof deadline.missionCompletionTime === 'number' && (deadline.missionCompletionTime as number) > 0
          ? (deadline.missionCompletionTime as number)
          : null;

      // Resolve title / description
      const displayInfo = (data.contractDisplayInfo as Record<string, unknown>) ?? {};
      const displayStrings: string[] = Array.isArray(displayInfo.displayString) ? (displayInfo.displayString as string[]) : [];

      const rawTitle = displayStrings[0] ?? null;
      const rawDesc = displayStrings[2] ?? null;

      const resolveStr = (raw: string | null) => {
        if (!raw) return null;
        if (locService && raw.startsWith('@')) return locService.resolveKey(raw);
        return raw;
      };

      const resTitle = resolveStr(rawTitle);
      const resDesc = resolveStr(rawDesc);

      const title = isLocEmpty(resTitle)
        ? className
            .replace(/_/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .trim()
        : resTitle;

      const description = isLocEmpty(resDesc) ? null : resDesc;

      results.push({
        uuid: r.uuid,
        className,
        title,
        description,
        missionType: deriveMissionType(className),
        canBeShared,
        onlyOwnerComplete,
        isLegal,
        completionTimeSecs,
        notForRelease,
        workInProgress,
      });
    } catch (e) {
      logger.debug(`Mission extract error [${r.name}]: ${(e as Error).message}`);
    }
  }

  logger.info(`Extracted ${results.length} mission templates from ${records.length} ContractTemplate records`);
  return results;
}
