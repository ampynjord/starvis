import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import type { ShipResult } from '../api.js';
import { getShipByName, getShips } from '../api.js';
import { errorEmbed, shipEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('ship')
  .setDescription('Rechercher un vaisseau Star Citizen')
  .addStringOption((opt) => opt.setName('nom').setDescription('Nom du vaisseau (ex: Aurora, Carrack)').setRequired(true));

/** Merge ship-matrix data and game-data into a single rich object */
function mergeShipData(matrix: ShipResult | null, gameData: ShipResult | null): ShipResult {
  if (!matrix) return gameData!;
  if (!gameData) return matrix;
  return { ...matrix, ...gameData, description: matrix.description ?? gameData.sm_description };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('nom', true);
  await interaction.deferReply();

  try {
    let matrixShip: ShipResult | null = null;
    let gameShip: ShipResult | null = null;

    // Try exact match from ship-matrix (has image + description)
    try {
      const exact = await getShipByName(name);
      if (exact.success && exact.data) matrixShip = exact.data;
    } catch {
      // Fall through
    }

    // Also get game-data (has combat stats, speeds, fuel)
    try {
      const res = await getShips(name);
      if (res.data?.length > 0) gameShip = res.data[0];
    } catch {
      // Fall through
    }

    if (!matrixShip && !gameShip) {
      await interaction.editReply({ embeds: [errorEmbed(`Aucun vaisseau trouvé pour « ${name} ».`)] });
      return;
    }

    const merged = mergeShipData(matrixShip, gameShip);

    // Check for multiple game-data results to list alternatives
    try {
      const res = await getShips(name);
      if (res.data && res.data.length > 1) {
        const others = res.data
          .slice(1)
          .map((s) => `• ${s.name}`)
          .join('\n');
        const embed = shipEmbed(merged);
        const currentDesc = embed.data.description ?? '';
        embed.setDescription(`${currentDesc}\n\n**Autres résultats :**\n${others}`.trim());
        await interaction.editReply({ embeds: [embed] });
        return;
      }
    } catch {
      // Ignore
    }

    await interaction.editReply({ embeds: [shipEmbed(merged)] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
