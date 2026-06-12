import type { Client, PresenceStatusData } from 'discord.js';
import { ActivityType } from 'discord.js';

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 15_000;

function presenceIntervalMs() {
  const raw = Number(process.env.DISCORD_PRESENCE_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_INTERVAL_MS;
  return Math.max(raw, MIN_INTERVAL_MS);
}

function presenceStatus(): PresenceStatusData {
  const raw = process.env.DISCORD_PRESENCE_STATUS?.trim().toLowerCase();
  if (raw === 'idle' || raw === 'dnd' || raw === 'invisible') return raw;
  return 'online';
}

export function startRichPresence(client: Client<true>, commandCount: number) {
  const intervalMs = presenceIntervalMs();
  const status = presenceStatus();
  let index = 0;

  const activities = [
    { name: 'Star Citizen data', type: ActivityType.Watching },
    { name: '/starvis questions', type: ActivityType.Listening },
    { name: `/intel for ${commandCount} commands`, type: ActivityType.Playing },
    { name: 'API and data status', type: ActivityType.Watching },
    { name: `${client.guilds.cache.size} Starvis server${client.guilds.cache.size > 1 ? 's' : ''}`, type: ActivityType.Watching },
  ];

  const applyPresence = () => {
    client.user.setPresence({
      status,
      activities: [activities[index % activities.length]],
    });
    index++;
  };

  applyPresence();
  const timer = setInterval(applyPresence, intervalMs);
  return () => clearInterval(timer);
}
