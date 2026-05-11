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

export const SITE_URL = process.env.SITE_URL || 'https://starvis.ampynjord.bzh';

export function shipEmbed(ship: ShipResult): EmbedBuilder {
  const shipId = ship.id ?? ship.ship_matrix_id;
  const shipUrl = shipId ? `${SITE_URL}/ships/${shipId}` : SITE_URL;

  const embed = new EmbedBuilder()
    .setColor(COLORS.ship)
    .setTitle(`${ship.name}`)
    .setURL(shipUrl)
    .setFooter({ text: 'Starvis — Star Citizen Database' });

  const thumb = ship.thumbnail ?? ship.thumbnail_large ?? ship.mediaStoreSmall ?? ship.mediaStoreLarge;
  if (thumb) embed.setThumbnail(thumb);

  const desc = ship.description ?? ship.sm_description;
  if (desc) {
    const truncated = desc.length > 200 ? `${desc.slice(0, 197)}…` : desc;
    embed.setDescription(truncated);
  }

  const fields: { name: string; value: string; inline: boolean }[] = [];

  const mfr = ship.manufacturer ?? ship.manufacturer_name;
  const mfrCode = ship.manufacturer_code;
  if (mfr) fields.push({ name: '🏭 Manufacturer', value: mfrCode ? `${mfr} (${mfrCode})` : mfr, inline: true });

  const role = ship.focus ?? ship.role;
  if (role) fields.push({ name: '🎯 Role', value: role, inline: true });
  if (ship.career && ship.career !== role) fields.push({ name: '💼 Career', value: ship.career, inline: true });

  if (ship.size) fields.push({ name: '📐 Size', value: ship.size, inline: true });

  if (ship.production_status) {
    const statusIcon = ship.production_status === 'flight-ready' ? '✅' : '🔧';
    fields.push({ name: 'Status', value: `${statusIcon} ${ship.production_status}`, inline: true });
  }

  const crewMin = ship.crew_min ?? ship.min_crew;
  const crewMax = ship.crew_max ?? ship.max_crew;
  if (crewMin != null && crewMax != null) {
    fields.push({
      name: '👥 Crew',
      value: crewMin === crewMax ? `${crewMin}` : `${crewMin}–${crewMax}`,
      inline: true,
    });
  }

  const cargo = ship.cargo_capacity ?? ship.sm_cargo;
  if (cargo) fields.push({ name: '📦 Cargo', value: `${cargo} SCU`, inline: true });

  if (ship.scm_speed) fields.push({ name: '🚀 SCM', value: `${ship.scm_speed} m/s`, inline: true });
  if (ship.max_speed) fields.push({ name: '💨 Max', value: `${ship.max_speed} m/s`, inline: true });

  if (ship.shield_hp) fields.push({ name: '🛡️ Shield', value: `${ship.shield_hp.toLocaleString()} HP`, inline: true });
  if (ship.weapon_damage_total) {
    fields.push({ name: '🔫 Weapons DPS', value: `${ship.weapon_damage_total.toLocaleString()}`, inline: true });
  }
  if (ship.missile_damage_total) {
    fields.push({ name: '🚀 Missile DMG', value: `${ship.missile_damage_total.toLocaleString()}`, inline: true });
  }

  if (ship.total_hp) fields.push({ name: '❤️ HP Total', value: `${ship.total_hp.toLocaleString()}`, inline: true });
  if (ship.mass) fields.push({ name: '⚖️ Mass', value: `${ship.mass.toLocaleString()} kg`, inline: true });

  if (ship.hydrogen_fuel_capacity) {
    fields.push({ name: '⛽ Hydrogen', value: `${ship.hydrogen_fuel_capacity} SCU`, inline: true });
  }
  if (ship.quantum_fuel_capacity) {
    fields.push({ name: '🌀 Quantum', value: `${ship.quantum_fuel_capacity} SCU`, inline: true });
  }

  if (ship.length && ship.beam && ship.height) {
    fields.push({ name: '📏 Dimensions', value: `${ship.length} × ${ship.beam} × ${ship.height} m`, inline: true });
  }

  if (ship.insurance_claim_time) {
    const mins = Math.floor(ship.insurance_claim_time);
    const secs = Math.round((ship.insurance_claim_time - mins) * 60);
    fields.push({ name: '🔄 Claim', value: `${mins}m${secs > 0 ? `${secs}s` : ''}`, inline: true });
  }
  if (ship.insurance_expedite_cost) {
    fields.push({ name: '⚡ Expedite', value: `${ship.insurance_expedite_cost.toLocaleString()} aUEC`, inline: true });
  }

  if (ship.price) fields.push({ name: '💰 Price', value: `${ship.price.toLocaleString()} aUEC`, inline: true });

  embed.addFields(fields);
  return embed;
}

export function tradeRoutesEmbed(routes: TradeRoute[], scu: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.trade)
    .setTitle(`🚀 Top ${routes.length} trade routes (${scu} SCU)`)
    .setURL(`${SITE_URL}/trade`)
    .setFooter({ text: 'Starvis — Star Citizen Database' });

  if (routes.length === 0) {
    embed.setDescription('No routes found.');
    return embed;
  }

  const lines = routes.map((r, i) => {
    const profit = r.totalProfit.toLocaleString();
    return `**${i + 1}.** ${r.commodity}\n` + `  📦 ${r.buyLocation} → ${r.sellLocation}\n` + `  💰 **${profit} aUEC** profit`;
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
    .setTitle(healthy ? '✅ Starvis — Online' : '❌ Starvis — Offline')
    .setURL(SITE_URL)
    .setFooter({ text: 'Starvis — Star Citizen Database' });

  if (stats) {
    const fields: { name: string; value: string; inline: boolean }[] = [];
    for (const [key, value] of Object.entries(stats)) {
      fields.push({ name: key, value: value.toLocaleString(), inline: true });
    }
    embed.addFields(fields);
  }

  return embed;
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Error').setDescription(message);
}
