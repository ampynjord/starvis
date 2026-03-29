import { REST, Routes } from 'discord.js';
import { commands } from './commands/index.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID');
  process.exit(1);
}

const rest = new REST().setToken(token);
const body = commands.map((c) => c.data.toJSON());

console.log(`Deploying ${body.length} slash commands…`);

const route = process.env.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(clientId, process.env.DISCORD_GUILD_ID)
  : Routes.applicationCommands(clientId);

await rest.put(route, { body });
console.log('Slash commands deployed.');
