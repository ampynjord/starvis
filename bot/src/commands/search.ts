import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import { searchAll } from '../api.js';
import { errorEmbed, searchEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Recherche unifiée (vaisseaux, composants, items, commodités)')
  .addStringOption((opt) => opt.setName('terme').setDescription('Terme de recherche').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const term = interaction.options.getString('terme', true);
  await interaction.deferReply();

  try {
    const res = await searchAll(term);

    if (res.total === 0) {
      await interaction.editReply({ embeds: [errorEmbed(`Aucun résultat pour « ${term} ».`)] });
      return;
    }

    const sections: string[] = [];

    if (res.data.ships?.length > 0) {
      const items = res.data.ships.map((s) => `• **${s.name}** ${s.manufacturer ? `(${s.manufacturer})` : ''}`);
      sections.push(`🚀 **Vaisseaux** (${res.data.ships.length})\n${items.join('\n')}`);
    }

    if (res.data.components?.length > 0) {
      const items = res.data.components.map((c) => `• **${c.name}** ${c.type ? `— ${c.type}` : ''}`);
      sections.push(`⚙️ **Composants** (${res.data.components.length})\n${items.join('\n')}`);
    }

    if (res.data.items?.length > 0) {
      const items = res.data.items.map((i) => `• **${i.name}** ${i.type ? `— ${i.type}` : ''}`);
      sections.push(`📦 **Items** (${res.data.items.length})\n${items.join('\n')}`);
    }

    if (res.data.commodities?.length > 0) {
      const items = res.data.commodities.map((c) => `• **${c.name}** ${c.type ? `— ${c.type}` : ''}`);
      sections.push(`🛢️ **Commodités** (${res.data.commodities.length})\n${items.join('\n')}`);
    }

    const description = sections.join('\n\n') || 'Aucun résultat.';

    await interaction.editReply({
      embeds: [searchEmbed(`🔍 Résultats pour « ${term} »`, description)],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
