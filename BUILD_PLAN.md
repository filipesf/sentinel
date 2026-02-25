# Build Plan — Discord Setup Bot

> A single Discord bot (`discord.js` v14, Node.js, TypeScript) that bootstraps and maintains the Flare server from the architecture spec.

---

## What we built

1. Bootstraps the entire server from `server-architecture.ts` via `/setup full`
2. Reconciles drift via `/setup update` (creates missing, updates drifted, never deletes)
3. Cleans non-config items via `/setup full clean:True`
4. Detects drift via `/setup verify` (read-only)
5. Provides incremental management commands (`/create`, `/assign`, `/permissions`, `/audit`)
6. Provides agent session command (`/corven`) that creates blank threads
7. Logs everything to `#audit-log`

**This bot is NOT Corven.** It's infrastructure. Corven's AI backend is OpenClaw running in a separate VM. This bot just builds and maintains the stage Corven performs on.

---

## Project Structure

```
discord/
├── .gitignore                      # node_modules, dist, config.json, .env
├── package.json                    # ESM project, discord.js v14, tsx for dev
├── tsconfig.json                   # Node16 module, strict TypeScript
├── config.json                     # Bot token, clientId, guildId (GITIGNORED)
├── config.example.json             # Template for config.json
├── src/
│   ├── index.ts                    # Entry point — client, 7 commands, events
│   ├── deploy-commands.ts          # Registers 7 slash commands with Discord API
│   ├── types.ts                    # Command interface + client augmentation
│   ├── config/
│   │   └── server-architecture.ts  # THE source of truth — roles, categories, channels,
│   │                                 permissions, agent configs
│   ├── commands/
│   │   ├── setup/
│   │   │   └── index.ts            # /setup full [clean:True] | update | verify
│   │   ├── create/
│   │   │   └── index.ts            # /create role|channel|category
│   │   ├── assign/
│   │   │   └── index.ts            # /assign role <user> <role>
│   │   ├── permissions/
│   │   │   └── index.ts            # /permissions show|set
│   │   ├── agents/
│   │   │   └── corven.ts           # /corven — blank thread, no params
│   │   ├── audit.ts                # /audit — dumps server structure to #audit-log
│   │   └── status.ts               # /status — bot uptime, ping, server stats
│   ├── events/
│   │   ├── ready.ts                # Client ready handler
│   │   └── interaction-create.ts   # Slash command router (with crash-safe error handling)
│   ├── services/
│   │   ├── setup-executor.ts       # /setup full — idempotent bootstrap with --clean
│   │   ├── update-executor.ts      # /setup update — reconciliation (create + update only)
│   │   ├── verify-executor.ts      # /setup verify — read-only drift detection
│   │   ├── position-enforcer.ts    # Batch position enforcement for categories + channels
│   │   ├── thread-creator.ts       # Agent thread creation + member addition + bot discovery
│   │   └── audit-logger.ts         # Structured logging to #audit-log
│   └── utils/
│       ├── constants.ts            # Colors, category names, archive duration
│       └── helpers.ts              # Date formatting
├── BUILD_PLAN.md                   # This file
├── SERVER_ARCHITECTURE.md          # Human-readable spec (synced with code)
├── SESSION_SUMMARY.md              # Session context for AI assistants
└── DISCORD_JS_REFERENCE.md         # discord.js v14 API reference
```

---

## Build Phases

### Phase 1 — Skeleton ✅

- `package.json`, `tsconfig.json`, `.gitignore`
- `src/index.ts` — client connects, loads commands and events
- `src/events/ready.ts` and `src/events/interaction-create.ts`
- `/status` command to verify bot works
- `src/deploy-commands.ts` to register commands

### Phase 2 — Architecture as Code ✅

- `src/config/server-architecture.ts` — entire architecture encoded as typed TypeScript data structures
- Single source of truth the bot reads from
- Change the config, re-run `/setup full` or `/setup update`

### Phase 3 — `/setup full` ✅

