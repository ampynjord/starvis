import { type ColorResolvable, EmbedBuilder } from 'discord.js';
import type { ShipResult, TradeRoute } from './api.js';
import { SITE_URL } from './config.js';

const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  error: 0xed4245,
  ship: 0x3498db,
  trade: 0x2ecc71,
  commodity: 0xe67e22,
} as const satisfies Record<string, ColorResolvable>;

function fmt(value: unknown, unit = ''): string {
  if (value == null || value === '') return 'n/a';
  if (typeof value === 'number') return `${value.toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`;
  return `${value}${unit ? ` ${unit}` : ''}`;
}

function truncate(text: string, max = 280): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function shipEmbed(ship: ShipResult): EmbedBuilder {
  const shipId = ship.id ?? ship.ship_matrix_id;
  const shipUrl = shipId ? `${SITE_URL}/ships/${shipId}` : SITE_URL;
  const embed = new EmbedBuilder()
    .setColor(COLORS.ship)
    .setTitle(ship.name)
    .setURL(shipUrl)
    .setFooter({ text: 'Starvis - Star Citizen Database' });

  const thumb = ship.thumbnail ?? ship.thumbnail_large ?? ship.mediaStoreSmall ?? ship.mediaStoreLarge;
  if (thumb) embed.setThumbnail(thumb);

  const desc = ship.description ?? ship.sm_description;
  if (desc) embed.setDescription(truncate(desc));

  const mfr = ship.manufacturer ?? ship.manufacturer_name;
  const role = ship.focus ?? ship.role;
  const crewMin = ship.crew_min ?? ship.min_crew;
  const crewMax = ship.crew_max ?? ship.max_crew;
  const cargo = ship.cargo_capacity ?? ship.sm_cargo;

  const identity = [
    mfr ? `Manufacturer: ${ship.manufacturer_code ? `${mfr} (${ship.manufacturer_code})` : mfr}` : null,
    role ? `Role: ${role}` : null,
    ship.career && ship.career !== role ? `Career: ${ship.career}` : null,
    ship.production_status ? `Status: ${ship.production_status}` : null,
  ].filter(Boolean);

  if (identity.length) {
    embed.addFields({ name: 'Identity', value: identity.join('\n'), inline: false });
  }

  const performance = [
    ship.scm_speed ? `SCM: **${fmt(ship.scm_speed, 'm/s')}**` : null,
    ship.max_speed ? `Max: **${fmt(ship.max_speed, 'm/s')}**` : null,
    cargo ? `Cargo: **${fmt(cargo, 'SCU')}**` : null,
    crewMin != null && crewMax != null ? `Crew: **${crewMin === crewMax ? crewMin : `${crewMin}-${crewMax}`}**` : null,
  ].filter(Boolean);

  if (performance.length) {
    embed.addFields({ name: 'Performance', value: performance.join('\n'), inline: true });
  }

  const combat = [
    ship.weapon_damage_total ? `Weapons: **${fmt(ship.weapon_damage_total, 'DPS')}**` : null,
    ship.missile_damage_total ? `Missiles: **${fmt(ship.missile_damage_total)}**` : null,
    ship.shield_hp ? `Shield: **${fmt(ship.shield_hp, 'HP')}**` : null,
    ship.total_hp ? `Hull: **${fmt(ship.total_hp, 'HP')}**` : null,
  ].filter(Boolean);

  if (combat.length) {
    embed.addFields({ name: 'Combat', value: combat.join('\n'), inline: true });
  }

  const logistics = [
    ship.mass ? `Mass: **${fmt(ship.mass, 'kg')}**` : null,
    ship.hydrogen_fuel_capacity ? `Hydrogen: **${fmt(ship.hydrogen_fuel_capacity, 'L')}**` : null,
    ship.quantum_fuel_capacity ? `Quantum: **${fmt(ship.quantum_fuel_capacity, 'L')}**` : null,
    ship.insurance_claim_time ? `Claim: **${fmt(Math.round(ship.insurance_claim_time), 'min')}**` : null,
    ship.insurance_expedite_cost ? `Expedite: **${fmt(ship.insurance_expedite_cost, 'aUEC')}**` : null,
    ship.price ? `Price: **${fmt(ship.price, 'aUEC')}**` : null,
  ].filter(Boolean);

  if (logistics.length) {
    embed.addFields({ name: 'Logistics', value: logistics.join('\n'), inline: false });
  }

  if (ship.length && ship.beam && ship.height) {
    embed.addFields({ name: 'Dimensions', value: `${ship.length} x ${ship.beam} x ${ship.height} m`, inline: true });
  }

  return embed;
}

export function tradeRoutesEmbed(routes: TradeRoute[], scu: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.trade)
    .setTitle(`Top ${routes.length} trade routes (${scu} SCU)`)
    .setURL(`${SITE_URL}/trade`)
    .setFooter({ text: 'Starvis - Star Citizen Database' });

  if (!routes.length) return embed.setDescription('No profitable routes found.');

  const lines = routes.map((r, i) => {
    return [
      `**${i + 1}. ${r.commodity}**`,
      `Buy: ${r.buyLocation} (${fmt(r.buyPrice, 'aUEC')})`,
      `Sell: ${r.sellLocation} (${fmt(r.sellPrice, 'aUEC')})`,
      `Profit: **${fmt(r.totalProfit, 'aUEC')}**`,
    ].join('\n');
  });

  return embed.setDescription(lines.join('\n\n'));
}

export function searchEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(title)
    .setDescription(description)
    .setURL(SITE_URL)
    .setFooter({ text: 'Starvis - Star Citizen Database' });
}

export function statusEmbed(healthy: boolean, stats?: Record<string, number>): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(healthy ? COLORS.success : COLORS.error)
    .setTitle(healthy ? 'Starvis - Online' : 'Starvis - Offline')
    .setURL(SITE_URL)
    .setFooter({ text: 'Starvis - Star Citizen Database' });

  if (stats) {
    embed.addFields(
      Object.entries(stats).map(([key, value]) => ({
        name: key,
        value: value.toLocaleString('en-US'),
        inline: true,
      })),
    );
  }

  return embed;
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.error).setTitle('Error').setDescription(message);
}
