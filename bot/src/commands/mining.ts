import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getMiningCompositions, getMiningElements, getMiningLasers, getMiningStats } from '../api.js';
import { SITE_URL } from '../config.js';
import { errorEmbed } from '../embeds.js';

export const data = new SlashCommandBuilder()
  .setName('mining')
  .setDescription('Explore mining elements, rocks and laser heads')
  .addStringOption((opt) =>
    opt
      .setName('view')
      .setDescription('Mining data to show')
      .setRequired(true)
      .addChoices(
        { name: 'Stats overview', value: 'stats' },
        { name: 'Most valuable elements', value: 'elements' },
        { name: 'Rock compositions', value: 'rocks' },
        { name: 'Mining lasers', value: 'lasers' },
      ),
  )
  .addStringOption((opt) => opt.setName('search').setDescription('Optional rock or element search').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const view = interaction.options.getString('view', true);
  const search = interaction.options.getString('search') ?? undefined;
  await interaction.deferReply();

  try {
    if (view === 'stats') {
      const res = await getMiningStats();
      const lines = Object.entries(res.data ?? {}).map(([key, value]) => `**${humanize(key)}:** ${format(value)}`);
      await interaction.editReply({ embeds: [baseEmbed('Mining overview', lines.join('\n') || 'No mining stats available.')] });
      return;
    }

    if (view === 'elements') {
      const res = await getMiningElements();
      const needle = search?.toLowerCase();
      const elements = (res.data ?? [])
        .filter((e) => !needle || e.name.toLowerCase().includes(needle) || e.symbol?.toLowerCase().includes(needle))
        .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
        .slice(0, 10);
      const lines = elements.map((e, index) => {
        const details = [e.symbol, e.type, e.rarity, e.value != null ? `${format(e.value)} aUEC` : null].filter(Boolean).join(' - ');
        return `**${index + 1}. ${e.name}**${details ? `\n${details}` : ''}`;
      });
      await interaction.editReply({ embeds: [baseEmbed('Mining elements', lines.join('\n\n') || 'No element found.')] });
      return;
    }

    if (view === 'rocks') {
      const res = await getMiningCompositions(search);
      const lines = (res.data ?? []).slice(0, 8).map((rock, index) => {
        const name = rock.displayName ?? rock.name;
        const details = [rock.type, rock.partCount != null ? `${rock.partCount} parts` : null].filter(Boolean).join(' - ');
        const minerals = (rock.elements ?? [])
          .slice(0, 4)
          .map((e) => `${e.name ?? e.symbol ?? 'mineral'}${e.percentage != null ? ` ${format(e.percentage)}%` : ''}`)
          .join(', ');
        return `**${index + 1}. ${name}**${details ? `\n${details}` : ''}${minerals ? `\n${minerals}` : ''}`;
      });
      await interaction.editReply({ embeds: [baseEmbed('Rock compositions', lines.join('\n\n') || 'No rock found.')] });
      return;
    }

    const res = await getMiningLasers();
    const lasers = (res.data ?? []).sort((a, b) => Number(b.miningSpeed ?? 0) - Number(a.miningSpeed ?? 0)).slice(0, 10);
    const lines = lasers.map((laser, index) => {
      const stats = [
        laser.size != null ? `S${laser.size}` : null,
        laser.grade ? `Grade ${laser.grade}` : null,
        laser.miningSpeed != null ? `speed ${format(laser.miningSpeed)}` : null,
        laser.miningRange != null ? `range ${format(laser.miningRange)} m` : null,
      ].filter(Boolean);
      return `**${index + 1}. ${laser.name}**\n${stats.join(' - ') || 'No detailed stats'}`;
    });
    await interaction.editReply({ embeds: [baseEmbed('Mining lasers', lines.join('\n\n') || 'No mining laser found.')] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}

function baseEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(title)
    .setURL(`${SITE_URL}/mining`)
    .setDescription(description.slice(0, 3900))
    .setFooter({ text: 'Starvis - Star Citizen Database & Toolset' });
}

function format(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function humanize(key: string): string {
  return key.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
