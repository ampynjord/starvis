import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import { searchAll } from '../api.js';
import { errorEmbed, searchEmbed } from '../embeds.js';

const SITE_URL = process.env.SITE_URL || 'https://starvis.ampynjord.bzh';

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Unified search (ships, components, items, commodities)')
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

    const sections: string[] = [];

    if (res.data.ships?.length > 0) {
      const items = res.data.ships.map((s) => {
        const mfr = s.manufacturer ? ` (${s.manufacturer})` : '';
        const role = s.focus ?? s.role;
        const extra = role ? ` — ${role}` : '';
        const id = s.id ?? s.ship_matrix_id;
        const link = id ? `[${s.name}](${SITE_URL}/ships/${id})` : `**${s.name}**`;
        return `• ${link}${mfr}${extra}`;
      });
      sections.push(`🚀 **Ships** (${res.data.ships.length})\n${items.join('\n')}`);
    }

    if (res.data.components?.length > 0) {
      const items = res.data.components.map((c) => {
        const parts = [`• **${c.name}**`];
        if (c.type) parts.push(c.type);
        if (c.size != null) parts.push(`T${c.size}`);
        if (c.grade) parts.push(`Grade ${c.grade}`);
        if (c.manufacturer) parts.push(c.manufacturer);
        return parts.join(' — ');
      });
      sections.push(`⚙️ **Components** (${res.data.components.length})\n${items.join('\n')}`);
    }

    if (res.data.items?.length > 0) {
      const items = res.data.items.map((i) => {
        const parts = [`• **${i.name}**`];
        if (i.type) parts.push(i.type);
        if (i.subType) parts.push(i.subType);
        return parts.join(' — ');
      });
      sections.push(`📦 **Items** (${res.data.items.length})\n${items.join('\n')}`);
    }

    if (res.data.commodities?.length > 0) {
      const items = res.data.commodities.map((c) => {
        const parts = [`• **${c.name}**`];
        if (c.type) parts.push(c.type);
        return parts.join(' — ');
      });
      sections.push(`🛢️ **Commodities** (${res.data.commodities.length})\n${items.join('\n')}`);
    }

    const description = sections.join('\n\n') || 'No results.';

    await interaction.editReply({
      embeds: [searchEmbed(`🔍 Results for "${term}"`, description)],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
