# Sentinel — Discord Infrastructure Bot for Flare

A Discord bot that bootstraps and maintains the **Flare** Discord server — an AI-agent command center and operational workspace.

Sentinel is **infrastructure, not an AI agent**. It creates roles, categories, channels, and permissions from an architecture-as-code config. It also triggers AI agent sessions via OpenClaw's Gateway WebSocket RPC. AI agents (currently Corven) are powered by [OpenClaw](https://github.com/nicepkg/openclaw) running on a separate VM.

## Architecture

```
Flare Discord Server
├── Sentinel (this bot)     — Builds server structure, triggers agent sessions
└── Corven (OpenClaw agent) — AI agent, responds in threads via prompt
```

Sentinel registers infrastructure + session commands (`/setup`, `/corven`, `/session`, `/growth`, etc.).
OpenClaw registers agent commands (`/activation`, `/model`, etc.).
They are separate Discord applications with different tokens.

## Prerequisites

- **Node.js** ≥ 22 (built-in WebSocket required)
- A **Discord application** with bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- **Privileged intents** enabled: `GuildMembers`, `MessageContent`
- Bot invited to your server with **Administrator** permission (demoted to minimal after first setup)
- **OpenClaw gateway** running and reachable (same host, `127.0.0.1:18789`)

## Setup

```bash
# Clone and install
git clone <repo-url>
cd sentinel
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

**Environment variables** (`.env`):

| Variable                 | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `OPENCLAW_HOOKS_TOKEN`   | Auth token for OpenClaw HTTP hooks (fallback) |
| `OPENCLAW_GATEWAY_TOKEN` | Auth token for OpenClaw Gateway WebSocket RPC |
| `OPENCLAW_GATEWAY_PORT`  | Gateway port (default `18789`)                |

## Usage

```bash
# Register slash commands with Discord
npm run deploy

# Build (TypeScript → dist/)
npm run build

# Start the bot (production)
npm start

# Start the bot (development, with hot reload)
npm run dev

# Deploy to VM (build + sync + restart)
./deploy.sh

# Register commands on VM
./deploy.sh commands
```

## Commands

### Session Commands (prompt-based, trigger agent immediately)

| Command                                             | Type       | Destination     | Description                            |
| --------------------------------------------------- | ---------- | --------------- | -------------------------------------- |
| `/corven prompt`                                    | Routed     | `#corven`       | Quick session with Corven              |
| `/session prompt [agent]`                           | Contextual | Current channel | Start agent session in current channel |
| `/growth prompt`                                    | Routed     | `#growth`       | Campaigns, outbound, ICP               |
| `/content prompt`                                   | Routed     | `#content`      | Posts, copy, content calendar          |
| `/ops prompt`                                       | Routed     | `#ops`          | Checklists, tracking, reports          |
| `/leads prompt`                                     | Routed     | `#growth`       | Lead generation (routes to growth)     |
| `/decision title [context] [alternatives] [impact]` | Routed     | `#squad-feed`   | Log a decision as a rich embed         |

### Infrastructure Commands

| Command                           | Description                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `/setup full [clean:True]`        | Full idempotent setup. Optional `clean` deletes everything not in architecture first |
| `/setup update`                   | Reconcile — creates missing, updates drifted, never deletes                          |
| `/setup verify`                   | Read-only drift detection report                                                     |
| `/create role\|channel\|category` | Create a single item                                                                 |
| `/assign role <user> <role>`      | Assign a role to a user                                                              |
| `/permissions show\|set`          | View or modify channel permissions                                                   |
| `/audit`                          | Dump current server structure to `#audit-log`                                        |
| `/status`                         | Bot uptime, ping, server stats                                                       |

All responses are **ephemeral** (only visible to the command invoker).

## Server Structure

Sentinel builds this structure from `src/config/server-architecture.ts`:

```
Flare
├── 🤖 AGENTS (pos 0)
│   ├── #corven          — Freeform 1:1 with Corven 🪶
│   └── 🔊 Voice — Corven
│
├── 🚀 SQUADS (pos 1)
│   ├── #growth          — Campaigns, outbound, ICP, lead lists
│   ├── #content         — Posts, copy, CTAs, content calendar
│   ├── #ops             — Checklists, tracking, weekly reports
│   ├── #research        — Blog-roll style research summaries
│   └── #squad-feed      — Daily standups, agent status, decisions
│
└── 🔧 META (pos 2)
    ├── #bot-commands
    ├── #audit-log
    └── #server-config
```

## How Agent Sessions Work

1. Use a session command with a **prompt** (e.g. `/corven prompt:"help me think through pricing"`)
2. Sentinel creates a thread named after the prompt (truncated to ~80 chars)
3. Sentinel adds you and Corven's bot account to the thread
4. Sentinel triggers the agent via **OpenClaw Gateway WebSocket RPC** with the prompt
5. Corven responds in the thread automatically — no @mention needed
6. Follow-up messages in the thread are handled normally by OpenClaw's Discord integration
7. After 24h of inactivity, the thread auto-archives (still searchable)

