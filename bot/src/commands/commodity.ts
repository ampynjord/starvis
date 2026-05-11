import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import { getCommodities } from '../api.js';
import { errorEmbed, searchEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('commodity')
  .setDescription('Search for a commodity')
  .addStringOption((opt) => opt.setName('name').setDescription('Commodity name (e.g. Laranite, Medical Supplies)').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true);
  await interaction.deferReply();

  try {
    const res = await getCommodities(name);

    if (!res.data || res.data.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed(`No commodity found for "${name}".`)] });
      return;
    }

    const lines = res.data.map((c) => {
      const parts = [`**${c.name}**`];
      if (c.type) parts.push(`Type: ${c.type}`);
      if (c.sub_type) parts.push(`Sub-type: ${c.sub_type}`);
      if (c.class_name) parts.push(`\`${c.class_name}\``);
      return parts.join(' — ');
    });

    const description = lines.join('\n') + (res.total > res.data.length ? `\n\n_… and ${res.total - res.data.length} more results_` : '');

    await interaction.editReply({
      embeds: [searchEmbed(`🛢️ Commodities — "${name}"`, description)],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
