import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getComponents } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

const COLORS = { component: 0x9b59b6 } as const;

export const data = new SlashCommandBuilder()
  .setName('component')
  .setDescription('Search a ship component (weapon, shield, engine…)')
  .addStringOption((opt) => opt.setName('name').setDescription('Component name (e.g. CF-557, 9-Series Longsword)').setRequired(true))
  .addStringOption((opt) =>
    opt
      .setName('type')
      .setDescription('Component type')
      .setRequired(false)
      .addChoices(
        { name: 'Weapon', value: 'WeaponGun' },
        { name: 'Missile', value: 'WeaponMissile' },
        { name: 'Missile Rack', value: 'MissileRack' },
        { name: 'Shield', value: 'Shield' },
        { name: 'Quantum Drive', value: 'QuantumDrive' },
        { name: 'Cooler', value: 'Cooler' },
        { name: 'Power Plant', value: 'PowerPlant' },
        { name: 'Radar', value: 'Radar' },
        { name: 'Thruster', value: 'Thruster' },
        { name: 'Gimbal', value: 'Gimbal' },
        { name: 'Turret', value: 'Turret' },
        { name: 'Fuel Tank', value: 'FuelTank' },
        { name: 'Mining Laser', value: 'MiningLaser' },
        { name: 'Tractor Beam', value: 'TractorBeam' },
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true);
  await interaction.deferReply();

  try {
    const res = await getComponents(name);

    if (!res.data || res.data.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed(`No component found for "${name}".`)] });
      return;
    }

    const comp = res.data[0];
    const embed = new EmbedBuilder()
      .setColor(COLORS.component)
      .setTitle(`⚙️ ${comp.name}`)
      .setURL(`${SITE_URL}/components`)
      .setFooter({ text: 'Starvis — Star Citizen Database' });

    const fields: { name: string; value: string; inline: boolean }[] = [];

    if (comp.type) fields.push({ name: '🔧 Type', value: comp.type, inline: true });
    if (comp.size != null) fields.push({ name: '📐 Size', value: `S${comp.size}`, inline: true });
    if (comp.grade) fields.push({ name: '⭐ Grade', value: comp.grade, inline: true });
    if (comp.manufacturer) fields.push({ name: '🏭 Manufacturer', value: comp.manufacturer, inline: true });

    embed.addFields(fields);

    if (res.data.length > 1) {
      const others = res.data
        .slice(1)
        .map((c) => `• ${c.name}${c.type ? ` (${c.type})` : ''}`)
        .join('\n');
      embed.addFields([{ name: `Other results (${res.data.length - 1})`, value: others, inline: false }]);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
