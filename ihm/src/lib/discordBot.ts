export interface DiscordBotCommand {
  name: string;
  description: string;
  usage: string;
  category: 'AI' | 'Ships' | 'Items' | 'Economy' | 'Universe' | 'System';
}

export const DISCORD_BOT_COMMANDS: DiscordBotCommand[] = [
  {
    name: 'starvis',
    description: 'Ask Starvis AI about ships, loadouts, missions, trade, lore or game data.',
    usage: '/starvis question: best starter hauling ship?',
    category: 'AI',
  },
  { name: 'ship', description: 'Search for a Star Citizen ship.', usage: '/ship name: Carrack', category: 'Ships' },
  { name: 'compare', description: 'Compare two ships side by side.', usage: '/compare ship1: Hornet F7C ship2: Arrow', category: 'Ships' },
  { name: 'loadout', description: 'Show ship loadout and equipment data.', usage: '/loadout ship: Hornet F7C', category: 'Ships' },
  { name: 'component', description: 'Search a ship component.', usage: '/component name: CF-557', category: 'Items' },
  { name: 'item', description: 'Search an FPS item, weapon, armor or gadget.', usage: '/item name: P4-AR', category: 'Items' },
  { name: 'commodity', description: 'Search commodity data.', usage: '/commodity name: Laranite', category: 'Economy' },
  { name: 'paint', description: 'Search ship paints and liveries.', usage: '/paint search: Invictus', category: 'Items' },
  { name: 'trade', description: 'Find best trade routes for a cargo capacity.', usage: '/trade scu: 200', category: 'Economy' },
  { name: 'shop', description: 'Search shops and inspect inventory.', usage: '/shop search: Area18 inventory: true', category: 'Economy' },
  {
    name: 'mining',
    description: 'Explore mining elements, rocks and laser heads.',
    usage: '/mining search: Quantanium',
    category: 'Economy',
  },
  {
    name: 'crafting',
    description: 'Search crafting recipes and blueprint rewards.',
    usage: '/crafting search: laser repeater',
    category: 'Economy',
  },
  { name: 'mission', description: 'Search Star Citizen missions.', usage: '/mission term: bounty legal: true', category: 'Universe' },
  { name: 'location', description: 'Search game locations or starmap systems.', usage: '/location search: Stanton', category: 'Universe' },
  {
    name: 'faction',
    description: 'Search factions and reputation organizations.',
    usage: '/faction search: Crusader',
    category: 'Universe',
  },
  { name: 'lore', description: 'Search Galactapedia and Comm-Link knowledge.', usage: '/lore search: Vanduul', category: 'Universe' },
  {
    name: 'search',
    description: 'Unified search across ships, components, items and commodities.',
    usage: '/search term: aurora',
    category: 'System',
  },
  { name: 'manufacturers', description: 'List Star Citizen ship manufacturers.', usage: '/manufacturers', category: 'Ships' },
  { name: 'changelog', description: 'Latest changes to the Starvis database.', usage: '/changelog', category: 'System' },
  { name: 'version', description: 'Current extracted Star Citizen data version.', usage: '/version', category: 'System' },
  { name: 'top', description: 'Rank ships or components by useful Starvis stats.', usage: '/top limit: 10', category: 'System' },
  { name: 'intel', description: 'Show everything the Starvis bot can query.', usage: '/intel', category: 'System' },
  { name: 'status', description: 'Starvis status for API and database.', usage: '/status', category: 'System' },
];

export function getDiscordClientId() {
  return (process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID ?? '').trim();
}

export function buildDiscordInviteUrl(clientId: string) {
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: '0',
    integration_type: '0',
    scope: 'bot applications.commands',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
