import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getFactions } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('faction')
  .setDescription('Search factions and reputation organizations')
  .addStringOption((opt) => opt.setName('search').setDescription('Faction name or code').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const search = interaction.options.getString('search') ?? undefined;
  await interaction.deferReply();

  try {
    const res = await getFactions(search);
    const needle = search?.toLowerCase();
    const factions = (res.data ?? [])
      .filter((f) => !needle || f.name.toLowerCase().includes(needle) || f.code?.toLowerCase().includes(needle))
      .slice(0, 10);

    const lines = factions.map((faction, index) => {
      const details = [faction.code, faction.type, faction.lawfulness, faction.reputationScope].filter(Boolean).join(' - ');
      return `**${index + 1}. ${faction.name}**${details ? `\n${details}` : ''}${faction.description ? `\n${truncate(faction.description, 180)}` : ''}`;
    });

    const title = search ? `Factions - "${search}"` : 'Faction registry';
    await interaction.editReply({ embeds: [embed(title, lines.join('\n\n') || 'No faction found.')] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}

function embed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(title)
    .setURL(`${SITE_URL}/factions`)
    .setDescription(description.slice(0, 3900))
    .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
