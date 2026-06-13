import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getLocations, getStarmapSystems } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('location')
  .setDescription('Search game locations or starmap systems')
  .addStringOption((opt) =>
    opt
      .setName('view')
      .setDescription('Search scope')
      .setRequired(true)
      .addChoices({ name: 'Locations', value: 'locations' }, { name: 'Starmap systems', value: 'systems' }),
  )
  .addStringOption((opt) => opt.setName('search').setDescription('Location or system name').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const view = interaction.options.getString('view', true);
  const search = interaction.options.getString('search', true);
  await interaction.deferReply();

  try {
    if (view === 'systems') {
      const res = await getStarmapSystems(search);
      const needle = search.toLowerCase();
      const systems = (res.data ?? [])
        .filter((s) => s.name.toLowerCase().includes(needle) || s.code.toLowerCase().includes(needle))
        .slice(0, 8);
      const lines = systems.map((system, index) => {
        const details = [system.code, system.affiliation, system.economy, system.danger ? `danger ${system.danger}` : null]
          .filter(Boolean)
          .join(' - ');
        return `**${index + 1}. ${system.name}**${details ? `\n${details}` : ''}`;
      });
      await interaction.editReply({ embeds: [embed(`Starmap systems - "${search}"`, lines.join('\n\n') || 'No system found.')] });
      return;
    }

    const res = await getLocations(search, 8);
    const lines = (res.data ?? []).map((loc, index) => {
      const details = [loc.type, loc.system, loc.parentName ?? loc.planet, loc.jurisdiction].filter(Boolean).join(' - ');
      return `**${index + 1}. ${loc.name}**${details ? `\n${details}` : ''}${loc.hasQuantumMarker ? '\nQuantum marker available' : ''}`;
    });
    await interaction.editReply({ embeds: [embed(`Locations - "${search}"`, lines.join('\n\n') || 'No location found.')] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}

function embed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x00a8ff)
    .setTitle(title)
    .setURL(`${SITE_URL}/locations`)
    .setDescription(description.slice(0, 3900))
    .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });
}
