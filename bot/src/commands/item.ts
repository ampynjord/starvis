import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getItems } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

const COLORS = { item: 0xe67e22 } as const;

export const data = new SlashCommandBuilder()
  .setName('item')
  .setDescription('Search an FPS item (armor, weapon, gadget, etc.)')
  .addStringOption((opt) => opt.setName('name').setDescription('Item name (e.g. Pyro RYT, Hurston Dynamics)').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true);
  await interaction.deferReply();

  try {
    const res = await getItems(name);

    if (!res.data || res.data.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed(`No item found for "${name}".`)] });
      return;
    }

    const lines = res.data.map((it) => {
      const parts = [`**${it.name}**`];
      if (it.type) parts.push(it.type);
      if (it.subType) parts.push(it.subType);
      return parts.join(' — ');
    });

    const more = res.total > res.data.length ? `\n\n_… and ${res.total - res.data.length} more results_` : '';
    const description = lines.join('\n') + more;

    const embed = new EmbedBuilder()
      .setColor(COLORS.item)
      .setTitle(`📦 Items — "${name}"`)
      .setDescription(description)
      .setURL(`${SITE_URL}/equipment`)
      .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
