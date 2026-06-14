import type { AutocompleteInteraction, ChatInputCommandInteraction, Guild, GuildMember, Interaction, Role } from 'discord.js';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { commands } from './commands/index.js';
import { DISCORD_DEFAULT_MEMBER_ROLE_ID, DISCORD_DEFAULT_MEMBER_ROLE_NAME } from './config.js';
import { errorEmbed } from './embeds.js';
import { startRichPresence } from './presence.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.log('DISCORD_TOKEN not set - bot disabled (set it in .env.dev to enable)');
  process.exit(0);
}

const intents: GatewayIntentBits[] = [GatewayIntentBits.Guilds];
if (DISCORD_DEFAULT_MEMBER_ROLE_ID || DISCORD_DEFAULT_MEMBER_ROLE_NAME) {
  intents.push(GatewayIntentBits.GuildMembers);
}

const client = new Client({ intents });
let stopRichPresence: (() => void) | undefined;

// Build command map for lookup
const commandMap = new Map(commands.map((c) => [c.data.name, c]));

client.once(Events.ClientReady, (c) => {
  stopRichPresence = startRichPresence(c, commandMap.size);
  console.log(`Starvis Bot connected as ${c.user.tag}`);
  console.log(`   Serving ${commandMap.size} commands in ${c.guilds.cache.size} server(s)`);
  if (DISCORD_DEFAULT_MEMBER_ROLE_ID || DISCORD_DEFAULT_MEMBER_ROLE_NAME) {
    console.log(`   Default member role enabled: ${DISCORD_DEFAULT_MEMBER_ROLE_ID || DISCORD_DEFAULT_MEMBER_ROLE_NAME}`);
  }
});

async function resolveDefaultMemberRole(guild: Guild): Promise<Role | null> {
  if (DISCORD_DEFAULT_MEMBER_ROLE_ID) {
    return (
      guild.roles.cache.get(DISCORD_DEFAULT_MEMBER_ROLE_ID) ?? (await guild.roles.fetch(DISCORD_DEFAULT_MEMBER_ROLE_ID).catch(() => null))
    );
  }

  if (!DISCORD_DEFAULT_MEMBER_ROLE_NAME) return null;

  const roles = guild.roles.cache.size > 1 ? guild.roles.cache : await guild.roles.fetch();
  const roleName = DISCORD_DEFAULT_MEMBER_ROLE_NAME.toLowerCase();
  return roles.find((role) => !role.managed && role.name.toLowerCase() === roleName) ?? null;
}

client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
  try {
    const role = await resolveDefaultMemberRole(member.guild);
    if (!role) {
      console.warn(`Default member role not found in guild ${member.guild.id}`);
      return;
    }

    if (member.roles.cache.has(role.id)) return;

    await member.roles.add(role, 'Starvis default member role for new arrivals');
    console.log(`Assigned ${role.name} role to ${member.user.tag} in ${member.guild.name}`);
  } catch (err) {
    console.error(`Failed to assign default member role to ${member.user.tag}:`, err);
  }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // Autocomplete
  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName) as { autocomplete?: (i: AutocompleteInteraction) => Promise<void> } | undefined;
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction as AutocompleteInteraction);
      } catch (err) {
        console.error(`Autocomplete /${interaction.commandName} failed:`, err);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction as ChatInputCommandInteraction);
  } catch (err) {
    console.error(`Command /${interaction.commandName} failed:`, err);
    const reply = { embeds: [errorEmbed('An internal error occurred.')], ephemeral: true };
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
    console.log(`\n${signal} received - shutting down...`);
    stopRichPresence?.();
    client.destroy();
    process.exit(0);
  });
}

await client.login(token);
