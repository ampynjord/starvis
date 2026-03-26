import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import { getCommodities } from '../api.js';
import { errorEmbed, searchEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('commodity')
  .setDescription('Rechercher une commodité')
  .addStringOption((opt) => opt.setName('nom').setDescription('Nom de la commodité (ex: Laranite, Medical)').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('nom', true);
  await interaction.deferReply();

  try {
    const res = await getCommodities(name);

    if (!res.data || res.data.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed(`Aucune commodité trouvée pour « ${name} ».`)] });
      return;
    }

    const lines = res.data.map((c) => {
      const parts = [`**${c.name}**`];
      if (c.type) parts.push(`Type: ${c.type}`);
      if (c.rarity) parts.push(`Rareté: ${c.rarity}`);
      return parts.join(' — ');
    });

    const description =
      lines.join('\n') + (res.total > res.data.length ? `\n\n_… et ${res.total - res.data.length} autres résultats_` : '');

    await interaction.editReply({
      embeds: [searchEmbed(`🛢️ Commodités — « ${name} »`, description)],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
