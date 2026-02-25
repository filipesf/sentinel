# Goal

Build and maintain a Discord setup bot ("Sentinel") that bootstraps a Discord server ("Flare") as an AI-agent command center for Filipe Fernandes. The bot creates roles, categories, channels, and permissions from an architecture spec. AI agents (currently only Corven 🪶) are powered by OpenClaw's Discord integration running on a separate VM — Sentinel is infrastructure only.

## Instructions

- **The bot is infrastructure, NOT an AI agent.** Corven's AI backend is OpenClaw running in an OrbStack VM (`openclaw-vm`). Sentinel just creates/maintains server structure.
- **The bot runs locally on Filipe's Mac** (`~/Code/discord/`). OpenClaw runs in `openclaw-vm` Docker container.
- **Architecture-as-code**: `src/config/server-architecture.ts` is the source of truth. Markdown docs (`SERVER_ARCHITECTURE.md`, `BUILD_PLAN.md`) should stay in sync manually.
- **Idempotent setup**: `/setup full` creates everything, skips what exists. `/setup full clean:True` deletes all channels/categories not in the architecture first. `/setup update` reconciles (creates missing, updates drifted — never deletes).
- **Ephemeral responses**: All bot command responses are ephemeral.
- **No database**: All state lives in Discord + config file.
- **Agent roles are managed by Discord**: Corven's role is the managed bot role Discord auto-creates. There are NO separate custom permission roles — the managed bot role is used directly in channel/category overwrites.
- **`/corven` takes no params**: Creates a blank thread (`YYYYMMDD — New session`), adds user + Corven bot, replies ephemerally with instructions to @mention Corven. The user posts the first message so OpenClaw sees a real user message and responds.
- **OpenClaw slash commands** (`/activation`, `/model`, etc.) only work in channels where Corven has ViewChannel permission — NOT in `#bot-commands` (META category denies Agent ViewChannel).
- **Lumi is removed**: All Lumi references have been removed from the codebase. Lumi's workspace is preserved on the OpenClaw VM (`~/.openclaw/workspace-lumi/`) but is not configured anywhere in the Discord bot. She will be re-added when ready.

## Discoveries

- **OpenClaw Discord integration is working**: Corven bot (ID `1475916909647233208`) is connected via OpenClaw, guild `1202363522177310740` is allowed with `requireMention: false`. OpenClaw responds to user messages in allowed channels.
- **Sentinel must NOT post first messages in threads**: OpenClaw ignores bot messages. The user must @mention Corven themselves for OpenClaw to respond.
- **Bot demotion is active**: Setup Bot role was demoted from Administrator to minimal permissions (ManageRoles, ManageChannels, etc.). This means Sentinel can't edit managed bot roles (causes `50013: Missing Permissions` — harmless for overwrites).
- **Managed bot role naming**: Discord's managed role for Corven is named "Corven". The config references `"Corven"` in overwrites and `resolveRole()` finds it at runtime. No separate custom permission roles exist.
- **`resolveRole()` silently skips missing roles**: When `/setup full` ran before Corven joined, all Corven overwrites were skipped. `/setup update` fixes this since the role now exists.
- **`/setup update` never deletes**: It only creates missing and updates drifted. To remove extra channels/categories, use `/setup full clean:True`.
- **`/setup full clean:True` is comprehensive**: Deletes extra channels inside config-defined categories, entire categories not in the config (with their children), and orphan channels with no parent. Then proceeds with normal setup.
- **Two bots, two sets of slash commands**: Sentinel registers `/setup`, `/corven`, `/create`, etc. OpenClaw/Corven registers `/activation`, `/model`, etc. Different Discord application IDs.

## Accomplished

### Completed in previous sessions:

- Full bot skeleton, all slash commands registered and working
- Server architecture as code with all roles, categories, channels, permissions
- `/setup full` — idempotent bootstrap (with `--clean` flag, bot demotion)
- `/setup update` — reconciliation (create + update, never deletes)
- `/setup verify` — read-only drift detection (detects extra channels within categories)
- `/corven` — agent session thread creation (no params, blank thread)
- `/create`, `/assign`, `/permissions`, `/audit` — incremental management
- Position enforcement, voice channels, crash prevention

### Completed in this session:

