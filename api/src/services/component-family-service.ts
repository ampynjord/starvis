/**
 * ComponentFamilyService — les statistiques d'un composant, sans celles des autres.
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';

/**
 * Les familles de composants, et la vue qui porte chacune.
 *
 * `game.components` portait 124 colonnes dont 19 renseignées : un bouclier
 * traînait cent cinq champs vides, et un consommateur devait savoir lesquels
 * regarder selon le type. Chaque famille a désormais sa vue — 18 à 38 colonnes,
 * toutes pertinentes.
 *
 * Six types n'y figurent pas — MissileRack, TractorBeam, LifeSupport,
 * JumpModule, MiningModifier — parce que la donnée ne leur donne aucune
 * statistique propre. Les inventer serait pire que de les laisser au socle.
 */
export const COMPONENT_FAMILIES = {
  weapons: 'componentWeapons',
  shields: 'componentShields',
  'quantum-drives': 'componentQuantumDrives',
  missiles: 'componentMissiles',
  thrusters: 'componentThrusters',
  radars: 'componentRadars',
  countermeasures: 'componentCountermeasures',
  'fuel-tanks': 'componentFuelTanks',
  'fuel-intakes': 'componentFuelIntakes',
  emps: 'componentEmps',
  interdictions: 'componentInterdictions',
  'mining-lasers': 'componentMiningLasers',
  'salvage-heads': 'componentSalvageHeads',
  coolers: 'componentCoolers',
  'power-plants': 'componentPowerPlants',
  gimbals: 'componentGimbals',
  turrets: 'componentTurrets',
} as const;

export type ComponentFamily = keyof typeof COMPONENT_FAMILIES;

export const isComponentFamily = (value: string): value is ComponentFamily => value in COMPONENT_FAMILIES;

export interface FamilySummary {
  family: ComponentFamily;
  count: number;
}

export interface FamilyPage {
  family: ComponentFamily;
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/**
 * Prisma rend du `camelCase`, l'API sert du `snake_case` depuis toujours.
 *
 * La conversion a lieu ici, à la sortie, plutôt que d'être imposée au schéma :
 * renommer les champs Prisma alignerait le modèle sur une convention de
 * transport, ce qui est l'inverse du sens de la dépendance.
 */
function toSnakeCase(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
  }
  return out;
}

/** Les délégués Prisma sont indexés dynamiquement : le schéma est la source. */
type DelegateLike = {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
};

export class ComponentFamilyService {
  constructor(private prisma: PrismaClient) {}

  private delegate(family: ComponentFamily): DelegateLike {
    return (this.prisma as unknown as Record<string, DelegateLike>)[COMPONENT_FAMILIES[family]];
  }

  async families(env = 'live'): Promise<FamilySummary[]> {
    const names = Object.keys(COMPONENT_FAMILIES) as ComponentFamily[];
    const counts: FamilySummary[] = [];
    // Séquentiel : ces comptages partagent un client, et les lancer ensemble
    // n'accélère rien tout en déclenchant l'avertissement de `pg`.
    for (const family of names) {
      counts.push({ family, count: await this.delegate(family).count({ where: { env } }) });
    }
    return counts.filter((entry) => entry.count > 0).sort((a, b) => b.count - a.count);
  }

  async list(family: ComponentFamily, env = 'live', page = 1, limit = 50): Promise<FamilyPage> {
    const delegate = this.delegate(family);
    const where = { env };
    const total = await delegate.count({ where });
    const data = await delegate.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });
    return { family, data: data.map(toSnakeCase), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
  }
}
