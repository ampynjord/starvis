import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getGameVersion } from '../api.js';
import { errorEmbed } from '../embeds.js';

const SITE_URL = process.env.SITE_URL || 'https://starvis.ampynjord.bzh';

export const data = new SlashCommandBuilder()
  .setName('version')
  .setDescription('Version actuelle des données Star Citizen extraites')
  .addStringOption((opt) =>
    opt
      .setName('env')
      .setDescription('Environnement de jeu')
      .setRequired(false)
      .addChoices({ name: 'LIVE (défaut)', value: 'live' }, { name: 'PTU', value: 'ptu' }),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const res = await getGameVersion();

    if (!res.success || !res.data) {
      await interaction.editReply({ embeds: [errorEmbed('Impossible de récupérer la version du jeu.')] });
      return;
    }

    const v = res.data;
    const extractedDate = new Date(v.extracted_at).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`🎮 Star Citizen ${v.game_version}`)
      .setURL(SITE_URL)
      .addFields([
        { name: '🌍 Environnement', value: (v.env ?? 'live').toUpperCase(), inline: true },
        { name: '🚀 Vaisseaux', value: v.ships_count?.toLocaleString('fr-FR') ?? '—', inline: true },
        { name: '⚙️ Composants', value: v.components_count?.toLocaleString('fr-FR') ?? '—', inline: true },
        { name: '📦 Items', value: v.items_count?.toLocaleString('fr-FR') ?? '—', inline: true },
        { name: '🕐 Dernière extraction', value: extractedDate, inline: false },
      ])
      .setFooter({ text: 'Starvis — Star Citizen Database' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
