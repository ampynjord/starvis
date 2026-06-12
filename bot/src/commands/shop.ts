import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getShopInventory, getShops } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Search shops and inspect shop inventory')
  .addStringOption((opt) => opt.setName('search').setDescription('Shop or location name').setRequired(true))
  .addBooleanOption((opt) => opt.setName('inventory').setDescription('Show inventory for the first matching shop').setRequired(false));

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
      const inventory = await getShopInventory(shop.id);
      const lines = (inventory.data ?? []).slice(0, 12).map((item, index) => {
        const name = item.itemName ?? item.name ?? 'Unknown item';
        const price = item.price ?? item.buyPrice ?? item.sellPrice ?? item.basePrice;
        const details = [item.type, item.subType, price != null ? `${format(price)} aUEC` : null].filter(Boolean).join(' - ');
        return `**${index + 1}. ${name}**${details ? `\n${details}` : ''}`;
      });
      await interaction.editReply({
        embeds: [embed(`${shop.name} inventory`, lines.join('\n\n') || 'No inventory item found.')],
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
    .setFooter({ text: 'Starvis - Shop data' });
}

function format(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function countLabel(value?: number): string | null {
  return value != null ? `${value} items` : null;
}
