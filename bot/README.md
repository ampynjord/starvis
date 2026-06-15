# STARVIS Bot

Discord slash-command bot for Starvis.

## Commands

The bot registers commands for AI answers, ships, comparison, loadouts, components,
items, commodities, paints, trade, shop locations, mining, crafting, missions, locations,
factions, lore, global search, manufacturers, changelog, version, rankings, intel
and status.

The `/shop` command only exposes extracted shop locations and franchises. Shop
inventory is disabled until reliable extracted inventory data is available.

The web IHM exposes the same command help at `/discord`.

## Configuration

```bash
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
NEXT_PUBLIC_DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
API_TOKEN=
DISCORD_DEFAULT_MEMBER_ROLE_NAME=Member
DISCORD_DEFAULT_MEMBER_ROLE_ID=
DISCORD_PRESENCE_INTERVAL_MS=60000
DISCORD_PRESENCE_STATUS=online
```

- `DISCORD_TOKEN` runs the bot.
- `DISCORD_CLIENT_ID` deploys slash commands and can generate the invite URL.
- `NEXT_PUBLIC_DISCORD_CLIENT_ID` exposes the invite URL in the IHM.
- `DISCORD_GUILD_ID` limits command deployment to one guild when set.
- `API_TOKEN` lets `/starvis` call the protected Starvis AI endpoint.
- `DISCORD_DEFAULT_MEMBER_ROLE_NAME` assigns a default role to new Discord members. Defaults to `Member`.
- `DISCORD_DEFAULT_MEMBER_ROLE_ID` overrides name lookup when set.
- `DISCORD_PRESENCE_INTERVAL_MS` controls the rich presence rotation speed. Discord rate limits presence updates, so keep it above 15000 ms.
- `DISCORD_PRESENCE_STATUS` can be `online`, `idle`, `dnd` or `invisible`.

The default member role requires the Discord Developer Portal "Server Members Intent" to be enabled and the bot role to stay above the target role.
The `Developer` Discord role means access to Starvis developer tools and external API capabilities, not project contribution status. It must not grant access to staff/private categories. Use `Contributor`, `Core Team`, `Staff` or `Admin` for people contributing to or moderating the project itself.

## Community Server Operations

```bash
npm run update-community-server --workspace=@starvis/bot -- --envPath=.env.dev
```

This maintenance command updates the Starvis community Discord server by:

- appending the latest developer/API access notes to the most recent editable bot changelog message, or posting an addendum if no editable message exists;
- denying staff/category visibility to the `Developer` role, because this role is only for external API users;
- applying the same deny overwrite to channels under staff-like categories.

## Rich Presence

When the bot is ready, it rotates useful Discord activities:

- watching Star Citizen data;
- listening for `/starvis` questions;
- playing `/intel` for the current command count;
- watching API and data status;
- watching the number of Starvis servers.

The bot remains disabled when `DISCORD_TOKEN` is not set.
