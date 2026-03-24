import type { PrismaClient } from '@prisma/client';

export interface MiningYieldInput {
  compositionUuid: string;
  env?: string;
  laserUuid?: string;
  gadgetUuids?: string[];
}

export interface MiningElementYield {
  elementName: string;
  elementUuid: string;
  probability: number;
  baseYield: number;
  optimizedYield: number;
  optimalWindow: number;
  windowStart: number;
  windowEnd: number;
}

export interface MiningRiskAggregates {
  maxInstability: number;
  avgInstability: number;
  maxResistance: number;
  avgResistance: number;
}

export interface MiningLaserInfo {
  uuid: string;
  name: string;
  size: number | null;
  grade: string | null;
  manufacturerCode: string | null;
  miningSpeed: number;
  miningRange: number;
  miningResistance: number;
  miningInstability: number;
}

export interface MiningYieldResult {
  compositionName: string;
  elements: MiningElementYield[];
  risk: MiningRiskAggregates | null;
  laser: MiningLaserInfo | null;
  gadgets: MiningLaserInfo[];
}

async function fetchMiningComponent(prisma: PrismaClient, uuid: string, env: string): Promise<MiningLaserInfo | null> {
  const comp = await prisma.component.findUnique({
    where: { uuid_gameEnv: { uuid, gameEnv: env } },
    select: {
      uuid: true,
      name: true,
      size: true,
      grade: true,
      miningSpeed: true,
      miningRange: true,
      miningResistance: true,
      miningInstability: true,
      manufacturer: { select: { code: true } },
    },
  });
  if (!comp || comp.miningSpeed == null) return null;
  return {
    uuid: comp.uuid,
    name: comp.name ?? 'Unknown',
    size: comp.size,
    grade: comp.grade,
    manufacturerCode: comp.manufacturer?.code ?? null,
    miningSpeed: Number(comp.miningSpeed),
    miningRange: Number(comp.miningRange ?? 0),
    miningResistance: Number(comp.miningResistance ?? 0),
    miningInstability: Number(comp.miningInstability ?? 0),
  };
}

export async function calculateMiningYield(prisma: PrismaClient, input: MiningYieldInput): Promise<MiningYieldResult | null> {
  const env = input.env || 'live';

  const composition = await prisma.miningComposition.findUnique({
    where: { uuid_gameEnv: { uuid: input.compositionUuid, gameEnv: env } },
  });
  if (!composition) return null;

  const parts = await prisma.miningCompositionPart.findMany({
    where: { compositionUuid: input.compositionUuid, gameEnv: env },
    include: { element: true },
  });

  // Fetch laser and gadgets in parallel if provided
  let laser: MiningLaserInfo | null = null;
  const gadgets: MiningLaserInfo[] = [];

  const laserPromise = input.laserUuid ? fetchMiningComponent(prisma, input.laserUuid, env) : Promise.resolve(null);
  const gadgetPromises = (input.gadgetUuids ?? []).map((uuid) => fetchMiningComponent(prisma, uuid, env));

  const [laserResult, ...gadgetResults] = await Promise.all([laserPromise, ...gadgetPromises]);
  laser = laserResult;
  for (const g of gadgetResults) {
    if (g) gadgets.push(g);
  }

  // Aggregate laser + gadget modifiers
  const laserSpeed = laser?.miningSpeed ?? 1;
  const laserResistMod = laser?.miningResistance ?? 0;
  const laserInstabMod = laser?.miningInstability ?? 0;

  const gadgetResistMod = gadgets.reduce((sum, g) => sum + g.miningResistance, 0);
  const gadgetInstabMod = gadgets.reduce((sum, g) => sum + g.miningInstability, 0);

  const totalResistMod = laserResistMod + gadgetResistMod;
  const totalInstabMod = laserInstabMod + gadgetInstabMod;

  const windowWidth = 0.15;
  const elements: MiningElementYield[] = parts.map((p) => {
    const probability = Number(p.probability ?? 0);
    const minPct = Number(p.minPercentage ?? 0);
    const maxPct = Number(p.maxPercentage ?? 0);
    const optimalWindow = Number(p.element?.optimalWindowMidpoint ?? 0.5);
    const instability = Math.max(0, Number(p.element?.instability ?? 0) + totalInstabMod);
    const resistance = Math.max(0, Number(p.element?.resistance ?? 0) - totalResistMod);

    const baseYield = (probability * (maxPct + minPct)) / 2;
    const riskPenalty = Math.max(0, 1 - (instability + resistance) / 2);
    const optimizedYield = baseYield * riskPenalty * laserSpeed * 1.2;

    return {
      elementName: p.element?.name ?? p.elementUuid,
      elementUuid: p.elementUuid,
      probability,
      baseYield: Math.round(baseYield * 10000) / 100,
      optimizedYield: Math.round(optimizedYield * 10000) / 100,
      optimalWindow,
      windowStart: Math.max(0, optimalWindow - windowWidth / 2),
      windowEnd: Math.min(1, optimalWindow + windowWidth / 2),
    };
  });

  const withRisk = parts.filter((p) => p.element?.instability != null || p.element?.resistance != null);
  let risk: MiningRiskAggregates | null = null;
  if (withRisk.length > 0) {
    const instabilities = withRisk.map((p) => Math.max(0, Number(p.element?.instability ?? 0) + totalInstabMod)).filter(Number.isFinite);
    const resistances = withRisk.map((p) => Math.max(0, Number(p.element?.resistance ?? 0) - totalResistMod)).filter(Number.isFinite);
    risk = {
      maxInstability: Math.max(...instabilities, 0),
      avgInstability: instabilities.length ? instabilities.reduce((a: number, b: number) => a + b, 0) / instabilities.length : 0,
      maxResistance: Math.max(...resistances, 0),
      avgResistance: resistances.length ? resistances.reduce((a: number, b: number) => a + b, 0) / resistances.length : 0,
    };
  }

  return {
    compositionName: composition.depositName ?? `Composition ${composition.uuid.substring(0, 8)}`,
    elements,
    risk,
    laser,
    gadgets,
  };
}
