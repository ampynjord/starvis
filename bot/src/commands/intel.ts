import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getStats } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';
import { datasetStatLines } from '../stats-format.js';

const COMMAND_GROUPS: Array<{ name: string; value: string }> = [
  {
    name: 'Ships and equipment',
    value: '`/ship`, `/compare`, `/loadout`, `/component`, `/item`, `/commodity`, `/paint`, `/top`',
  },
  {
    name: 'Economy and operations',
    value: '`/trade`, `/shop`, `/mining`, `/crafting`, `/mission`',
  },
  {
    name: 'Universe knowledge',
    value: '`/location`, `/faction`, `/lore`, `/manufacturers`, `/search`',
  },
  {
    name: 'Platform',
    value: '`/starvis`, `/version`, `/changelog`, `/status`, `/intel`',
  },
];

export const data = new SlashCommandBuilder().setName('intel').setDescription('Show everything the Starvis bot can query');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const stats = await getStats().catch(() => null);
    const embed = new EmbedBuilder()
      .setColor(0x00d4ff)
      .setTitle('Starvis Discord Intel')
      .setURL(SITE_URL)
      .setDescription(
        [
          'The bot can query STARVIS game data, RSI website data, extraction metadata and the Starvis AI endpoint.',
          'Use `/starvis question:<your question>` for free-form AI answers, or the focused commands below for fast structured results.',
        ].join('\n\n'),
      )
      .addFields(COMMAND_GROUPS)
      .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });

    if (stats?.data) {
      const lines = datasetStatLines(stats.data).slice(0, 11);
      embed.addFields({ name: 'Current dataset', value: lines.join('\n') || 'No stats available.', inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