**Routed commands** (e.g. `/growth` typed from `#corven`) create the thread in the **destination channel** and reply ephemerally in the invoking channel with a link.

### OpenClaw Integration

Sentinel connects to OpenClaw's Gateway via WebSocket (protocol v3) on startup. Agent triggers use a dual-path approach:

- **Primary:** WebSocket RPC `agent` method — explicit `sessionKey`, `threadId`, `deliver` params
- **Fallback:** HTTP `POST /hooks/agent` — used if WS is disconnected

The WebSocket client auto-reconnects on disconnection. See `docs/HOOKS_THREAD_DELIVERY_RESOLUTION.md` for the full technical story.

## Key Design Decisions

- **Architecture-as-code** — `src/config/server-architecture.ts` is the single source of truth. Change the config, re-run `/setup full` or `/setup update`.
- **Prompt-first sessions** — Every session command takes a mandatory `prompt`. The prompt becomes the thread name and the agent's initial instruction. No empty threads, no @mentioning.
- **Dual-path agent trigger** — WebSocket RPC primary, HTTP hooks fallback. Ensures agent delivery even if WebSocket drops.
- **Idempotent** — `/setup full` can be run repeatedly without duplicating anything.
- **Non-destructive by default** — `/setup update` only creates and updates, never deletes. Use `/setup full clean:True` for deletion.
- **No database** — All state lives in Discord itself and the config file.
- **Bot demotion** — After setup, Administrator is replaced with minimal permissions to limit blast radius.
- **Managed bot roles** — Discord auto-creates roles for bots. Sentinel finds them at runtime via `resolveRole()`, never creates them.
- **Secure by default** — `@everyone` sees nothing. Each category explicitly grants access to the roles that need it.

## Project Structure

```
sentinel/
├── config.json                       # Bot token, clientId, guildId (GITIGNORED)
├── config.example.json               # Template for config.json
├── deploy.sh                         # Build + sync to VM + restart
├── docs/
│   ├── HOOKS_THREAD_DELIVERY_RESOLUTION.md  # WebSocket RPC migration story
│   ├── SERVER_ARCHITECTURE.md               # Human-readable server spec
│   └── SQUAD_MIGRATION_PLAN.md              # Squad restructure plan + templates
├── src/
│   ├── index.ts                      # Entry point — client setup, WS connect, event registration
│   ├── deploy-commands.ts            # Registers slash commands with Discord API
│   ├── types.ts                      # Command interface + client augmentation
│   ├── config/
│   │   └── server-architecture.ts    # Source of truth — roles, categories, channels, permissions,
│   │                                 #   command routing, channel-agent defaults
│   ├── commands/
│   │   ├── agents/
│   │   │   ├── corven.ts             # /corven prompt — routed to #corven
│   │   │   ├── session.ts            # /session prompt [agent] — contextual
│   │   │   ├── growth.ts             # /growth prompt — routed to #growth
│   │   │   ├── content.ts            # /content prompt — routed to #content
│   │   │   ├── ops.ts                # /ops prompt — routed to #ops
│   │   │   └── leads.ts              # /leads prompt — routed to #growth
│   │   ├── decision.ts               # /decision — embed to #squad-feed
│   │   ├── setup/index.ts            # /setup full | update | verify
│   │   ├── create/index.ts           # /create role|channel|category
│   │   ├── assign/index.ts           # /assign role <user> <role>
│   │   ├── permissions/index.ts      # /permissions show|set
│   │   ├── audit.ts                  # /audit — dump server structure
│   │   └── status.ts                 # /status — bot health check
│   ├── services/
│   │   ├── openclaw-ws.ts            # Gateway WebSocket RPC client (connect, auth, reconnect)
│   │   ├── openclaw-client.ts        # Dual-path agent trigger (WS primary, HTTP fallback)
│   │   ├── thread-creator.ts         # Thread creation + member discovery + agent trigger
│   │   ├── setup-executor.ts         # Full bootstrap with optional --clean
│   │   ├── update-executor.ts        # Reconciliation (create + update only)
│   │   ├── verify-executor.ts        # Read-only drift detection
│   │   ├── position-enforcer.ts      # Batch position enforcement
│   │   └── audit-logger.ts           # Structured logging to #audit-log
│   ├── events/
│   │   ├── ready.ts                  # Client ready handler
│   │   ├── interaction-create.ts     # Slash command router
│   │   └── message-create.ts         # Dedupe handler for Corven messages
│   └── utils/
│       ├── constants.ts              # Colors, category names, archive duration
│       └── helpers.ts                # Date formatting, prompt truncation
├── package.json
└── tsconfig.json
```

## Tech Stack

- **Runtime:** Node.js ≥ 22 (ESM, built-in WebSocket)
- **Language:** TypeScript (strict mode)
- **Framework:** [discord.js](https://discord.js.org/) v14
- **Dev tooling:** [tsx](https://github.com/privatenumber/tsx) for development
- **Agent integration:** OpenClaw Gateway WebSocket RPC (protocol v3)

## License

UNLICENSED — Private project.
