import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { compareShips, getShips, getShipsAutocomplete } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

const COMPARE_FIELDS: Array<{ key: string; label: string; unit?: string; higherIsBetter?: boolean }> = [
  { key: 'scm_speed', label: 'SCM speed', unit: 'm/s', higherIsBetter: true },
  { key: 'max_speed', label: 'Max speed', unit: 'm/s', higherIsBetter: true },
  { key: 'shield_hp', label: 'Shield HP', unit: 'HP', higherIsBetter: true },
  { key: 'total_hp', label: 'Hull HP', unit: 'HP', higherIsBetter: true },
  { key: 'cargo_capacity', label: 'Cargo', unit: 'SCU', higherIsBetter: true },
  { key: 'weapon_damage_total', label: 'Weapon DPS', unit: 'DPS', higherIsBetter: true },
  { key: 'missile_damage_total', label: 'Missile damage', unit: '', higherIsBetter: true },
  { key: 'mass', label: 'Mass', unit: 'kg', higherIsBetter: false },
  { key: 'crew_size', label: 'Crew', unit: '', higherIsBetter: false },
];

export const data = new SlashCommandBuilder()
  .setName('compare')
  .setDescription('Compare two ships side by side')
  .addStringOption((opt) => opt.setName('ship1').setDescription('First ship, e.g. Hornet F7C').setRequired(true).setAutocomplete(true))
  .addStringOption((opt) => opt.setName('ship2').setDescription('Second ship, e.g. Arrow').setRequired(true).setAutocomplete(true));

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name === 'ship1' || focused.name === 'ship2') {
    const choices = await getShipsAutocomplete(focused.value);
    await interaction.respond(choices.slice(0, 25));
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name1 = interaction.options.getString('ship1', true);
  const name2 = interaction.options.getString('ship2', true);
  await interaction.deferReply();

  try {
    const [res1, res2] = await Promise.all([getShips(name1), getShips(name2)]);
    const ship1 = res1.data?.[0];
    const ship2 = res2.data?.[0];

    if (!ship1) return void interaction.editReply({ embeds: [errorEmbed(`Ship not found: ${name1}`)] });
    if (!ship2) return void interaction.editReply({ embeds: [errorEmbed(`Ship not found: ${name2}`)] });

    let diff: Record<string, { ship1: unknown; ship2: unknown; winner: 1 | 2 | null }> | null = null;
    if (ship1.uuid && ship2.uuid) {
      try {
        const cmp = await compareShips(ship1.uuid, ship2.uuid);
        if (cmp.success) diff = cmp.data.diff;
      } catch {
        diff = null;
      }
    }

    const lines = COMPARE_FIELDS.map((field) =>
      formatComparison(field, ship1 as unknown as Record<string, unknown>, ship2 as unknown as Record<string, unknown>, diff),
    ).filter((line): line is string => Boolean(line));
    const summary = summarize(lines, ship1.name, ship2.name);

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`${ship1.name} vs ${ship2.name}`)
      .setURL(`${SITE_URL}/compare`)
      .setDescription(summary)
      .addFields({ name: 'Scorecard', value: lines.join('\n') || 'No comparable stats available.', inline: false })
      .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}

function formatComparison(
  field: (typeof COMPARE_FIELDS)[number],
  ship1: Record<string, unknown>,
  ship2: Record<string, unknown>,
  diff: Record<string, { ship1: unknown; ship2: unknown; winner: 1 | 2 | null }> | null,
): string | null {
  const raw1 = diff?.[field.key]?.ship1 ?? ship1[field.key];
  const raw2 = diff?.[field.key]?.ship2 ?? ship2[field.key];
  const v1 = Number(raw1);
  const v2 = Number(raw2);
  if (!Number.isFinite(v1) && !Number.isFinite(v2)) return null;

  let winner = 'even';
  if (Number.isFinite(v1) && Number.isFinite(v2) && v1 !== v2) {
    const firstWins = field.higherIsBetter !== false ? v1 > v2 : v1 < v2;
    winner = firstWins ? 'ship1' : 'ship2';
  }

  return `${field.label}: ${fmt(v1, field.unit)} | ${fmt(v2, field.unit)} (${winner})`;
}

function summarize(lines: string[], ship1: string, ship2: string): string {
  let wins1 = 0;
  let wins2 = 0;
  for (const line of lines) {
    if (line.endsWith('(ship1)')) wins1++;
    if (line.endsWith('(ship2)')) wins2++;
  }
  if (wins1 === wins2) return `Close match: **${ship1}** and **${ship2}** trade advantages depending on the role.`;
  const winner = wins1 > wins2 ? ship1 : ship2;
  return `Stat advantage: **${winner}** wins more compared categories (${Math.max(wins1, wins2)} vs ${Math.min(wins1, wins2)}).`;
}

function fmt(value: number, unit = ''): string {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
}
