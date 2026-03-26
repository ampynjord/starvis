import type { ChatInputCommandInteraction, Interaction } from 'discord.js';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { commands } from './commands/index.js';
import { errorEmbed } from './embeds.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN environment variable');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Build command map for lookup
const commandMap = new Map(commands.map((c) => [c.data.name, c]));

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Starvis Bot connected as ${c.user.tag}`);
  console.log(`   Serving ${commandMap.size} commands in ${c.guilds.cache.size} server(s)`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction as ChatInputCommandInteraction);
  } catch (err) {
    console.error(`Command /${interaction.commandName} failed:`, err);
    const reply = { embeds: [errorEmbed('Une erreur interne est survenue.')], ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received — shutting down…`);
    client.destroy();
    process.exit(0);
  });
}

await client.login(token);
