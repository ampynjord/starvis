import { type ColorResolvable, EmbedBuilder } from 'discord.js';
import type { ShipResult, TradeRoute } from './api.js';

const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245,
  ship: 0x3498db,
  trade: 0x2ecc71,
  commodity: 0xe67e22,
} as const satisfies Record<string, ColorResolvable>;

const SITE_URL = 'https://starvis.ampynjord.bzh';

export function shipEmbed(ship: ShipResult): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.ship)
    .setTitle(ship.name)
    .setURL(`${SITE_URL}/ships/${ship.id}`)
    .setFooter({ text: 'Starvis — Star Citizen Database' });

  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (ship.manufacturer) fields.push({ name: 'Constructeur', value: ship.manufacturer, inline: true });
  if (ship.focus) fields.push({ name: 'Rôle', value: ship.focus, inline: true });
  if (ship.size) fields.push({ name: 'Taille', value: ship.size, inline: true });
  if (ship.price) fields.push({ name: 'Prix', value: `${ship.price.toLocaleString('fr-FR')} aUEC`, inline: true });
  if (ship.cargo_capacity) fields.push({ name: 'Cargo', value: `${ship.cargo_capacity} SCU`, inline: true });
  if (ship.scm_speed) fields.push({ name: 'Vitesse SCM', value: `${ship.scm_speed} m/s`, inline: true });
  if (ship.max_speed) fields.push({ name: 'Vitesse max', value: `${ship.max_speed} m/s`, inline: true });
  if (ship.crew_min != null && ship.crew_max != null) {
    fields.push({
      name: 'Équipage',
      value: ship.crew_min === ship.crew_max ? `${ship.crew_min}` : `${ship.crew_min}–${ship.crew_max}`,
      inline: true,
    });
  }
  if (ship.production_status) fields.push({ name: 'Statut', value: ship.production_status, inline: true });

  embed.addFields(fields);
  return embed;
}

export function tradeRoutesEmbed(routes: TradeRoute[], scu: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.trade)
    .setTitle(`🚀 Top ${routes.length} routes commerciales (${scu} SCU)`)
    .setURL(`${SITE_URL}/trade`)
    .setFooter({ text: 'Starvis — Star Citizen Database' });

  if (routes.length === 0) {
    embed.setDescription('Aucune route trouvée.');
    return embed;
  }

  const lines = routes.map((r, i) => {
    const profit = r.totalProfit.toLocaleString('fr-FR');
    return `**${i + 1}.** ${r.commodity}\n` + `  📦 ${r.buyLocation} → ${r.sellLocation}\n` + `  💰 **${profit} aUEC** de profit`;
  });

  embed.setDescription(lines.join('\n\n'));
  return embed;
}

export function searchEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(title)
    .setDescription(description)
    .setURL(SITE_URL)
    .setFooter({ text: 'Starvis — Star Citizen Database' });
}

export function statusEmbed(healthy: boolean, stats?: Record<string, number>): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(healthy ? COLORS.success : COLORS.error)
    .setTitle(healthy ? '✅ Starvis — En ligne' : '❌ Starvis — Hors ligne')
    .setURL(SITE_URL)
    .setFooter({ text: 'Starvis — Star Citizen Database' });

  if (stats) {
    const fields: { name: string; value: string; inline: boolean }[] = [];
    for (const [key, value] of Object.entries(stats)) {
      fields.push({ name: key, value: value.toLocaleString('fr-FR'), inline: true });
    }
    embed.addFields(fields);
  }

  return embed;
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Erreur').setDescription(message);
}
