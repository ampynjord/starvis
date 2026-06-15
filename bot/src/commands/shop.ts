import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getShops } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Search extracted shop locations')
  .addStringOption((opt) => opt.setName('search').setDescription('Shop or location name').setRequired(true))
  .addBooleanOption((opt) => opt.setName('inventory').setDescription('Explain current inventory availability').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const search = interaction.options.getString('search', true);
  const showInventory = interaction.options.getBoolean('inventory') ?? false;
  await interaction.deferReply();

  try {
    const shops = await getShops(search, 6);
    if (!shops.data?.length) {
      await interaction.editReply({ embeds: [errorEmbed(`No shop found for "${search}".`)] });
      return;
    }

    if (showInventory) {
      const shop = shops.data[0];
      await interaction.editReply({
        embeds: [
          embed(
            `${shop.name} inventory`,
            'Shop inventory is currently disabled in Starvis because reliable extracted inventory data is not available yet. The `/shop` command only exposes extracted shop locations and franchises for now.',
          ),
        ],
      });
      return;
    }

    const lines = shops.data.map((shop, index) => {
      const location = shop.locationName ?? shop.location_name;
      const details = [shop.shopType ?? shop.type, shop.category, location, shop.system, countLabel(shop.itemCount ?? shop.inventoryCount)]
        .filter(Boolean)
        .join(' - ');
      return `**${index + 1}. ${shop.name}**${details ? `\n${details}` : ''}`;
    });

    await interaction.editReply({ embeds: [embed(`Shops - "${search}"`, lines.join('\n\n'))] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}

function embed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(title)
    .setURL(`${SITE_URL}/shops`)
    .setDescription(description.slice(0, 3900))
    .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });
}

function countLabel(value?: number): string | null {
  return value != null ? `${value} items` : null;
}
