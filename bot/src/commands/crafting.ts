import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getBlueprintRewards, getCraftingRecipes } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('crafting')
  .setDescription('Search crafting recipes and blueprint rewards')
  .addStringOption((opt) =>
    opt
      .setName('view')
      .setDescription('Data family')
      .setRequired(true)
      .addChoices({ name: 'Recipes', value: 'recipes' }, { name: 'Blueprint rewards', value: 'blueprints' }),
  )
  .addStringOption((opt) => opt.setName('search').setDescription('Recipe, output, resource or blueprint name').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const view = interaction.options.getString('view', true);
  const search = interaction.options.getString('search', true);
  await interaction.deferReply();

  try {
    if (view === 'blueprints') {
      const res = await getBlueprintRewards(search, 6);
      const lines = (res.data ?? []).map((reward, index) => {
        const name = reward.blueprintName ?? reward.itemName ?? reward.name ?? 'Unknown blueprint';
        const details = [reward.type, reward.rarity, reward.sourceName ? `source: ${reward.sourceName}` : null].filter(Boolean).join(' - ');
        return `**${index + 1}. ${name}**${details ? `\n${details}` : ''}`;
      });
      await interaction.editReply({
        embeds: [embed(`Blueprint rewards - "${search}"`, lines.join('\n\n') || 'No blueprint reward found.')],
      });
      return;
    }

    const res = await getCraftingRecipes(search, 6);
    const lines = (res.data ?? []).map((recipe, index) => {
      const name = recipe.displayName ?? recipe.name ?? recipe.outputItemName ?? 'Unknown recipe';
      const meta = [
        recipe.category,
        recipe.stationType,
        recipe.skillLevel != null ? `skill ${recipe.skillLevel}` : null,
        recipe.outputQuantity != null && recipe.outputItemName
          ? `x${recipe.outputQuantity} ${recipe.outputItemName}`
          : recipe.outputItemName,
      ]
        .filter(Boolean)
        .join(' - ');
      const ingredients = (recipe.ingredients ?? [])
        .slice(0, 4)
        .map((item) => `${item.quantity ?? '?'}x ${item.itemName ?? item.type ?? 'resource'}`)
        .join(', ');
      return `**${index + 1}. ${name}**${meta ? `\n${meta}` : ''}${ingredients ? `\nIngredients: ${ingredients}` : ''}`;
    });

    await interaction.editReply({ embeds: [embed(`Crafting recipes - "${search}"`, lines.join('\n\n') || 'No recipe found.')] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}

function embed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle(title)
    .setURL(`${SITE_URL}/blueprints`)
    .setDescription(description.slice(0, 3900))
    .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });
}
