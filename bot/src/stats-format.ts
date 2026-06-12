import type { APIEmbedField } from 'discord.js';

type StatValue = number | string | null | undefined;

const DATASET_FIELDS: Array<{ key: string; label: string; inline?: boolean }> = [
  { key: 'ships', label: 'Ships' },
  { key: 'space_ships', label: 'Space ships' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'ground_vehicles', label: 'Ground vehicles' },
  { key: 'gravlev_vehicles', label: 'Gravlev vehicles' },
  { key: 'components', label: 'Components' },
  { key: 'items', label: 'Items' },
  { key: 'commodities', label: 'Commodities' },
  { key: 'manufacturers', label: 'Manufacturers' },
  { key: 'paints', label: 'Paints' },
  { key: 'shops', label: 'Shops' },
  { key: 'game_version', label: 'Game version' },
  { key: 'last_extraction', label: 'Last extraction', inline: false },
];

export function datasetStatFields(stats: Record<string, StatValue>): APIEmbedField[] {
  return DATASET_FIELDS.filter(({ key }) => stats[key] != null).map(({ key, label, inline }) => ({
    name: label,
    value: formatStatValue(stats[key]),
    inline: inline ?? true,
  }));
}

export function datasetStatLines(stats: Record<string, StatValue>): string[] {
  return DATASET_FIELDS.filter(({ key }) => stats[key] != null && key !== 'last_extraction').map(
    ({ key, label }) => `${label}: **${formatStatValue(stats[key])}**`,
  );
}

function formatStatValue(value: StatValue): string {
  if (value == null || value === '') return 'n/a';
  if (typeof value === 'number') return value.toLocaleString('en-US');
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.replace(/\.\d{3}Z$/, 'Z');
  return value;
}
