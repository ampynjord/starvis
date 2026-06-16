import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  type Guild,
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  type Role,
} from 'discord.js';

const DEFAULT_GUILD_ID = '931662690101895198';
const OLD_CHANGELOG_MARKER = '<!-- starvis-changelog-addendum-2026-06-17 -->';
const ADDENDUM_HEADING = '**Latest addendum**';

const ADDENDUM = `${ADDENDUM_HEADING}
- 🗺️ **Starmap** : refonte visuelle complète — modèles 3D depuis les assets ARK publics, jump points en 4 composants (JumpHead, JumpTail, JumpGoTrhu, DustGoTrhu), caméra fluide, labels lisibles.
- 🪐 **Starmap** : les orbites planétaires sont toujours visibles. Cliquer sur une planète zoom dessus et affiche les orbites de ses lunes.
- 🚀 **Fleet Manager** : correction — les vaisseaux personnels ne disparaissent plus après avoir rejoint une corporation.
- 🚀 **Fleet Manager** : la vue « MY FLEET » n'affiche plus le nom de la corporation dans le header.
- 🤖 **ARIA (chat IA)** : l'endpoint \`/api/v1/chat\` est désormais restreint aux accès internes et administrateurs.`;

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function resolveEnvPath(path: string): string {
  if (isAbsolute(path) || existsSync(path)) return path;
  if (process.env.INIT_CWD) {
    const initCwdPath = join(process.env.INIT_CWD, path);
    if (existsSync(initCwdPath)) return initCwdPath;
  }
  return path;
}

function loadEnvFile(path: string): void {
  const resolvedPath = resolveEnvPath(path);
  if (!existsSync(resolvedPath)) return;

  for (const rawLine of readFileSync(resolvedPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findRole(guild: Guild, candidates: string[]): Role | null {
  const normalizedCandidates = new Set(candidates.map(normalizeName));
  return guild.roles.cache.find((role) => normalizedCandidates.has(normalizeName(role.name))) ?? null;
}

function isTextChannel(channel: GuildBasedChannel): channel is GuildTextBasedChannel {
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

function isStaffLikeChannel(channel: GuildBasedChannel): boolean {
  const normalized = normalizeName(channel.name);
  return normalized.includes('staff') || normalized.includes('team') || normalized.includes('admin');
}

function pickChangelogChannel(guild: Guild): GuildTextBasedChannel | null {
  const preferredNames = ['changelog', 'updates', 'announcements', 'devlog'];
  const channels = guild.channels.cache
    .filter((channel): channel is GuildTextBasedChannel => isTextChannel(channel) && 'messages' in channel)
    .sort((a, b) => ('position' in a ? a.position : 0) - ('position' in b ? b.position : 0));

  for (const preferredName of preferredNames) {
    const exact = channels.find((channel) => normalizeName(channel.name) === preferredName);
    if (exact) return exact;
  }

  return channels.find((channel) => preferredNames.some((name) => normalizeName(channel.name).includes(name))) ?? null;
}

function mergeAddendum(_content: string): string {
  return ADDENDUM;
}

async function updateStaffPermissions(guild: Guild, developerRole: Role): Promise<number> {
  let updated = 0;
  const categories = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory && isStaffLikeChannel(channel));

  for (const category of categories.values()) {
    if (!('permissionOverwrites' in category)) continue;

    await category.permissionOverwrites.edit(
      developerRole,
      { ViewChannel: false },
      { reason: 'Starvis Developer is an external API role, not a staff role.' },
    );
    updated += 1;

    const children = guild.channels.cache.filter((channel) => channel.parentId === category.id);
    for (const child of children.values()) {
      if (!('permissionOverwrites' in child)) continue;

      await child.permissionOverwrites.edit(
        developerRole,
        { ViewChannel: false },
        { reason: 'Starvis Developer is an external API role, not a staff role.' },
      );
      updated += 1;
    }
  }

  return updated;
}

async function updateChangelog(guild: Guild, clientUserId: string): Promise<string> {
  const changelogChannel = pickChangelogChannel(guild);
  if (!changelogChannel || !('messages' in changelogChannel)) {
    return 'No changelog-like text channel found.';
  }

  const messages = await changelogChannel.messages.fetch({ limit: 25 });
  const editableMessage = messages.find((message) => message.author.id === clientUserId && message.editable);

  if (editableMessage) {
    await editableMessage.edit({
      content: mergeAddendum(editableMessage.content),
      embeds: editableMessage.embeds,
      components: editableMessage.components,
    });
    return `Edited latest bot changelog message in #${changelogChannel.name}.`;
  }

  await changelogChannel.send(ADDENDUM);
  return `No editable bot changelog message found; posted addendum in #${changelogChannel.name}.`;
}

async function main(): Promise<void> {
  const envFile = getArg('envPath') ?? '.env.dev';
  loadEnvFile(envFile);

  const token = process.env.DISCORD_TOKEN;
  const guildId = getArg('guild') ?? process.env.DISCORD_GUILD_ID ?? process.env.NEXT_PUBLIC_DISCORD_GUILD_ID ?? DEFAULT_GUILD_ID;

  if (!token) throw new Error(`DISCORD_TOKEN is missing. Set it in ${envFile} or the current environment.`);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  await client.login(token);
  const guild = await client.guilds.fetch(guildId);
  await guild.roles.fetch();
  await guild.channels.fetch();

  const developerRole = findRole(guild, ['Developer', 'API Developer', 'External Developer']);
  if (!developerRole) throw new Error('Developer role not found in the Discord server.');

  const permissionUpdates = await updateStaffPermissions(guild, developerRole);
  const changelogResult = await updateChangelog(guild, client.user?.id ?? '');

  console.log(`Guild: ${guild.name} (${guild.id})`);
  console.log(`Developer role: ${developerRole.name} (${developerRole.id})`);
  console.log(`Staff permission overwrites updated: ${permissionUpdates}`);
  console.log(changelogResult);

  client.destroy();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
