# KozzyX

[![License](https://img.shields.io/github/license/Officialckazros/KozzyX?style=flat-square&color=blue)](LICENSE)
![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-339933?style=flat-square&logo=node.js&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fkozzyx.org&style=flat-square&up_message=online&down_message=offline)](https://kozzyx.org)

KozzyX is a comprehensive, self-hostable Discord bot that unifies moderation, community management, and AI-assisted utilities within a single application. It supports both slash and prefix commands and includes a web dashboard for browser-based administration.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Registering Slash Commands](#registering-slash-commands)
- [Running the Bot](#running-the-bot)
- [Project Structure](#project-structure)
- [Scripts](#scripts)
- [Contributing](#contributing)
- [License](#license)

## Overview

KozzyX began as a moderation utility and has since grown into a complete server-management platform. It provides anti-raid protection, a ticketing system, invite tracking, scheduled reminders, booster role management, autoresponders, and a range of AI-powered commands. The source code is open for reuse. Credentials and API keys are not distributed with the project and must be supplied by the operator.

## Features

- **Moderation** — ban, kick, warn (with configurable thresholds), softban, message purge, slowmode, channel lock and unlock, nickname management and nickname locking, audit logging, and persistent case tracking. Available as both prefix commands and native slash commands (`/ban`, `/kick`, `/timeout`, `/untimeout`, `/warn`, `/softban`, `/purge`, `/slowmode`, `/lock`, `/unlock`) with permission gating and ephemeral feedback.
- **Temporary bans** — `/ban` accepts an optional `duration` (e.g. `7d`); the user is automatically unbanned when it expires, and the schedule survives restarts.
- **Verification gate** — `/verification setup` posts a one-click verify panel that grants a configured role, with an optional minimum account-age check to block brand-new accounts.
- **Self-assignable roles** — `/selfroles` builds button-based role menus (multiple- or single-choice) that members use to pick their own roles.
- **Giveaways** — `/giveaway start|end|reroll|list` runs button-entry giveaways with winner counts, required-role gating, and automatic drawing on expiry.
- **Polls** — `/poll` creates native Discord polls with up to eight answers, a custom duration, and optional multi-select.
- **Anti-raid** — raid detection, mass-ban response, raid watchlists, server lockdown, and recovery tooling.
- **Tickets** — configurable ticket channels, role notifications, and close and edit workflows.
- **Server management** — guided setup wizard, server information, user, avatar, and banner lookups, and statistics.
- **AI utilities** — `/ask`, `/summarize`, `/translate`, `/define`, `/imagine`, `/generate_rules`, `/roast`, and `/decide`.
- **Community tools** — AFK status, booster roles, autoresponders, invite tracking, reminders, to-do lists, welcome and goodbye messages, and additional utility commands.
- **Full customization** — `/config` exposes per-server settings for welcome/goodbye messages, moderation behavior (DM-on-action, required reasons, mod-log channel, default ban-delete days), giveaway defaults, and embed colors, with `/config view` to review the current configuration.
- **Web dashboard** — a backend API for managing the bot from the browser.
- **Command flexibility** — full support for both slash and prefix commands.

## Requirements

- [Node.js](https://nodejs.org/) version 22 LTS. The SQLite native dependency is pinned to this runtime; Node 24 is not supported for local validation.
- A registered [Discord application and bot](https://discord.com/developers/applications)
- API keys for any optional integrations you intend to enable (AI, image generation, email)

## Installation

```bash
git clone https://github.com/Officialckazros/KozzyX.git
cd KozzyX
npm install
```

## Configuration

Create a file at `config/.env` containing the values below. Only `TOKEN`, `CLIENT_ID`, and `GUILD_ID` are required to start the bot; the remaining variables enable optional features.

```env
# Required
TOKEN=your-discord-bot-token
CLIENT_ID=your-application-client-id
GUILD_ID=your-development-guild-id
OWNER_ID=your-discord-user-id

# Dashboard authentication (optional)
CLIENT_SECRET=your-oauth-client-secret

# AI and image generation (optional)
GOOGLE_GENERATIVE_AI_API_KEY=
IMAGE_API_KEY=
NANO_BANANA_API_KEY=
XAI_API_KEY=
DEEPSEEK_API_KEY=

# Email / SMTP (optional, used for ban appeals)
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
SMTP_DOMAIN=

# Uptime watchdog (optional)
WATCHDOG_URL=
WATCHDOG_INTERVAL_MS=
WATCHDOG_FAIL_THRESHOLD=

# Slash command deployment (optional; normal startup does not deploy)
DEPLOY_SLASH_ON_READY=false
DEPLOY_SLASH_GUILD_ID=

# Deployment (via Railway)
# Set your environment variables directly in the Railway dashboard (TOKEN, CLIENT_ID, etc.).
# No local .env file is needed on Railway.
# Connect your GitHub repo to Railway for automatic deploys on push.
```

The `config/.env` file is excluded via `.gitignore` and must never be committed.

## Registering Slash Commands

Register commands to a single guild for immediate availability during development, or globally for production:

```bash
# Single guild (recommended during development; updates immediately)
node --env-file=config/.env src/deploy-guild.js

# Global (may take up to one hour to propagate)
npm run deploy
```

The bot no longer deploys slash commands on every restart. Use the scripts above when command definitions change, or set `DEPLOY_SLASH_ON_READY=true` for a controlled environment where startup deployment is desired.

## Running the Bot

```bash
# Standard run (Railway uses this; env vars come from Railway dashboard)
npm start

# Development mode (automatic restart on file changes, uses local .env)
npm run dev
```

PM2 is included for local use only (not needed on Railway):

```bash
pm2 start config/ecosystem.config.cjs
```

## Project Structure

```
src/
  index.js              Application entry point
  dashboard-api.js      Backend API for the web dashboard
  deploy.js             Global slash-command registration
  deploy-guild.js       Per-guild slash-command registration
  structures/           Extended discord.js client
  events/               Gateway event handlers
  handlers/             Command loaders
  slashCommands/        Slash commands (general, fun)
  prefixCommands/       Prefix commands (moderation, config, features, fun)
  utils/                Database, embeds, AI, raid protection, and helpers
config/                 Environment and PM2 configuration (secrets gitignored)
data/                   SQLite database
scripts/                Maintenance and deployment helpers
```

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the bot |
| `npm run dev` | Start with `--watch` auto-reload |
| `npm run deploy` | Register slash commands globally |
| `npm run sync` | Synchronize commands via `scripts/sync_commands.js` |
| `npm run check` | Validate runtime, syntax, command exports, duplicate names, and aliases |
| `npm run deploy-all` | Commit + push (Railway auto-deploys on push) |

## Contributing

Contributions are welcome. Please review [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
