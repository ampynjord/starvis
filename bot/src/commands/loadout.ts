import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getShipLoadout, getShips, getShipsAutocomplete } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('loadout')
  .setDescription("Display a ship's default loadout")
  .addStringOption((opt) =>
    opt.setName('ship').setDescription('Ship name (e.g. Hornet F7C, Carrack)').setRequired(true).setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const choices = await getShipsAutocomplete(focused);
  await interaction.respond(choices.slice(0, 25));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('ship', true);
  await interaction.deferReply();

  try {
    // Resolve ship UUID first
    const res = await getShips(name);
    const ship = res.data?.[0];

    if (!ship?.uuid) {
      await interaction.editReply({ embeds: [errorEmbed(`Ship not found: "${name}"`)] });
      return;
    }

    const loadoutRes = await getShipLoadout(ship.uuid);

    if (!loadoutRes.success || !loadoutRes.data?.ports?.length) {
      await interaction.editReply({ embeds: [errorEmbed(`No loadout available for ${ship.name}.`)] });
      return;
    }

    const ports = loadoutRes.data.ports;

    // Group by port type
    const byType: Record<string, typeof ports> = {};
    for (const port of ports) {
      const t = port.port_type ?? 'Other';
      if (!byType[t]) byType[t] = [];
      byType[t].push(port);
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`🔧 Loadout — ${ship.name}`)
      .setURL(`${SITE_URL}/ships/${ship.uuid}`)
      .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });

    const fields: { name: string; value: string; inline: boolean }[] = [];

    for (const [type, typePorts] of Object.entries(byType).slice(0, 10)) {
      const lines = typePorts
        .slice(0, 8)
        .map((p) => {
          const comp = p.component_name ? `**${p.component_name}**` : '_empty_';
          const size = p.min_size != null ? ` S${p.min_size}${p.max_size !== p.min_size ? `–${p.max_size}` : ''}` : '';
          return `• ${p.port_name}${size}: ${comp}`;
        })
        .join('\n');

      if (lines) fields.push({ name: `⚙️ ${type}`, value: lines, inline: false });
    }

    if (fields.length === 0) {
      embed.setDescription('No loadout port found.');
    } else {
      embed.addFields(fields);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
