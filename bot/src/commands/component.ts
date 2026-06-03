import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getComponents } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('component')
  .setDescription('Search a ship component')
  .addStringOption((opt) => opt.setName('name').setDescription('Component name, e.g. CF-557 or VK-00').setRequired(true))
  .addStringOption((opt) =>
    opt
      .setName('type')
      .setDescription('Optional component type filter')
      .setRequired(false)
      .addChoices(
        { name: 'Weapon', value: 'WeaponGun' },
        { name: 'Missile', value: 'Missile' },
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
  const type = interaction.options.getString('type') ?? undefined;
  await interaction.deferReply();

  try {
    const res = await getComponents(name, type);
    if (!res.data?.length) {
      await interaction.editReply({ embeds: [errorEmbed(`No component found for "${name}".`)] });
      return;
    }

    const comp = res.data[0];
    const stats = [
      comp.type ? `Type: **${comp.type}**` : null,
      comp.sub_type ? `Subtype: **${comp.sub_type}**` : null,
      comp.size != null ? `Size: **S${comp.size}**` : null,
      comp.grade ? `Grade: **${comp.grade}**` : null,
      (comp.manufacturer_name ?? comp.manufacturer) ? `Manufacturer: **${comp.manufacturer_name ?? comp.manufacturer}**` : null,
      comp.weapon_dps ? `DPS: **${format(comp.weapon_dps)}**` : null,
      comp.shield_hp ? `Shield HP: **${format(comp.shield_hp)}**` : null,
      comp.qd_speed ? `QD speed: **${format(comp.qd_speed, 'm/s')}**` : null,
      comp.cooling_rate ? `Cooling: **${format(comp.cooling_rate)}**` : null,
      comp.power_output ? `Power output: **${format(comp.power_output)}**` : null,
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(comp.name)
      .setURL(`${SITE_URL}/components/${comp.uuid}`)
      .setDescription(stats.join('\n') || 'No detailed stats available.')
      .setFooter({ text: 'Starvis - Component data' });

    if (res.data.length > 1) {
      embed.addFields({
        name: `Other matches (${res.data.length - 1})`,
        value: res.data
          .slice(1)
          .map((c) => `${c.name}${c.type ? ` - ${c.type}` : ''}${c.size != null ? ` S${c.size}` : ''}`)
          .join('\n'),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}

function format(value: number, unit = ''): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
}
