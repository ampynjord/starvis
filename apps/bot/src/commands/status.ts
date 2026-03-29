import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import { getHealth, getStats } from '../api.js';
import { errorEmbed, statusEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder().setName('status').setDescription('État de Starvis (API, base de données)');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const [health, stats] = await Promise.allSettled([getHealth(), getStats()]);

    const healthy = health.status === 'fulfilled';
    const statsData = stats.status === 'fulfilled' ? stats.value.data : undefined;

    await interaction.editReply({ embeds: [statusEmbed(healthy, statsData)] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
