# STARVIS Bot

Discord slash-command bot for Starvis.

## Commands

The bot registers commands for AI answers, ships, comparison, loadouts, components,
items, commodities, paints, trade, shops, mining, crafting, missions, locations,
factions, lore, global search, manufacturers, changelog, version, rankings, intel
and status.

The web IHM exposes the same command help at `/discord`.

## Configuration

```bash
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
NEXT_PUBLIC_DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
API_TOKEN=
```

- `DISCORD_TOKEN` runs the bot.
- `DISCORD_CLIENT_ID` deploys slash commands and can generate the invite URL.
- `NEXT_PUBLIC_DISCORD_CLIENT_ID` exposes the invite URL in the IHM.
- `DISCORD_GUILD_ID` limits command deployment to one guild when set.
- `API_TOKEN` lets `/starvis` call the protected Starvis AI endpoint.

The bot remains disabled when `DISCORD_TOKEN` is not set.
