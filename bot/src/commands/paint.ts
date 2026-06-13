import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getPaints } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('paint')
  .setDescription('Search ship paints and liveries')
  .addStringOption((opt) => opt.setName('search').setDescription('Paint, livery or ship name').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const search = interaction.options.getString('search', true);
  await interaction.deferReply();

  try {
    const res = await getPaints(search, 8);
    if (!res.data?.length) {
      await interaction.editReply({ embeds: [errorEmbed(`No paint found for "${search}".`)] });
      return;
    }

    const lines = res.data.map((paint, index) => {
      const vehicle = paint.vehicleName ?? paint.vehicle_name;
      const details = [vehicle, paint.manufacturer, paint.color].filter(Boolean).join(' - ');
      return `**${index + 1}. ${paint.name}**${details ? `\n${details}` : ''}${paint.description ? `\n${truncate(paint.description, 160)}` : ''}`;
    });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff66cc)
          .setTitle(`Paints - "${search}"`)
          .setURL(`${SITE_URL}/paints`)
          .setDescription(lines.join('\n\n').slice(0, 3900))
          .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' }),
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
