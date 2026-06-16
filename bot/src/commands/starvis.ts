import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { chatAsk } from '../api.js';
import { ADMIN_API_KEY } from '../config.js';

const DISCORD_REPLY_HINT =
  'Answer for Discord embeds. Be concise, structured and data-driven. Never use markdown tables or code-block tables because Discord wraps them badly. Use short headings and bullet lists. For multiple records, use one bullet per record with the name in bold and only the most useful stats. Mention uncertainty when data is missing. When a specialized command would be better, suggest it explicitly: /ship, /compare, /loadout, /component, /item, /commodity, /paint, /trade, /shop, /mining, /crafting, /mission, /location, /faction, /lore, /manufacturers, /search, /top, /version, /changelog or /status.';

export const data = new SlashCommandBuilder()
  .setName('starvis')
  .setDescription('Ask Starvis AI about ships, loadouts, missions, trade, lore or game data')
  .addStringOption((opt) => opt.setName('question').setDescription('Your Star Citizen question').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString('question', true);
  await interaction.deferReply();

  if (!ADMIN_API_KEY) {
    await interaction.editReply({ embeds: [errorEmbed('ADMIN_API_KEY is not configured on the bot.')] });
    return;
  }

  try {
    const rawReply = await chatAsk([{ role: 'user', content: `${DISCORD_REPLY_HINT}\n\nQuestion: ${question}` }]);
    const reply = formatDiscordAnswer(rawReply);
    const chunks = splitDiscordText(reply, 3900);

    await interaction.editReply({
      embeds: [answerEmbed(chunks[0], question, chunks.length > 1 ? `Part 1/${chunks.length}` : undefined)],
    });

    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ embeds: [answerEmbed(chunks[i], question, `Part ${i + 1}/${chunks.length}`)] });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply({ embeds: [errorEmbed(msg.slice(0, 500))] });
  }
}

function answerEmbed(text: string, question: string, label?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x00d4ff)
    .setAuthor({ name: label ? `Starvis - ${label}` : 'Starvis' })
    .setDescription(text || 'No answer returned.')
    .setFooter({ text: `Q: ${question.slice(0, 120)}` });
}

function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xed4245).setTitle('Starvis error').setDescription(message);
}

function formatDiscordAnswer(text: string): string {
  return convertPipeTablesToBullets(convertFencedTablesToBullets(text)).trim();
}

function convertFencedTablesToBullets(text: string): string {
  return text.replace(/```(?:\w+)?\n([\s\S]*?)```/g, (block, content: string) => {
    const bullets = tableToBullets(content);
    return bullets ?? block;
  });
}

function convertPipeTablesToBullets(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let table: string[] = [];

  const flushTable = () => {
    if (!table.length) return;
    const bullets = tableToBullets(table.join('\n'));
    out.push(bullets ?? table.join('\n'));
    table = [];
  };

  for (const line of lines) {
    if (line.includes('|')) {
      table.push(line);
      continue;
    }
    flushTable();
    out.push(line);
  }

  flushTable();
  return out.join('\n');
}

function tableToBullets(rawTable: string): string | null {
  const rows = rawTable
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('|') && !/^[\s|:-]+$/.test(line))
    .map(splitTableRow)
    .filter((cells) => cells.length >= 2);

  if (rows.length < 2) return null;

  const [headers, ...dataRows] = rows;
  if (dataRows.length === 0) return null;

  return dataRows
    .map((row) => {
      const name = row[0] || 'Item';
      const details = row
        .slice(1)
        .map((value, index) => ({ label: headers[index + 1] ?? `Stat ${index + 1}`, value }))
        .filter(({ value }) => value && value !== '-' && value !== 'N/A')
        .slice(0, 6)
        .map(({ label, value }) => `${label}: ${value}`)
        .join('; ');

      return details ? `- **${name}** - ${details}` : `- **${name}**`;
    })
    .join('\n');
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutOuterPipes = trimmed.startsWith('|') && trimmed.endsWith('|') ? trimmed.slice(1, -1) : trimmed;
  return withoutOuterPipes
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function splitDiscordText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    const paragraphCut = remaining.lastIndexOf('\n\n', maxLen);
    const lineCut = remaining.lastIndexOf('\n', maxLen);
    const spaceCut = remaining.lastIndexOf(' ', maxLen);
    const cut = Math.max(paragraphCut, lineCut, spaceCut, Math.floor(maxLen * 0.75));
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}
