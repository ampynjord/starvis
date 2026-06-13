import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getTopComponents, getTopShips } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

const SHIP_METRICS: Record<string, { label: string; sort: string; unit: string; category?: 'ship' | 'ground' | 'gravlev' }> = {
  cargo: { label: 'Cargo capacity', sort: 'cargo_capacity', unit: 'SCU', category: 'ship' },
  scm: { label: 'SCM speed', sort: 'scm_speed', unit: 'm/s', category: 'ship' },
  max_speed: { label: 'Max speed', sort: 'max_speed', unit: 'm/s' },
  shield: { label: 'Shield HP', sort: 'shield_hp', unit: 'HP', category: 'ship' },
  dps: { label: 'Weapon DPS', sort: 'weapon_damage_total', unit: 'DPS', category: 'ship' },
  missiles: { label: 'Missile damage', sort: 'missile_damage_total', unit: '', category: 'ship' },
  hull: { label: 'Hull HP', sort: 'total_hp', unit: 'HP' },
  mass: { label: 'Mass', sort: 'mass', unit: 'kg' },
};

const COMPONENT_METRICS: Record<string, { label: string; type: string; sort: string; unit: string }> = {
  weapon: { label: 'Ship weapons by DPS', type: 'WeaponGun', sort: 'weapon_dps', unit: 'DPS' },
  shield_generator: { label: 'Shield generators by HP', type: 'Shield', sort: 'shield_hp', unit: 'HP' },
  quantum_drive: { label: 'Quantum drives by speed', type: 'QuantumDrive', sort: 'qd_speed', unit: 'm/s' },
  cooler: { label: 'Coolers by cooling rate', type: 'Cooler', sort: 'cooling_rate', unit: '' },
  power_plant: { label: 'Power plants by output', type: 'PowerPlant', sort: 'power_output', unit: '' },
};

export const data = new SlashCommandBuilder()
  .setName('top')
  .setDescription('Rank ships or components by useful Starvis stats')
  .addStringOption((opt) =>
    opt
      .setName('category')
      .setDescription('What to rank')
      .setRequired(true)
      .addChoices(
        { name: 'Ships - cargo', value: 'ship:cargo' },
        { name: 'Ships - SCM speed', value: 'ship:scm' },
        { name: 'Ships - max speed', value: 'ship:max_speed' },
        { name: 'Ships - shield HP', value: 'ship:shield' },
        { name: 'Ships - weapon DPS', value: 'ship:dps' },
        { name: 'Ships - missile damage', value: 'ship:missiles' },
        { name: 'Ships - hull HP', value: 'ship:hull' },
        { name: 'Components - weapons', value: 'component:weapon' },
        { name: 'Components - shields', value: 'component:shield_generator' },
        { name: 'Components - quantum drives', value: 'component:quantum_drive' },
        { name: 'Components - coolers', value: 'component:cooler' },
        { name: 'Components - power plants', value: 'component:power_plant' },
      ),
  )
  .addIntegerOption((opt) =>
    opt.setName('limit').setDescription('Number of results, 3 to 15').setRequired(false).setMinValue(3).setMaxValue(15),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const [kind, metric] = interaction.options.getString('category', true).split(':') as [string, string];
  const limit = interaction.options.getInteger('limit') ?? 10;
  await interaction.deferReply();

  try {
    if (kind === 'ship') {
      await interaction.editReply({ embeds: [await shipTopEmbed(metric, limit)] });
      return;
    }
    if (kind === 'component') {
      await interaction.editReply({ embeds: [await componentTopEmbed(metric, limit)] });
      return;
    }
    await interaction.editReply({ embeds: [errorEmbed('Unknown ranking category.')] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}

async function shipTopEmbed(metric: string, limit: number): Promise<EmbedBuilder> {
  const cfg = SHIP_METRICS[metric];
  if (!cfg) return errorEmbed('Unknown ship metric.');

  const res = await getTopShips({ sort: cfg.sort, category: cfg.category, limit });
  const lines = (res.data ?? []).map((ship, index) => {
    const value = (ship as unknown as Record<string, unknown>)[cfg.sort];
    const manufacturer = ship.manufacturer_name ?? ship.manufacturer ?? ship.manufacturer_code;
    return `**${index + 1}. ${ship.name}**${manufacturer ? ` - ${manufacturer}` : ''}\n${cfg.label}: **${formatValue(value, cfg.unit)}**`;
  });

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`Top ${lines.length} ships - ${cfg.label}`)
    .setURL(`${SITE_URL}/ranking?sort=${encodeURIComponent(cfg.sort)}`)
    .setDescription(lines.join('\n\n') || 'No data found.')
    .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });
}

async function componentTopEmbed(metric: string, limit: number): Promise<EmbedBuilder> {
  const cfg = COMPONENT_METRICS[metric];
  if (!cfg) return errorEmbed('Unknown component metric.');

  const res = await getTopComponents({ type: cfg.type, sort: cfg.sort, limit });
  const lines = (res.data ?? []).map((component, index) => {
    const value = (component as unknown as Record<string, unknown>)[cfg.sort];
    const details = [
      `S${component.size ?? '?'}`,
      component.grade ? `Grade ${component.grade}` : null,
      component.manufacturer_name ?? component.manufacturer,
    ]
      .filter(Boolean)
      .join(' - ');
    return `**${index + 1}. ${component.name}**${details ? `\n${details}` : ''}\n${cfg.label}: **${formatValue(value, cfg.unit)}**`;
  });

  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`Top ${lines.length} components - ${cfg.label}`)
    .setURL(`${SITE_URL}/components?type=${encodeURIComponent(cfg.type)}&sort=${encodeURIComponent(cfg.sort)}`)
    .setDescription(lines.join('\n\n') || 'No data found.')
    .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });
}

function formatValue(value: unknown, unit: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'n/a';
  const formatted = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}
