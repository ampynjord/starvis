import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getItems } from '../api.js';
import { errorEmbed } from '../embeds.js';

const COLORS = { item: 0xe67e22 } as const;
const SITE_URL = process.env.SITE_URL || 'https://starvis.ampynjord.bzh';

export const data = new SlashCommandBuilder()
  .setName('item')
  .setDescription('Rechercher un item FPS (armure, arme, gadget…)')
  .addStringOption((opt) => opt.setName('nom').setDescription("Nom de l'item (ex: Pyro RYT, Hurston Dynamics)").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('nom', true);
  await interaction.deferReply();

  try {
    const res = await getItems(name);

    if (!res.data || res.data.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed(`Aucun item trouvé pour « ${name} ».`)] });
      return;
    }

    const lines = res.data.map((it) => {
      const parts = [`**${it.name}**`];
      if (it.type) parts.push(it.type);
      if (it.subType) parts.push(it.subType);
      return parts.join(' — ');
    });

    const more = res.total > res.data.length ? `\n\n_… et ${res.total - res.data.length} autres résultats_` : '';
    const description = lines.join('\n') + more;

    const embed = new EmbedBuilder()
      .setColor(COLORS.item)
      .setTitle(`📦 Items — « ${name} »`)
      .setDescription(description)
      .setURL(`${SITE_URL}/equipment`)
      .setFooter({ text: 'Starvis — Star Citizen Database' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
