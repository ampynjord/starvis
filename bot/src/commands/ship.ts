import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import { getShipByName, getShips } from '../api.js';
import { errorEmbed, shipEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('ship')
  .setDescription('Rechercher un vaisseau Star Citizen')
  .addStringOption((opt) => opt.setName('nom').setDescription('Nom du vaisseau (ex: Aurora, Carrack)').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('nom', true);
  await interaction.deferReply();

  try {
    // Try exact match first
    try {
      const exact = await getShipByName(name);
      if (exact.success && exact.data) {
        await interaction.editReply({ embeds: [shipEmbed(exact.data)] });
        return;
      }
    } catch {
      // Fall through to search
    }

    // Fuzzy search
    const res = await getShips(name);
    if (!res.data || res.data.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed(`Aucun vaisseau trouvé pour « ${name} ».`)] });
      return;
    }

    if (res.data.length === 1) {
      await interaction.editReply({ embeds: [shipEmbed(res.data[0])] });
      return;
    }

    // Multiple results — show the first match + list others
    const embeds = [shipEmbed(res.data[0])];
    if (res.data.length > 1) {
      const others = res.data
        .slice(1)
        .map((s) => `• ${s.name}`)
        .join('\n');
      embeds[0].setDescription(`Autres résultats :\n${others}`);
    }
    await interaction.editReply({ embeds });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
