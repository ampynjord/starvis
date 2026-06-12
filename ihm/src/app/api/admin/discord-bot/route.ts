import { NextResponse } from 'next/server';
import { buildDiscordInviteUrl, DISCORD_BOT_COMMANDS, getDiscordClientId } from '@/lib/discordBot';

export async function GET() {
  const clientId = getDiscordClientId();
  return NextResponse.json({
    success: true,
    data: {
      configured: Boolean(clientId),
      clientId: clientId || null,
      inviteUrl: buildDiscordInviteUrl(clientId),
      commandCount: DISCORD_BOT_COMMANDS.length,
      commands: DISCORD_BOT_COMMANDS.map((command) => ({
        name: command.name,
        category: command.category,
        description: command.description,
      })),
    },
  });
}
