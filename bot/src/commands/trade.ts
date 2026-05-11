import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import { getTradeRoutes } from '../api.js';
import { errorEmbed, tradeRoutesEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('trade')
  .setDescription('Best trade routes')
  .addIntegerOption((opt) =>
    opt.setName('scu').setDescription('Cargo capacity in SCU (default: 100)').setRequired(false).setMinValue(1).setMaxValue(10000),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const scu = interaction.options.getInteger('scu') ?? 100;
  await interaction.deferReply();

  try {
    const res = await getTradeRoutes(scu);

    if (!res.data || res.data.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed('No trade route available.')] });
      return;
    }

    await interaction.editReply({ embeds: [tradeRoutesEmbed(res.data, scu)] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
