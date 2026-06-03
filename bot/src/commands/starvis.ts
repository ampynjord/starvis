import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { chatAsk } from '../api.js';

const API_TOKEN = process.env.API_TOKEN ?? '';
const DISCORD_REPLY_HINT =
  'Answer for Discord. Be concise, structured and data-driven. Use headings only if useful. Prefer bullets and compact code-block tables. Mention uncertainty when data is missing.';

export const data = new SlashCommandBuilder()
  .setName('starvis')
  .setDescription('Ask Starvis AI about ships, loadouts, missions, trade, lore or game data')
  .addStringOption((opt) => opt.setName('question').setDescription('Your Star Citizen question').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString('question', true);
  await interaction.deferReply();

  if (!API_TOKEN) {
    await interaction.editReply({ embeds: [errorEmbed('API_TOKEN is not configured on the bot.')] });
    return;
  }

  try {
    const reply = await chatAsk([{ role: 'user', content: `${DISCORD_REPLY_HINT}\n\nQuestion: ${question}` }], API_TOKEN);
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
    .setAuthor({ name: label ? `Starvis AI - ${label}` : 'Starvis AI' })
    .setDescription(text || 'No answer returned.')
    .setFooter({ text: `Q: ${question.slice(0, 120)}` });
}

function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xed4245).setTitle('Starvis AI error').setDescription(message);
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
