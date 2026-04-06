import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getManufacturers } from '../api.js';
import { errorEmbed } from '../embeds.js';

const SITE_URL = process.env.SITE_URL || 'https://starvis.ampynjord.bzh';

export const data = new SlashCommandBuilder().setName('manufacturers').setDescription('Liste des constructeurs de vaisseaux Star Citizen');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const res = await getManufacturers();

    if (!res.data || res.data.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed('Aucun constructeur trouvé.')] });
      return;
    }

    const lines = res.data.map((m) => {
      const known = m.known_for ? ` — _${m.known_for}_` : '';
      return `\`${m.code}\` **${m.name}**${known}`;
    });

    const description = lines.join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🏭 Constructeurs (${res.total ?? res.data.length})`)
      .setDescription(description.length > 4000 ? `${description.slice(0, 3997)}…` : description)
      .setURL(`${SITE_URL}/manufacturers`)
      .setFooter({ text: 'Starvis — Star Citizen Database' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
