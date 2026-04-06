import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getShipLoadout, getShips } from '../api.js';
import { errorEmbed } from '../embeds.js';

const SITE_URL = process.env.SITE_URL || 'https://starvis.ampynjord.bzh';

export const data = new SlashCommandBuilder()
  .setName('loadout')
  .setDescription('Afficher le loadout par défaut d\'un vaisseau')
  .addStringOption((opt) =>
    opt.setName('vaisseau').setDescription('Nom du vaisseau (ex: Hornet F7C, Carrack)').setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('vaisseau', true);
  await interaction.deferReply();

  try {
    // Resolve ship UUID first
    const res = await getShips(name);
    const ship = res.data?.[0];

    if (!ship || !ship.uuid) {
      await interaction.editReply({ embeds: [errorEmbed(`Vaisseau introuvable : « ${name} »`)] });
      return;
    }

    const loadoutRes = await getShipLoadout(ship.uuid);

    if (!loadoutRes.success || !loadoutRes.data?.ports?.length) {
      await interaction.editReply({ embeds: [errorEmbed(`Aucun loadout disponible pour ${ship.name}.`)] });
      return;
    }

    const ports = loadoutRes.data.ports;

    // Group by port type
    const byType: Record<string, typeof ports> = {};
    for (const port of ports) {
      const t = port.port_type ?? 'Autre';
      (byType[t] ??= []).push(port);
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`🔧 Loadout — ${ship.name}`)
      .setURL(`${SITE_URL}/ships`)
      .setFooter({ text: 'Starvis — Star Citizen Database' });

    const fields: { name: string; value: string; inline: boolean }[] = [];

    for (const [type, typePorts] of Object.entries(byType).slice(0, 10)) {
      const lines = typePorts
        .slice(0, 8)
        .map((p) => {
          const comp = p.component_name ? `**${p.component_name}**` : '_vide_';
          const size = p.min_size != null ? ` S${p.min_size}${p.max_size !== p.min_size ? `–${p.max_size}` : ''}` : '';
          return `• ${p.port_name}${size}: ${comp}`;
        })
        .join('\n');

      if (lines) fields.push({ name: `⚙️ ${type}`, value: lines, inline: false });
    }

    if (fields.length === 0) {
      embed.setDescription('Aucun port de loadout trouvé.');
    } else {
      embed.addFields(fields);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
