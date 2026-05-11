import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import type { ShipResult } from '../api.js';
import { getShipByName, getShips, getShipsAutocomplete } from '../api.js';
import { errorEmbed, shipEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('ship')
  .setDescription('Search for a Star Citizen ship')
  .addStringOption((opt) =>
    opt.setName('name').setDescription('Ship name (e.g. Aurora, Carrack)').setRequired(true).setAutocomplete(true),
  );

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
  const name = interaction.options.getString('name', true);
  await interaction.deferReply();

  try {
    const [matrixResult, gameResult] = await Promise.allSettled([getShipByName(name), getShips(name)]);

    const matrixShip = matrixResult.status === 'fulfilled' && matrixResult.value.success ? matrixResult.value.data : null;
    const gameShip = gameResult.status === 'fulfilled' && gameResult.value.data?.length ? gameResult.value.data[0] : null;
    const allGameShips = gameResult.status === 'fulfilled' ? (gameResult.value.data ?? []) : [];

    if (!matrixShip && !gameShip) {
      await interaction.editReply({ embeds: [errorEmbed(`No ship found for "${name}".`)] });
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
      embed.setDescription(`${currentDesc}\n\n**Other results:**\n${others}`.trim());
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
