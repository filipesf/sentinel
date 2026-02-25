# Sentinel — Discord Setup Bot for Flare HQ

A Discord bot that bootstraps and maintains the **Flare** Discord server — an AI-agent command center, personal workspace, and future company operating system.

Sentinel is **infrastructure, not an AI agent**. It creates roles, categories, channels, and permissions from an architecture-as-code config. AI agents (currently Corven) are powered by [OpenClaw](https://github.com/nicepkg/openclaw) running on a separate VM.

## Architecture

```
Flare Discord Server
├── Sentinel (this bot)     — Builds and maintains server structure
└── Corven (OpenClaw bot)   — AI agent, responds in threads via @mention
```

Sentinel registers infrastructure commands (`/setup`, `/corven`, `/create`, etc.).
OpenClaw registers agent commands (`/activation`, `/model`, etc.).
They are separate Discord applications with different tokens.

## Prerequisites

- **Node.js** ≥ 18
- A **Discord application** with bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- **Privileged intents** enabled: `GuildMembers`, `MessageContent`
- Bot invited to your server with **Administrator** permission (demoted to minimal after first setup)

## Setup

```bash
# Clone and install
git clone <repo-url>
cd discord
npm install

# Configure
cp config.example.json config.json
# Edit config.json with your bot token, application ID, and guild ID
```

**config.json:**

```json
{
  "token": "YOUR_BOT_TOKEN",
  "clientId": "YOUR_APPLICATION_ID",
  "guildId": "YOUR_SERVER_ID"
}
```

> `config.json` is gitignored — never commit it.

## Usage

```bash
# Register slash commands with Discord
npm run deploy

# Start the bot (production)
npm run build && npm start

# Start the bot (development, with hot reload)
npm run dev
```

## Commands

| Command | Description |
|---|---|
| `/setup full [clean:True]` | Full idempotent setup. Optional `clean` deletes everything not in architecture first |
| `/setup update` | Reconcile — creates missing, updates drifted, never deletes |
| `/setup verify` | Read-only drift detection report |
| `/corven` | Create a new agent session thread in the current channel |
| `/create role\|channel\|category` | Create a single item |
| `/assign role <user> <role>` | Assign a role to a user |
| `/permissions show\|set` | View or modify channel permissions |
| `/audit` | Dump current server structure to `#audit-log` |
| `/status` | Bot uptime, ping, server stats |

All responses are **ephemeral** (only visible to the command invoker).

## Server Structure

Sentinel builds this structure from `src/config/server-architecture.ts`:

```
Flare
├── 🧠 PERSONAL          — Private space (Owner + Corven only)
│   ├── #journal
│   ├── #finance
│   ├── #reminders
│   ├── #health
│   └── 🔊 Voice — Personal
│
├── 💼 WORK              — Professional context (Owner + Corven + Team)
│   ├── #marketing
│   ├── #operations
│   ├── #tasks
│   ├── #research
│   └── 🔊 Voice — Work
│
├── 🤖 AGENTS            — Agent workspaces
│   ├── #corven
│   ├── #agent-sandbox
│   ├── #agent-to-agent
│   └── 🔊 Voice — Corven
│
└── 🔧 META              — Infrastructure (Owner + Admin only)
    ├── #bot-commands
    ├── #audit-log
    └── #server-config
```

## How Agent Sessions Work

1. Use `/corven` in any channel where Corven has access
2. Sentinel creates a thread named `YYYYMMDD — New session`
3. Sentinel adds you and Corven's bot account to the thread
4. You @mention Corven to start the conversation
5. OpenClaw picks up your message and Corven responds
6. After 24h of inactivity, the thread auto-archives (still searchable)

**Sentinel never posts in the thread** — OpenClaw ignores bot messages, so the user must @mention Corven for it to respond.

## Key Design Decisions

- **Architecture-as-code** — `src/config/server-architecture.ts` is the single source of truth. Change the config, re-run `/setup full` or `/setup update`.
- **Idempotent** — `/setup full` can be run repeatedly without duplicating anything.
- **Non-destructive by default** — `/setup update` only creates and updates, never deletes. Use `/setup full clean:True` for deletion.
- **No database** — All state lives in Discord itself and the config file.
- **Bot demotion** — After setup, Administrator is replaced with minimal permissions to limit blast radius.
- **Managed bot roles** — Discord auto-creates roles for bots. Sentinel finds them at runtime via `resolveRole()`, never creates them.
- **Secure by default** — `@everyone` sees nothing. Each category explicitly grants access to the roles that need it.

## Project Structure

```
discord/
├── config.json                       # Bot token, clientId, guildId (GITIGNORED)
├── config.example.json               # Template for config.json
├── src/
│   ├── index.ts                      # Entry point — client setup, command & event registration
│   ├── deploy-commands.ts            # Registers slash commands with Discord API
│   ├── types.ts                      # Command interface + client augmentation
│   ├── config/
│   │   └── server-architecture.ts    # Source of truth — roles, categories, channels, permissions
│   ├── commands/
│   │   ├── setup/index.ts            # /setup full | update | verify
│   │   ├── create/index.ts           # /create role|channel|category
│   │   ├── assign/index.ts           # /assign role <user> <role>
│   │   ├── permissions/index.ts      # /permissions show|set
│   │   ├── agents/corven.ts          # /corven — create agent session thread
│   │   ├── audit.ts                  # /audit — dump server structure
│   │   └── status.ts                 # /status — bot health check
│   ├── services/
│   │   ├── setup-executor.ts         # Full bootstrap with optional --clean
│   │   ├── update-executor.ts        # Reconciliation (create + update only)
│   │   ├── verify-executor.ts        # Read-only drift detection
│   │   ├── position-enforcer.ts      # Batch position enforcement
│   │   ├── thread-creator.ts         # Agent thread creation + member discovery
│   │   └── audit-logger.ts           # Structured logging to #audit-log
│   ├── events/
│   │   ├── ready.ts                  # Client ready handler
│   │   └── interaction-create.ts     # Slash command router
│   └── utils/
│       ├── constants.ts              # Colors, category names, archive duration
│       └── helpers.ts                # Date formatting
├── BUILD_PLAN.md                     # Implementation plan with phases
├── SERVER_ARCHITECTURE.md            # Human-readable server spec
└── SESSION_SUMMARY.md                # Session context for AI assistants
```

## Tech Stack

- **Runtime:** Node.js (ESM)
- **Language:** TypeScript (strict mode)
- **Framework:** [discord.js](https://discord.js.org/) v14
- **Dev tooling:** [tsx](https://github.com/privatenumber/tsx) for development

## License

UNLICENSED — Private project.
