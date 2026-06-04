# KozzyX 
Hey! This is **KozzyX**, a Discord bot I built and have been pouring a *lot* of
features into. It started as a moderation helper and kind of grew from there —
now it handles anti-raid protection, tickets, invite tracking, reminders, booster
roles, autoresponders, a few AI-powered toys, and even a web dashboard.

Feel free to dig through the code and reuse whatever's helpful. If it saves you
some time on your own bot, that's exactly what I was hoping for. 
> Just a heads-up: you'll need to plug in your own API keys and tokens to run it —
> mine aren't included (for obvious reasons ). See [Configuration](#configuration).

## What it can do

- **Moderation** — ban, kick, warn (with thresholds), softban, clear, slowmode,
  lock/unlock, nicknames & nick-lock, audit logging, and case tracking
- **Anti-raid** — raid detection, ban-raid, raid lists, lockdown, and a "heal" to recover
- **Tickets** — configurable channels, pings, and close/edit flows
- **Server tools** — setup wizard, server info, user/avatar/banner lookup, stats
- **AI helpers** — `/ask`, `/summarize`, `/translate`, `/define`, `/imagine`,
  `/generate_rules`, `/roast`, `/decide`
- **Community stuff** — AFK, booster roles, autoresponders, invite tracking,
  reminders, to-do lists, and a handful of fun commands
- **Web dashboard** — a backend API so everything's manageable from the browser
- Works with **both slash commands and prefix commands**

## Before you start

You'll want:

- [Node.js](https://nodejs.org/) **v18 or newer** (I'm running it on v24)
- A [Discord application & bot](https://discord.com/developers/applications)
- API keys for whichever optional bits you actually want (AI, image generation, email)

## Getting it running

```bash
git clone https://github.com/Officialckazros/KozzyX.git
cd KozzyX
npm install
```

## Configuration

Drop a file at `config/.env` with the values below. You only really need `TOKEN`,
`CLIENT_ID`, and `GUILD_ID` to get going — everything else just unlocks extra features.

```env
# --- The essentials ---
TOKEN=your-discord-bot-token
CLIENT_ID=your-application-client-id
GUILD_ID=your-development-guild-id
OWNER_ID=your-discord-user-id

# --- Dashboard login (optional) ---
CLIENT_SECRET=your-oauth-client-secret

# --- AI & image generation (optional) ---
GOOGLE_GENERATIVE_AI_API_KEY=
IMAGE_API_KEY=
NANO_BANANA_API_KEY=
XAI_API_KEY=
DEEPSEEK_API_KEY=

# --- Email / SMTP (optional, used for ban appeals) ---
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
SMTP_DOMAIN=

# --- Uptime watchdog (optional) ---
WATCHDOG_URL=
WATCHDOG_INTERVAL_MS=
WATCHDOG_FAIL_THRESHOLD=

# --- VM Deployment (optional, used by scripts/deploy-vm.sh) ---
DEPLOY_INSTANCE_NAME=
DEPLOY_ZONE=
DEPLOY_VM_USER=
DEPLOY_REMOTE_DIR=
```

> Please don't ever commit your `config/.env` — it's already in `.gitignore`,
> so you should be safe, but it's worth double-checking.

## Registering the slash commands

Push your commands to a single guild (shows up instantly, great while building) or
globally (takes a bit to spread everywhere):

```bash
# Just your dev server (recommended while you're tinkering)
node --env-file=config/.env src/deploy-guild.js

# Everywhere (can take up to an hour to show up)
npm run deploy
```

## Starting the bot

```bash
# Normal run
npm start

# Dev mode — restarts automatically when you save a file
npm run dev
```

### Keeping it alive (optional)

There's a [PM2](https://pm2.keymetrics.io/) config included if you want it running
24/7:

```bash
pm2 start config/ecosystem.config.cjs
```

## How it's laid out

```
src/
  index.js              # Where it all starts
  dashboard-api.js      # Backend API for the web dashboard
  deploy.js             # Register slash commands globally
  deploy-guild.js       # Register slash commands to one guild
  structures/           # Extended discord.js Client
  events/               # Gateway event handlers
  handlers/             # Loads the commands
  slashCommands/        # Slash commands (general, fun)
  prefixCommands/       # Prefix commands (moderation, config, features, fun)
  utils/                # Database, embeds, AI, raid protection, helpers, etc.
config/                 # Your .env + PM2 config (secrets stay gitignored)
data/                   # SQLite database
scripts/                # Maintenance & deploy helpers
```

## Handy scripts

| Command          | What it does                                 |
| ---------------- | -------------------------------------------- |
| `npm start`      | Start the bot                                 |
| `npm run dev`    | Start with `--watch` auto-reload              |
| `npm run deploy` | Register slash commands globally              |
| `npm run sync`   | Sync commands via `scripts/sync_commands.js`  |
| `npm run deploy-all` | Commit changes, push to GitHub, and deploy to VM |

## License

This project is licensed under the MIT License. See the [LICENSE](file:///Users/ckazros/Library/Mobile%20Documents/com~apple~CloudDocs/my%20projects/my-discord-bot/LICENSE) file for details. Feel free to use and borrow pieces for your own projects! 
