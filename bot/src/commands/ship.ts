import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import type { ShipResult } from '../api.js';
import { getShipByName, getShips, getShipsAutocomplete } from '../api.js';
import { errorEmbed, shipEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('ship')
  .setDescription('Rechercher un vaisseau Star Citizen')
  .addStringOption((opt) =>
    opt.setName('nom').setDescription('Nom du vaisseau (ex: Aurora, Carrack)').setRequired(true).setAutocomplete(true),
  );

/** Merge ship-matrix data and game-data into a single rich object */
function mergeShipData(matrix: ShipResult | null, gameData: ShipResult | null): ShipResult {
  if (!matrix) return gameData!;
  if (!gameData) return matrix;
  return { ...matrix, ...gameData, description: matrix.description ?? gameData.sm_description };
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const choices = await getShipsAutocomplete(focused);
  await interaction.respond(choices.slice(0, 25));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('nom', true);
  await interaction.deferReply();

  try {
    // Fetch matrix and game data in parallel
    const [matrixResult, gameResult] = await Promise.allSettled([getShipByName(name), getShips(name)]);

    const matrixShip = matrixResult.status === 'fulfilled' && matrixResult.value.success ? matrixResult.value.data : null;
    const gameShip = gameResult.status === 'fulfilled' && gameResult.value.data?.length ? gameResult.value.data[0] : null;
    const allGameShips = gameResult.status === 'fulfilled' ? (gameResult.value.data ?? []) : [];

    if (!matrixShip && !gameShip) {
      await interaction.editReply({ embeds: [errorEmbed(`Aucun vaisseau trouvé pour « ${name} ».`)] });
      return;
    }

    const merged = mergeShipData(matrixShip, gameShip);
    const embed = shipEmbed(merged);

    if (allGameShips.length > 1) {
      const others = allGameShips
        .slice(1)
        .map((s) => `• ${s.name}`)
        .join('\n');
      const currentDesc = embed.data.description ?? '';
      embed.setDescription(`${currentDesc}\n\n**Autres résultats :**\n${others}`.trim());
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
