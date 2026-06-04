# KozzyX — Discord Bot

A feature-rich Discord bot built with [discord.js](https://discord.js.org/) v14.
It covers moderation, anti-raid protection, ticketing, invite tracking, reminders,
AafK, booster roles, autoresponders, AI-powered utilities, and a web dashboard API.

> ⚠️ This repository is shared for reference. Feel free to read and reuse the code,
> but you must supply your own API keys and credentials (see [Configuration](#configuration)).

## Features

- **Moderation** — ban, kick, warn (with thresholds), softban, clear, slowmode,
  lock/unlock, nick & nick-lock, audit log, case logging
- **Anti-raid** — raid detection, ban-raid, raid lists, lockdown, healing
- **Tickets** — configurable ticket channels, pings, close/edit flows
- **Server tools** — server setup, info, user/avatar/banner lookup, stats
- **AI utilities** — `/ask`, `/summarize`, `/translate`, `/define`, `/imagine`,
  `/generate_rules`, `/roast`, `/decide` (Google Generative AI)
- **Engagement** — AFK, booster roles, autoresponders, invite tracking, reminders,
  todo lists, fun commands
- **Dashboard API** — backend endpoints for an external web dashboard
- **Both slash commands and prefix commands**

## Requirements

- [Node.js](https://nodejs.org/) **v18+** (developed on v24)
- A [Discord application & bot](https://discord.com/developers/applications)
- API keys for any optional integrations you want to use (AI, image generation, SMTP)

## Installation

```bash
git clone https://github.com/kozzyxckaz/my-discord-bot.git
cd my-discord-bot
npm install
```

## Configuration

Create `config/.env` with the variables below. Only `TOKEN`, `CLIENT_ID`, and
`GUILD_ID` are required to start; the rest enable optional features.

```env
# --- Required ---
TOKEN=your-discord-bot-token
CLIENT_ID=your-application-client-id
GUILD_ID=your-development-guild-id
OWNER_ID=your-discord-user-id

# --- Dashboard OAuth (optional) ---
CLIENT_SECRET=your-oauth-client-secret

# --- AI / generation (optional) ---
GOOGLE_GENERATIVE_AI_API_KEY=
IMAGE_API_KEY=
NANO_BANANA_API_KEY=
XAI_API_KEY=
DEEPSEEK_API_KEY=

# --- Email / SMTP (optional, used for appeals) ---
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
SMTP_DOMAIN=

# --- Watchdog (optional) ---
WATCHDOG_URL=
WATCHDOG_INTERVAL_MS=
WATCHDOG_FAIL_THRESHOLD=
```

> **Never commit `config/.env`.** It is already listed in `.gitignore`.

## Registering slash commands

Deploy commands to your development guild (instant) or globally:

```bash
# Register to the guild defined by GUILD_ID (recommended while developing)
node --env-file=config/.env src/deploy-guild.js

# Register globally (can take up to an hour to propagate)
npm run deploy
```

## Running the bot

```bash
# Production
npm start

# Development (auto-restart on file changes)
npm run dev
```

### Process management (optional)

A [PM2](https://pm2.keymetrics.io/) ecosystem file is included:

```bash
pm2 start config/ecosystem.config.cjs
```

## Project structure

```
src/
  index.js              # Entry point
  dashboard-api.js      # Web dashboard backend API
  deploy.js             # Global slash-command registration
  deploy-guild.js       # Guild slash-command registration
  structures/           # Extended discord.js Client
  events/               # Gateway event handlers
  handlers/             # Command loader
  slashCommands/        # Slash commands (general, fun)
  prefixCommands/       # Prefix commands (moderation, config, features, fun)
  utils/                # Database, embeds, AI, raid protection, helpers, etc.
config/                 # .env and PM2 config (gitignored secrets)
data/                   # SQLite database
scripts/                # Maintenance & deploy helpers
```

## Scripts

| Command          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `npm start`      | Start the bot                                  |
| `npm run dev`    | Start with `--watch` auto-reload               |
| `npm run deploy` | Register slash commands globally               |
| `npm run sync`   | Sync commands via `scripts/sync_commands.js`   |

## License

No license is currently specified. All rights reserved by the author unless a
`LICENSE` file is added. You are welcome to read and learn from the code.
