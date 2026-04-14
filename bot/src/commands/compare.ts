import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getShips } from '../api.js';
import { errorEmbed } from '../embeds.js';

const SITE_URL = process.env.SITE_URL || 'https://starvis.ampynjord.bzh';

export const data = new SlashCommandBuilder()
  .setName('compare')
  .setDescription('Comparer deux vaisseaux côte à côte')
  .addStringOption((opt) => opt.setName('vaisseau1').setDescription('Premier vaisseau (ex: Hornet F7C)').setRequired(true))
  .addStringOption((opt) => opt.setName('vaisseau2').setDescription('Deuxième vaisseau (ex: Arrow)').setRequired(true));

const COMPARE_FIELDS: Array<{ key: string; label: string; unit?: string }> = [
  { key: 'scm_speed', label: '🚀 SCM', unit: 'm/s' },
  { key: 'max_speed', label: '💨 Max', unit: 'm/s' },
  { key: 'shield_hp', label: '🛡️ Bouclier', unit: 'HP' },
  { key: 'total_hp', label: '❤️ HP', unit: '' },
  { key: 'cargo_capacity', label: '📦 Cargo', unit: 'SCU' },
  { key: 'weapon_damage_total', label: '🔫 DPS Armes', unit: '' },
  { key: 'missile_damage_total', label: '🚀 DMG Missiles', unit: '' },
  { key: 'mass', label: '⚖️ Masse', unit: 'kg' },
  { key: 'crew_size', label: '👥 Équipage', unit: '' },
];

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name1 = interaction.options.getString('vaisseau1', true);
  const name2 = interaction.options.getString('vaisseau2', true);
  await interaction.deferReply();

  try {
    // Resolve UUIDs from ship names
    const [res1, res2] = await Promise.all([getShips(name1), getShips(name2)]);

    const ship1 = res1.data?.[0];
    const ship2 = res2.data?.[0];

    if (!ship1) {
      await interaction.editReply({ embeds: [errorEmbed(`Vaisseau introuvable : « ${name1} »`)] });
      return;
    }
    if (!ship2) {
      await interaction.editReply({ embeds: [errorEmbed(`Vaisseau introuvable : « ${name2} »`)] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`⚔️ ${ship1.name} vs ${ship2.name}`)
      .setURL(SITE_URL)
      .setFooter({ text: 'Starvis — Star Citizen Database' });

    const fields: { name: string; value: string; inline: boolean }[] = [
      { name: '🚀 Vaisseau 1', value: ship1.name, inline: true },
      { name: '\u200b', value: 'VS', inline: true },
      { name: '🚀 Vaisseau 2', value: ship2.name, inline: true },
    ];

    for (const { key, label, unit } of COMPARE_FIELDS) {
      const v1 = (ship1 as unknown as Record<string, unknown>)[key] as number | undefined;
      const v2 = (ship2 as unknown as Record<string, unknown>)[key] as number | undefined;

      if (v1 == null && v2 == null) continue;

      const fmt = (v: number | undefined) => (v == null ? '—' : `${v.toLocaleString('fr-FR')}${unit ? ` ${unit}` : ''}`);

      const winner = v1 != null && v2 != null ? (v1 > v2 ? '← 🏆' : v1 < v2 ? '🏆 →' : '=') : '';

      fields.push({
        name: label,
        value: `${fmt(v1)} ${winner} ${fmt(v2)}`,
        inline: false,
      });
    }

    embed.addFields(fields);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