1. _(Optional `clean:True`)_ Delete all channels/categories not in the architecture
2. Create roles (managed roles found + updated, not created)
3. Position roles in hierarchy
4. Lock `@everyone` (deny ViewChannel server-wide)
5. Create categories with category-level permission overwrites
6. Create channels (text + voice) with topics and channel-level overwrites
7. Set `defaultAutoArchiveDuration` on text channels
8. Enforce category and channel positions (batch API)
9. Assign `@Owner` to Filipe
10. Post summary to `#audit-log`
11. Demote bot role from Administrator to minimal permissions

### Phase 3b — `/setup update` ✅

- Creates anything missing (roles, categories, channels)
- Updates anything drifted (colors, topics, permissions, auto-archive, positions)
- Never deletes anything
- Reports all changes or "No Changes Needed"

### Phase 4 — `/setup verify` ✅

- Compares server state against architecture config
- Reports: matching, missing, extra (including extra channels within categories), misconfigured
- Read-only — makes no changes

### Phase 5 — Agent Session Commands ✅

- `/corven` — no params, creates blank thread (`YYYYMMDD — New session`)
- Adds invoker + Corven bot to thread via managed role discovery
- Validates agent has access to current channel
- User @mentions Corven to start chatting (OpenClaw picks up the message)

### Phase 6 — Incremental Management Commands ✅

- `/create role|channel|category`
- `/assign role`
- `/permissions show|set`
- `/audit` — dumps current server structure
- All log to `#audit-log`

### Phase 7 — Audit Logger ✅

- Every bot action posts a structured entry to `#audit-log`
- Format: embed with timestamp, type, and description

---

## Key Decisions

- **Architecture-as-code** — `server-architecture.ts` is the source of truth. Markdown docs are for humans and must be synced manually.
- **Idempotent setup** — `/setup full` can be run repeatedly without duplicating anything.
- **Non-destructive update** — `/setup update` only creates and updates, never deletes. Use `--clean` for deletion.
- **Comprehensive clean** — `--clean` deletes extra channels in config categories, entire non-config categories, and orphan channels. Not just Discord defaults.
- **Managed bot roles** — Discord auto-creates roles for bots. Sentinel never creates these, only references them by name in overwrites. `resolveRole()` finds them at runtime.
- **Single role per agent** — No separate "custom permission role" vs "managed bot role". The managed bot role IS the role used in channel overwrites.
- **Bot demotion** — After setup, Administrator is replaced with minimal permissions. Limits blast radius if token leaks.
- **Ephemeral responses** — All bot command responses are ephemeral except thread creation.
- **No database** — All state lives in Discord itself and the config file.
- **Two bots** — Sentinel (infrastructure) and Corven/OpenClaw (AI) are separate Discord applications with different tokens and commands.

---

## Checklist

### Prerequisites ✅

- [x] Discord application + bot created
- [x] Privileged intents enabled (GuildMembers, MessageContent)
- [x] Bot invited to server with Administrator
- [x] `config.json` created with token, clientId, guildId

### All Phases ✅

- [x] Phase 1 — Skeleton (bot connects, `/status` works)
- [x] Phase 2 — Architecture as code (typed config)
- [x] Phase 3 — `/setup full` with `--clean`, bot demotion active
- [x] Phase 3b — `/setup update` (create + update, never delete)
- [x] Phase 4 — `/setup verify` (read-only drift detection, detects extra channels)
- [x] Phase 5 — `/corven` (blank thread, no params, user @mentions agent)
- [x] Phase 6 — Incremental commands (`/create`, `/assign`, `/permissions`, `/audit`)
- [x] Phase 7 — Audit logger (structured entries to `#audit-log`)

### Post-Build ✅

- [x] Bot demotion active (step 11 in setup-executor)
- [x] Corven bot account added and responding via OpenClaw
- [x] Lumi removed from codebase (workspace preserved on VM)
- [x] Command Center category removed (unused)
- [x] TTRPG category removed
- [x] `--clean` expanded to delete all non-config items (not just Discord defaults)
- [x] Markdown docs synced with code

### Remaining

- [ ] Thread auto-rename — After first exchange, rename from "New session" to something descriptive
- [ ] Re-add Lumi when ready (add to agentConfigs, create channels, register `/lumi` command)
