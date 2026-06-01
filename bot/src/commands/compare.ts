import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { compareShips, getShips, getShipsAutocomplete } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

const COMPARE_FIELDS: Array<{ key: string; label: string; unit?: string; higherIsBetter?: boolean }> = [
  { key: 'scm_speed', label: '?? SCM', unit: 'm/s', higherIsBetter: true },
  { key: 'max_speed', label: '?? Vitesse max', unit: 'm/s', higherIsBetter: true },
  { key: 'shield_hp', label: '??? Bouclier', unit: 'HP', higherIsBetter: true },
  { key: 'total_hp', label: '?? HP', unit: '', higherIsBetter: true },
  { key: 'cargo_capacity', label: '?? Cargo', unit: 'SCU', higherIsBetter: true },
  { key: 'weapon_damage_total', label: '?? DPS Armes', unit: '', higherIsBetter: true },
  { key: 'missile_damage_total', label: '?? DMG Missiles', unit: '', higherIsBetter: true },
  { key: 'mass', label: '?? Masse', unit: 'kg', higherIsBetter: false },
  { key: 'crew_size', label: '?? �quipage', unit: '', higherIsBetter: false },
];

export const data = new SlashCommandBuilder()
  .setName('compare')
  .setDescription('Comparer deux vaisseaux c�te � c�te')
  .addStringOption((opt) =>
    opt.setName('vaisseau1').setDescription('Premier vaisseau (ex: Hornet F7C)').setRequired(true).setAutocomplete(true),
  )
  .addStringOption((opt) =>
    opt.setName('vaisseau2').setDescription('Deuxi�me vaisseau (ex: Arrow)').setRequired(true).setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name === 'vaisseau1' || focused.name === 'vaisseau2') {
    const choices = await getShipsAutocomplete(focused.value);
    await interaction.respond(choices.slice(0, 25));
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name1 = interaction.options.getString('vaisseau1', true);
  const name2 = interaction.options.getString('vaisseau2', true);
  await interaction.deferReply();

  try {
    const [res1, res2] = await Promise.all([getShips(name1), getShips(name2)]);

    const ship1 = res1.data?.[0];
    const ship2 = res2.data?.[0];

    if (!ship1) {
      await interaction.editReply({ embeds: [errorEmbed(`Vaisseau introuvable : � ${name1} �`)] });
      return;
    }
    if (!ship2) {
      await interaction.editReply({ embeds: [errorEmbed(`Vaisseau introuvable : � ${name2} �`)] });
      return;
    }

    // Try dedicated compare endpoint (richer diff); fall back to client-side diff
    let diff: Record<string, { ship1: unknown; ship2: unknown; winner: 1 | 2 | null }> | null = null;
    if (ship1.uuid && ship2.uuid) {
      try {
        const cmp = await compareShips(ship1.uuid, ship2.uuid);
        if (cmp.success) diff = cmp.data.diff;
      } catch {
        // Fall through to client-side comparison
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`?? ${ship1.name} vs ${ship2.name}`)
      .setURL(`${SITE_URL}/ships`)
      .setFooter({ text: 'Starvis � Star Citizen Database' });

    const fields: { name: string; value: string; inline: boolean }[] = [
      { name: '?? Vaisseau 1', value: `**${ship1.name}**`, inline: true },
      { name: '\u200b', value: '**VS**', inline: true },
      { name: '?? Vaisseau 2', value: `**${ship2.name}**`, inline: true },
    ];

    for (const { key, label, unit, higherIsBetter } of COMPARE_FIELDS) {
      let v1: number | undefined;
      let v2: number | undefined;

      if (diff?.[key]) {
        v1 = diff[key].ship1 as number | undefined;
        v2 = diff[key].ship2 as number | undefined;
      } else {
        v1 = (ship1 as unknown as Record<string, unknown>)[key] as number | undefined;
        v2 = (ship2 as unknown as Record<string, unknown>)[key] as number | undefined;
      }

      if (v1 == null && v2 == null) continue;

      const fmt = (v: number | undefined) => (v == null ? '�' : `${v.toLocaleString('fr-FR')}${unit ? ` ${unit}` : ''}`);

      let winner = '';
      if (v1 != null && v2 != null && v1 !== v2) {
        const v1Wins = higherIsBetter !== false ? v1 > v2 : v1 < v2;
        winner = v1Wins ? '? ??' : '?? ?';
      }

      fields.push({ name: label, value: `${fmt(v1)} ${winner} ${fmt(v2)}`, inline: false });
    }

    embed.addFields(fields);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
