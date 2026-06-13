import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getGameVersion } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('version')
  .setDescription('Current version of the extracted Star Citizen data')
  .addStringOption((opt) =>
    opt
      .setName('env')
      .setDescription('Game environment')
      .setRequired(false)
      .addChoices({ name: 'LIVE (default)', value: 'live' }, { name: 'PTU', value: 'ptu' }),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const res = await getGameVersion();

    if (!res.success || !res.data) {
      await interaction.editReply({ embeds: [errorEmbed('Unable to fetch the game version.')] });
      return;
    }

    const v = res.data;
    const extractedDate = new Date(v.extracted_at).toLocaleDateString('en-US', {
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
        { name: '🌍 Environment', value: (v.env ?? 'live').toUpperCase(), inline: true },
        { name: '🚀 Ships', value: v.ships_count?.toLocaleString() ?? '—', inline: true },
        { name: '⚙️ Components', value: v.components_count?.toLocaleString() ?? '—', inline: true },
        { name: '📦 Items', value: v.items_count?.toLocaleString() ?? '—', inline: true },
        { name: '🕐 Last extraction', value: extractedDate, inline: false },
      ])
      .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
