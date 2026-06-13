import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getCommLinks, getGalactapedia } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('lore')
  .setDescription('Search Galactapedia and Comm-Link knowledge')
  .addStringOption((opt) =>
    opt
      .setName('source')
      .setDescription('Knowledge source')
      .setRequired(true)
      .addChoices({ name: 'Galactapedia', value: 'galactapedia' }, { name: 'Comm-Links', value: 'comm-links' }),
  )
  .addStringOption((opt) => opt.setName('search').setDescription('Topic, title or keyword').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const source = interaction.options.getString('source', true);
  const search = interaction.options.getString('search', true);
  await interaction.deferReply();

  try {
    if (source === 'comm-links') {
      const res = await getCommLinks(search, 6);
      const lines = (res.data ?? []).map((entry, index) => {
        const details = [
          entry.category,
          entry.publishedAt ? new Date(entry.publishedAt).toLocaleDateString('en-US') : null,
          entry.subtitle,
        ].filter(Boolean);
        return `**${index + 1}. ${entry.title}**${details.length ? `\n${details.join(' - ')}` : ''}`;
      });
      await interaction.editReply({
        embeds: [embed(`Comm-Links - "${search}"`, `${SITE_URL}/comm-links`, lines.join('\n\n') || 'No Comm-Link found.')],
      });
      return;
    }

    const res = await getGalactapedia(search, 6);
    const lines = (res.data ?? []).map((entry, index) => {
      const details = [entry.type, entry.excerpt].filter(Boolean).join(' - ');
      return `**${index + 1}. ${entry.title}**${details ? `\n${truncate(details, 260)}` : ''}`;
    });
    await interaction.editReply({
      embeds: [embed(`Galactapedia - "${search}"`, `${SITE_URL}/galactapedia`, lines.join('\n\n') || 'No Galactapedia entry found.')],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}

function embed(title: string, url: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle(title)
    .setURL(url)
    .setDescription(description.slice(0, 3900))
    .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
