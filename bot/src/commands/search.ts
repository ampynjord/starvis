import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import { searchAll } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed, searchEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Unified search across ships, components, items and commodities')
  .addStringOption((opt) => opt.setName('term').setDescription('Search term').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const term = interaction.options.getString('term', true);
  await interaction.deferReply();

  try {
    const res = await searchAll(term);
    if (res.total === 0) {
      await interaction.editReply({ embeds: [errorEmbed(`No results for "${term}".`)] });
      return;
    }

    const sections = [
      section('Ships', res.data.ships, (s) => {
        const id = s.id ?? s.ship_matrix_id;
        const name = id ? `[${s.name}](${SITE_URL}/ships/${id})` : `**${s.name}**`;
        const role = s.focus ?? s.role;
        return [name, s.manufacturer_name ?? s.manufacturer, role].filter(Boolean).join(' - ');
      }),
      section('Components', res.data.components, (c) =>
        [`**${c.name}**`, c.type, c.size != null ? `S${c.size}` : null, c.grade ? `Grade ${c.grade}` : null].filter(Boolean).join(' - '),
      ),
      section('Items', res.data.items, (i) => [`**${i.name}**`, i.type, i.subType].filter(Boolean).join(' - ')),
      section('Commodities', res.data.commodities, (c) => [`**${c.name}**`, c.type, c.sub_type].filter(Boolean).join(' - ')),
    ].filter(Boolean);

    await interaction.editReply({
      embeds: [searchEmbed(`Results for "${term}"`, sections.join('\n\n') || 'No results.')],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}

function section<T>(title: string, rows: T[] | undefined, render: (row: T) => string): string | null {
  if (!rows?.length) return null;
  const lines = rows.slice(0, 5).map((row, index) => `${index + 1}. ${render(row)}`);
  return `**${title}** (${rows.length})\n${lines.join('\n')}`;
}
