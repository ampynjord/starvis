import { NextResponse } from 'next/server';
import {
  buildDiscordInviteUrl,
  DISCORD_BOT_COMMANDS,
  getDiscordClientId,
  getDiscordGuildId,
  getDiscordServerInviteUrl,
} from '@/lib/discordBot';

export async function GET() {
  const clientId = getDiscordClientId();
  return NextResponse.json({
    success: true,
    data: {
      configured: Boolean(clientId),
      clientId: clientId || null,
      guildId: getDiscordGuildId() || null,
      inviteUrl: buildDiscordInviteUrl(clientId),
      serverInviteUrl: getDiscordServerInviteUrl() || null,
      commandCount: DISCORD_BOT_COMMANDS.length,
      commands: DISCORD_BOT_COMMANDS.map((command) => ({
        name: command.name,
        category: command.category,
        description: command.description,
      })),
    },
  });
}
