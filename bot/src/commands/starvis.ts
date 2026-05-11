import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { chatAsk } from '../api.js';

const API_TOKEN = process.env.API_TOKEN ?? '';

export const data = new SlashCommandBuilder()
  .setName('starvis')
  .setDescription('Ask Starvis, the Star Citizen AI (ships, missions, trade, lore…)')
  .addStringOption((opt) => opt.setName('question').setDescription('Your question in natural language').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString('question', true);

  await interaction.deferReply();

  if (!API_TOKEN) {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ API_TOKEN not configured on the bot.')],
    });
    return;
  }

  try {
    const reply = await chatAsk([{ role: 'user', content: question }], API_TOKEN);

    const chunks = splitText(reply, 4000);

    const embed = new EmbedBuilder()
      .setColor(0x00d4ff)
      .setAuthor({ name: 'Starvis — Star Citizen AI' })
      .setDescription(chunks[0])
      .setFooter({ text: `Question: ${question.slice(0, 100)}` });

    await interaction.editReply({ embeds: [embed] });

    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({
        embeds: [new EmbedBuilder().setColor(0x00d4ff).setDescription(chunk)],
      });
    }
  } catch (e: any) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('Starvis Error')
          .setDescription(e.message?.slice(0, 300) ?? 'Unknown error'),
      ],
    });
  }
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }
    const cut = remaining.lastIndexOf('\n', maxLen);
    const pos = cut > 0 ? cut : maxLen;
    parts.push(remaining.slice(0, pos));
    remaining = remaining.slice(pos).trimStart();
  }
  return parts;
}
