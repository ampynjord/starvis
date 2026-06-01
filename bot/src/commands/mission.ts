import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getMissions } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('mission')
  .setDescription('Search Star Citizen missions')
  .addStringOption((opt) => opt.setName('term').setDescription('Mission title or keyword').setRequired(false))
  .addStringOption((opt) =>
    opt
      .setName('type')
      .setDescription('Mission type')
      .setRequired(false)
      .addChoices(
        { name: 'Bounty', value: 'Bounty' },
        { name: 'Delivery', value: 'Delivery' },
        { name: 'Combat', value: 'Combat' },
        { name: 'Mining', value: 'Mining' },
        { name: 'Salvage', value: 'Salvage' },
        { name: 'Escort', value: 'Escort' },
        { name: 'Investigation', value: 'Investigation' },
      ),
  )
  .addBooleanOption((opt) => opt.setName('legal').setDescription('Legal missions only').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const term = interaction.options.getString('term') ?? undefined;
  const type = interaction.options.getString('type') ?? undefined;
  await interaction.deferReply();

  try {
    const res = await getMissions({ search: term, type, limit: 6 });

    if (!res.data || res.data.length === 0) {
      const what = term ? `"${term}"` : (type ?? 'these criteria');
      await interaction.editReply({ embeds: [errorEmbed(`No mission found for ${what}.`)] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`🎯 Missions (${res.total} found)`)
      .setURL(`${SITE_URL}/missions`)
      .setFooter({ text: 'Starvis — Star Citizen Database' });

    const lines = res.data.map((m) => {
      const icon = m.is_legal === false ? '🔴' : '🟢';
      const title = m.title ?? m.class_name;
      const reward =
        m.reward_min != null && m.reward_max != null
          ? ` — ${m.reward_min.toLocaleString()}–${m.reward_max.toLocaleString()} ${m.reward_currency ?? 'aUEC'}`
          : '';
      const danger = m.danger_level ? ` ⚠️${m.danger_level}` : '';
      const blueprint = m.has_blueprint_reward ? ' 📋' : '';
      return `${icon} **${title}**${reward}${danger}${blueprint}`;
    });

    embed.setDescription(lines.join('\n'));

    if (res.total > res.data.length) {
      embed.addFields([{ name: '…', value: `_${res.total - res.data.length} more missions not shown_`, inline: false }]);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
