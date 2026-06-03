import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getChangelog } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

const CHANGE_ICONS: Record<string, string> = {
  added: '🟢',
  removed: '🔴',
  modified: '🟡',
};

const ENTITY_ICONS: Record<string, string> = {
  ship: '🚀',
  component: '⚙️',
  item: '📦',
  commodity: '🛢️',
  shop: '🏪',
  module: '🔩',
  recipe: '📋',
};

export const data = new SlashCommandBuilder()
  .setName('changelog')
  .setDescription('Latest changes to the Starvis database (ships, components, etc.)')
  .addIntegerOption((opt) =>
    opt
      .setName('limit')
      .setDescription('Number of entries to display (default: 8, max: 20)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(20),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const limit = interaction.options.getInteger('limit') ?? 8;
  await interaction.deferReply();

  try {
    const res = await getChangelog(limit);

    if (!res.success || !res.data?.length) {
      await interaction.editReply({ embeds: [errorEmbed('No recent changes found.')] });
      return;
    }

    const lines = res.data.map((entry) => {
      const changeIcon = CHANGE_ICONS[entry.change_type] ?? '⚪';
      const entityIcon = ENTITY_ICONS[entry.entity_type] ?? '📄';
      const name = entry.entity_name ?? 'Unknown';

      if (entry.change_type === 'modified' && entry.field_name) {
        const from = entry.old_value ? `~~${entry.old_value}~~` : '_empty_';
        const to = entry.new_value ?? '_empty_';
        return `${changeIcon}${entityIcon} **${name}** — \`${entry.field_name}\`: ${from} → ${to}`;
      }
      return `${changeIcon}${entityIcon} **${name}** ${entry.change_type}`;
    });

    const description = lines.join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`📝 Changelog Starvis (${res.total} entries)`)
      .setDescription(description.length > 4000 ? `${description.slice(0, 3997)}…` : description)
      .setURL(`${SITE_URL}/changelog`)
      .setFooter({ text: 'Starvis — Star Citizen Database' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
