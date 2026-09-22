/**
 * MissionBrokerService — combien paie une mission, et à quelles conditions.
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';

/**
 * Une offre de courtier telle que l'API la sert.
 *
 * `/api/v1/missions` vient de `ContractTemplate` et ne porte aucune récompense :
 * la question « combien ça paie » n'avait pas de réponse. Elle en a une ici pour
 * 1 858 offres sur 1 978.
 *
 * `title_is_template` compte : le jeu compose certains titres à l'exécution —
 * « Secure Bounty: ~mission(TargetName) (VHRT) » — et les afficher tels quels
 * montrerait du code au lecteur.
 */
export interface PublicMissionBroker {
  class_name: string;
  title: string | null;
  title_is_template: boolean;
  description: string | null;
  giver: string | null;
  mission_type: string | null;
  reward_amount: number | null;
  reward_max: number | null;
  reward_currency: string | null;
  difficulty: number | null;
  is_lawful: boolean;
  once_only: boolean;
  is_tutorial: boolean;
  deadline_seconds: number | null;
  available_in_prison: boolean;
  fail_if_became_criminal: boolean;
  min_required_missions: number | null;
}

export interface MissionBrokerFilters {
  env?: string;
  page?: number;
  limit?: number;
  /** `true` ne rend que les missions légales, `false` que les illégales. */
  lawful?: boolean;
  min_reward?: number;
  /** Écarte les titres composés à l'exécution, inaffichables tels quels. */
  readable_only?: boolean;
  search?: string;
}

export class MissionBrokerService {
  constructor(private prisma: PrismaClient) {}

  async list(filters: MissionBrokerFilters = {}): Promise<{ data: PublicMissionBroker[]; total: number; page: number; limit: number }> {
    const env = filters.env ?? 'live';
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const where: Record<string, unknown> = { env };
    if (filters.lawful !== undefined) where.isLawful = filters.lawful;
    if (filters.min_reward !== undefined) where.rewardAmount = { gte: filters.min_reward };
    if (filters.readable_only) {
      where.titleIsTemplate = false;
      where.title = { not: null };
    }
    if (filters.search) where.title = { contains: filters.search, mode: 'insensitive' };

    const total = await this.prisma.missionBroker.count({ where });
    const rows = await this.prisma.missionBroker.findMany({
      where,
      // Le mieux payé d'abord : c'est la question qu'on pose en cherchant une
      // mission. Les non payées ferment la marche plutôt que d'ouvrir à zéro.
      orderBy: [{ rewardAmount: 'desc' }, { className: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows.map((row) => ({
        class_name: row.className,
        title: row.title,
        title_is_template: row.titleIsTemplate,
        description: row.description,
        giver: row.giver,
        mission_type: row.missionType,
        reward_amount: row.rewardAmount,
        reward_max: row.rewardMax,
        reward_currency: row.rewardCurrency,
        difficulty: row.difficulty,
        is_lawful: row.isLawful,
        once_only: row.onceOnly,
        is_tutorial: row.isTutorial,
        deadline_seconds: row.deadlineSeconds,
        available_in_prison: row.availableInPrison,
        fail_if_became_criminal: row.failIfBecameCriminal,
        min_required_missions: row.minRequiredMissions,
      })),
      total,
      page,
      limit,
    };
  }
}
