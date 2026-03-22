import type { MiningComposition, MiningCompositionPart } from '@/types/api';

export interface MiningCompositionElementView {
  elementUuid: string;
  elementName: string;
  probability: number;
  minPercentage: number;
  maxPercentage: number;
  instability?: number;
  resistance?: number;
  explosionMultiplier?: number;
  optimalWindow?: number;
}

export interface MiningCompositionView {
  id: string;
  name: string;
  className: string;
  minDistinctElements?: number;
  elements: MiningCompositionElementView[];
}

function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function getCompositionDisplayName(composition: Pick<MiningComposition, 'deposit_name' | 'class_name'>): string {
  return composition.deposit_name || composition.class_name || 'Unknown';
}

export function mapCompositionPartToView(part: MiningCompositionPart): MiningCompositionElementView {
  return {
    elementUuid: part.element_uuid,
    elementName: part.element_name,
    probability: Number(part.probability),
    minPercentage: Number(part.min_percentage),
    maxPercentage: Number(part.max_percentage),
    instability: toNumber(part.instability),
    resistance: toNumber(part.resistance),
    explosionMultiplier: toNumber((part as unknown as { explosion_multiplier?: unknown }).explosion_multiplier),
    optimalWindow: toNumber((part as unknown as { optimal_window_midpoint?: unknown }).optimal_window_midpoint),
  };
}

export function mapCompositionToView(composition: MiningComposition): MiningCompositionView {
  return {
    id: composition.uuid,
    name: getCompositionDisplayName(composition),
    className: composition.class_name || '',
    minDistinctElements: composition.min_distinct_elements ?? undefined,
    elements: (composition.elements ?? [])
      .filter((p) => p != null && p.element_uuid != null)
      .map(mapCompositionPartToView),
  };
}