- [x] Diagnosed "unauthorized" error — OpenClaw's `/activation` command run from `#bot-commands` where Corven lacks ViewChannel
- [x] Reworked `/corven` — no params, creates blank thread, user posts first message
- [x] Removed `message` option from slash commands, re-deployed to Discord
- [x] Renamed agent roles from `Agent — Corven`/`Agent — Lumi` to just `Corven`/`Lumi`
- [x] Switched to using Discord's managed bot roles directly for overwrites (no separate custom permission roles)
- [x] Removed Corven/Lumi from `roles[]` array entirely (they're managed, Sentinel doesn't create them)
- [x] Cleaned up `constants.ts` — removed `AGENTS` object, `AGENT_CORVEN`/`AGENT_LUMI` colors
- [x] Updated `resolveRole()` in both executors (simplified back to simple lookup)
- [x] Updated `thread-creator.ts` — uses `agent.roleName` with `r.managed` filter for bot discovery
- [x] Gave Corven access to WORK category (covering for Lumi)
- [x] Updated `AgentConfig` — merged `roleName`/`botRoleName` into single `roleName`
- [x] **Removed all Lumi references from the codebase**:
  - Removed `#lumi` channel and `Voice — Lumi` channel from AGENTS category
  - Removed all `{ role: "Lumi", ... }` overwrites from all categories/channels
  - Removed `lumi` from `agentConfigs` and `"lumi"` from Corven's `deniedChannels`
  - Deleted `/lumi` command (`src/commands/agents/lumi.ts`)
  - Removed Lumi imports/registration from `index.ts` and `deploy-commands.ts`
- [x] **Expanded `--clean` flag**: Now deletes ALL channels/categories not in the architecture (not just Discord defaults). Three passes: extra channels in config categories, entire extra categories with children, orphan channels.
- [x] **`/setup update` no longer deletes**: Reverted channel deletion from update-executor — it's purely additive/update now. Deletion is only via `--clean`.
- [x] **Updated `/setup verify`**: Now detects extra channels within managed categories
- [x] **Removed COMMAND CENTER category**: `#dashboard`, `#agent-logs`, `#notifications` — unused, nothing writes to them
- [x] **Removed TTRPG category**: Empty, not needed right now
- [x] **Reordered categories**: Personal (0) → Work (1) → Agents (2) → Meta (3)
- [x] **Personal**: Renamed `#ideas` → `#finance`, added `#reminders`
- [x] **Work**: Renamed `#general` → `#marketing`, added `#operations`
- [x] **Synced markdown docs**: `SERVER_ARCHITECTURE.md` and `BUILD_PLAN.md` fully rewritten to match current state
- [x] **Re-deployed slash commands**: 7 commands (down from 8, `/lumi` removed)
- [x] Clean TypeScript build confirmed, zero Lumi references in `src/`

### Not yet done / next steps:

- [ ] **Thread auto-rename**: After the first exchange in a thread, rename it from "YYYYMMDD — New session" to something descriptive

## Relevant files / directories

```
/Users/filipefernandes/Code/discord/
├── SESSION_SUMMARY.md                  # Session context
├── SERVER_ARCHITECTURE.md              # Human-readable spec (synced)
├── BUILD_PLAN.md                       # Implementation plan (synced)
├── config.json                         # Bot token, clientId, guildId (GITIGNORED)
├── src/
│   ├── index.ts                        # Entry point — imports & registers 7 commands
│   ├── deploy-commands.ts              # Registers 7 slash commands with Discord API
│   ├── types.ts                        # Command interface
│   ├── config/
│   │   └── server-architecture.ts      # SOURCE OF TRUTH — roles, categories, channels, overwrites, agentConfigs (Lumi removed)
│   ├── commands/
│   │   ├── agents/
│   │   │   └── corven.ts               # /corven — no params, creates blank thread
│   │   ├── setup/
│   │   │   └── index.ts                # /setup full | update | verify
│   │   ├── status.ts
│   │   ├── audit.ts
│   │   ├── create/index.ts
│   │   ├── assign/index.ts
│   │   └── permissions/index.ts
│   ├── services/
│   │   ├── setup-executor.ts           # /setup full — --clean deletes ALL non-config channels/categories
│   │   ├── update-executor.ts          # /setup update — creates + updates only, never deletes
│   │   ├── verify-executor.ts          # /setup verify — detects extra channels within categories
│   │   ├── thread-creator.ts           # Thread creation — no message, uses roleName with managed filter
│   │   ├── position-enforcer.ts
│   │   └── audit-logger.ts
│   ├── events/
│   │   ├── ready.ts
│   │   └── interaction-create.ts
│   └── utils/
│       ├── constants.ts                # Cleaned up — no agent-specific entries
│       └── helpers.ts
```

**OpenClaw VM** (accessed via `orb run -m openclaw-vm`):

- Docker container `openclaw-gateway` running Corven's AI backend
- Config: `channels.discord.guilds.1202363522177310740.requireMention: false`
- Discord bot token in `.env` as `DISCORD_BOT_TOKEN`
- CLI: `docker compose exec openclaw-gateway node dist/index.js <command>`
