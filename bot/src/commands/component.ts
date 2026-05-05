import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getComponents } from '../api.js';
import { errorEmbed } from '../embeds.js';

const COLORS = { component: 0x9b59b6 } as const;
const SITE_URL = process.env.SITE_URL || 'https://starvis.ampynjord.bzh';

export const data = new SlashCommandBuilder()
  .setName('component')
  .setDescription('Rechercher un composant vaisseau (arme, bouclier, moteur…)')
  .addStringOption((opt) => opt.setName('nom').setDescription('Nom du composant (ex: CF-557, 9-Series Longsword)').setRequired(true))
  .addStringOption((opt) =>
    opt
      .setName('type')
      .setDescription('Type de composant')
      .setRequired(false)
      .addChoices(
        { name: 'Arme', value: 'WeaponGun' },
        { name: 'Missile', value: 'WeaponMissile' },
        { name: 'Rack à missiles', value: 'MissileRack' },
        { name: 'Bouclier', value: 'Shield' },
        { name: 'Moteur QD', value: 'QuantumDrive' },
        { name: 'Refroidisseur', value: 'Cooler' },
        { name: 'Générateur', value: 'PowerPlant' },
        { name: 'Radar', value: 'Radar' },
        { name: 'Pousseur', value: 'Thruster' },
        { name: 'Gimbal', value: 'Gimbal' },
        { name: 'Tourelle', value: 'Turret' },
        { name: 'Carburant', value: 'FuelTank' },
        { name: 'Mining Laser', value: 'MiningLaser' },
        { name: 'Tractor Beam', value: 'TractorBeam' },
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('nom', true);
  await interaction.deferReply();

  try {
    const res = await getComponents(name);

    if (!res.data || res.data.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed(`Aucun composant trouvé pour « ${name} ».`)] });
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
    if (comp.size != null) fields.push({ name: '📐 Taille', value: `S${comp.size}`, inline: true });
    if (comp.grade) fields.push({ name: '⭐ Grade', value: comp.grade, inline: true });
    if (comp.manufacturer) fields.push({ name: '🏭 Constructeur', value: comp.manufacturer, inline: true });

    embed.addFields(fields);

    if (res.data.length > 1) {
      const others = res.data
        .slice(1)
        .map((c) => `• ${c.name}${c.type ? ` (${c.type})` : ''}`)
        .join('\n');
      embed.addFields([{ name: `Autres résultats (${res.data.length - 1})`, value: others, inline: false }]);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
