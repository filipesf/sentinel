# Discord Server Architecture

> **Server Name:** Flare
> **Purpose:** AI-agent command center and operational workspace.
> **Owner:** Filipe Fernandes

---

## Design Principles

1. **Agent-native** — Agents are first-class citizens. They have their own channels, roles, and dedicated workspaces. Humans interact _with_ and _through_ agents.
2. **Squad-oriented** — Work is organized by function (growth, content, ops), not by personal/professional divide. Each squad channel is a domain workspace.
3. **ADHD-friendly** — Minimal noise, obvious naming, consistent patterns. If you have to think about where something goes, the structure failed.
4. **Growth-ready** — The structure accommodates a solo founder today, a small team tomorrow, and a full company later. Categories and roles are designed to be added to, not restructured.
5. **Secure by default** — Least-privilege permissions. Agents only see what they need. Visitors see nothing by default.

---

## Agent Behavior

### Thread-based sessions

All agent conversations happen **inside threads**, never in the main channel body. Each thread is a self-contained session — like a conversation in WhatsApp or a chat window. This keeps channels clean, contexts isolated, and history browsable.

**Main channels are indexes, not chat rooms.** When you open any channel, you see a list of thread titles — not a wall of messages.

### Starting a session

Every session command takes a **mandatory prompt** that becomes both the thread name and the agent's initial instruction. No empty threads, no generic titles, no @mentioning required.

```
/corven prompt:"help me think through the pricing for Ignite"
```

What happens:

1. Sentinel resolves the destination channel (routed commands always go to a fixed channel; `/session` uses the current channel)
2. Sentinel derives a thread name from the prompt (first ~80 chars, cleaned up)
3. Sentinel creates a thread in the destination channel
4. Sentinel adds you and Corven's bot account to the thread
5. Sentinel triggers the agent via **OpenClaw Gateway WebSocket RPC** with the prompt
6. Corven responds in the thread automatically — no @mention needed
7. Follow-up messages in the thread are handled normally by OpenClaw's Discord integration
8. After 24h of inactivity, the thread auto-archives (still searchable and readable)

**Routed commands** (e.g. `/growth` typed from `#corven`) create the thread in the **destination channel** and reply ephemerally in the invoking channel with a link.

### Channel awareness

The agent receives the **channel name and category** as context. Corven uses this to switch between squad contexts in its workspace (see `OPERATING_SYSTEM.md`):

- `/growth prompt:"..."` → Thread in `#growth` — Corven activates growth context
- `/content prompt:"..."` → Thread in `#content` — Corven activates content context
- `/ops prompt:"..."` → Thread in `#ops` — Corven activates ops context
- `/corven prompt:"..."` → Thread in `#corven` — freeform 1:1 conversation

All commands route to **Corven** (single-agent runtime). When dedicated squad agents are added to OpenClaw, update `activeAgents` and `channelAgentDefaults` in `server-architecture.ts`.

### Per-agent commands

| Command                   | Destination     | Notes                                              |
| ------------------------- | --------------- | -------------------------------------------------- |
| `/corven prompt`          | `#corven`       | Routed — always creates thread in `#corven`        |
| `/session prompt [agent]` | Current channel | Contextual — thread in whatever channel you're in  |
| `/growth prompt`          | `#growth`       | Routed — campaigns, outbound, ICP                  |
| `/content prompt`         | `#content`      | Routed — posts, copy, content calendar             |
| `/ops prompt`             | `#ops`          | Routed — checklists, tracking, reports             |
| `/leads prompt`           | `#growth`       | Routed — lead generation (routes to growth)        |
| `/decision title`         | `#squad-feed`   | Routed — posts a decision embed (no agent session)      |
| `/standup [agent]`        | `#squad-feed`   | Routed — posts standup embed (Corven only, single agent)|
| `/report type`            | `#ops`          | Routed — posts weekly report or daily checklist (Corven)|

**Validation:** The bot verifies the agent has access to the destination channel before creating the thread. If the agent lacks access, the bot responds with an ephemeral error.

### Thread naming

Thread names are derived from the prompt:

| Input                                                                          | Thread name                                                                |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `"build outbound sequence for Dublin hotels"`                                  | `build outbound sequence for Dublin hotels`                                |
| `"write me a blog post about the impact of AI on hotel marketing based on..."` | `write me a blog post about the impact of AI on hotel marketing based on…` |

Prompts are truncated to ~80 characters with markdown/special characters stripped.

### Auto-archive

- **Duration:** 24 hours of inactivity
- **What it means:** Thread drops off the active list, but remains in the channel — fully searchable, fully readable
- **Reopening:** Just post in the thread to unarchive it instantly

---

## Active Agents

> **Current runtime: Corven-only.** All squad channels route to Corven, which uses workspace context-switching (see `OPERATING_SYSTEM.md` in the Corven workspace). The `agentConfigs` in code define future squad agents (`flare-growth`, `flare-content`, `flare-ops`, `flare-leads`) but they are **not registered in OpenClaw** and cannot respond to messages. The `activeAgents` list in `server-architecture.ts` controls which agents appear in dropdowns and standups.

### Corven 🪶 (active — single agent)

- **Role:** Personal companion + multi-context squad operator
- **Discord role:** `Corven` (managed bot role, auto-created by Discord)
- **Backend:** OpenClaw gateway running in Docker on `openclaw-vm`
- **Access:** AGENTS, SQUADS categories
- **Commands:** `/corven`, `/session`, `/growth`, `/content`, `/ops`, `/leads`
- **Context switching:** Channel name determines which squad context Corven loads from its workspace (`work/flare/squads/<squad>/WORKING.md`)

### Future squad agents (defined in code, not yet active)

These configs exist in `agentConfigs` for forward-compatibility. They will become active when registered in OpenClaw and added to `activeAgents`:

| Key             | Emoji | Default channel | Purpose                                       |
| --------------- | ----- | --------------- | --------------------------------------------- |
| `flare-growth`  | 🎯    | `#growth`       | Pipeline & outbound — campaigns, ICP, leads   |
| `flare-content` | 📝    | `#content`      | Content marketing — posts, copy, calendar     |
| `flare-ops`     | 📋    | `#ops`          | Operations & tracking — checklists, reports   |
| `flare-leads`   | 🔍    | `#growth`       | Lead list builder — enrichment, prospecting   |

---

## Roles

Roles are organized in a strict hierarchy. Higher position = more power.

### Hierarchy (top to bottom)

| Position | Role         | Color                  | Hoisted | Purpose                                 |
| -------- | ------------ | ---------------------- | ------- | --------------------------------------- |
| 8        | `@Owner`     | `#e74c3c` (red)        | Yes     | Filipe only. Full control.              |
| 7        | `@Setup Bot` | `#95a5a6` (grey)       | No      | The setup bot itself (managed)          |
| 6        | `@Admin`     | `#e67e22` (orange)     | Yes     | Future human admins / co-founders       |
| —        | `@Corven`    | _(managed by Discord)_ | —       | Corven's managed bot role               |
| 3        | `@Agent`     | `#3498db` (blue)       | Yes     | Base role for all agents                |
| 2        | `@Team`      | `#2ecc71` (green)      | Yes     | Future employees / collaborators        |
| 1        | `@Guest`     | `#bdc3c7` (light grey) | No      | External visitors, clients, contractors |
| —        | `@everyone`  | —                      | No      | Default. Sees nothing.                  |

### Role Design Notes

- **`@Agent` is a base role.** Every agent bot account gets `@Agent` + their managed bot role. The `@Agent` role carries shared permissions. Per-agent managed roles carry **no server-wide permissions** — they exist purely for channel-level `ViewChannel` overwrites.
- **Managed bot roles.** Discord auto-creates a role for each bot when it joins (e.g., `@Corven`, `@Setup Bot`). Sentinel never creates these — only finds them at runtime via `resolveRole()`. They're referenced by name in channel/category overwrites.
- **`@everyone` sees nothing by default.** Every category explicitly grants access to the roles that need it.
- **Bot demotion is active.** After setup, `@Setup Bot` is demoted from Administrator to minimal permissions (ManageRoles, ManageChannels, ManageMessages, ManageThreads, ViewChannel, SendMessages, SendMessagesInThreads, EmbedLinks, ReadMessageHistory).

### Key Permission Sets

#### `@Agent` (base role for all agents)

```
ViewChannel, SendMessages, SendMessagesInThreads, CreatePublicThreads,
ManageThreads, ManageEvents, ReadMessageHistory, EmbedLinks, AttachFiles,
AddReactions, UseExternalEmojis, Connect, Speak
```

#### `@Team`

```
ViewChannel, SendMessages, SendMessagesInThreads, CreatePublicThreads,
ReadMessageHistory, AddReactions
```

#### `@Guest`

```
ViewChannel, SendMessages, ReadMessageHistory, AddReactions
```

---

## Channel Architecture

### Overview

```
Flare
│
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

---

### Category Details

#### 🤖 AGENTS

> Dedicated agent workspace. Use `/corven prompt:"..."` for freeform 1:1 conversations. Use other session commands for domain-specific work in SQUADS.

| Channel          | Topic                                         | Type  | Access              |
| ---------------- | --------------------------------------------- | ----- | ------------------- |
| `#corven`        | Freeform threads with Corven 🪶 — use /corven | Text  | `@Owner`, `@Corven` |
| `Voice — Corven` | —                                             | Voice | `@Owner`, `@Corven` |

**Permissions:**

- `@everyone`: Deny `ViewChannel`
- `@Corven`: Allow `ViewChannel`, `SendMessages`, `SendMessagesInThreads`, `ReadMessageHistory`, `EmbedLinks`

---

#### 🚀 SQUADS

> Functional workspaces organized by business domain. Each channel has a routed command shorthand. Team members can see and participate.

| Channel       | Topic                                                        | Type | Access                       |
| ------------- | ------------------------------------------------------------ | ---- | ---------------------------- |
| `#growth`     | Campaigns, outbound, ICP, lead lists — use /growth or /leads | Text | `@Owner`, `@Corven`, `@Team` |
| `#content`    | Posts, copy, CTAs, content calendar — use /content           | Text | `@Owner`, `@Corven`, `@Team` |
| `#ops`        | Checklists, tracking, weekly reports — use /ops              | Text | `@Owner`, `@Corven`, `@Team` |
| `#research`   | Blog-roll style: compact research summaries                  | Text | `@Owner`, `@Corven`, `@Team` |
| `#squad-feed` | Daily standups, agent status, decisions                      | Text | `@Owner`, `@Corven`, `@Team` |

**Permissions:**

- `@everyone`: Deny `ViewChannel`
- `@Corven`: Allow `ViewChannel`, `SendMessages`, `SendMessagesInThreads`, `ReadMessageHistory`, `EmbedLinks`
- `@Team`: Allow `ViewChannel`, `SendMessages`, `SendMessagesInThreads`, `ReadMessageHistory`

---

#### 🔧 META

> The backstage. Infrastructure, not content. This is where you manage the server itself.

| Channel          | What goes here                                  | Who writes   | Who reads   |
| ---------------- | ----------------------------------------------- | ------------ | ----------- |
| `#bot-commands`  | Slash commands for the setup bot                | You, Admins  | You, Admins |
| `#audit-log`     | Immutable record of every server change         | Setup bot    | You, Admins |
| `#server-config` | Human-readable notes about current server state | You (manual) | You         |

**Permissions:**

- `@everyone`: Deny `ViewChannel`
- `@Agent`: Deny `ViewChannel` (agents don't need to see meta)
- `@Admin`: Allow `ViewChannel`, `SendMessages`, `SendMessagesInThreads`, `ReadMessageHistory`
- Exception: `@Agent` gets `SendMessages` in `#audit-log` only (to post their own logs)

**Note:** OpenClaw slash commands (`/activation`, `/model`, etc.) only work in channels where Corven has `ViewChannel` permission — NOT in `#bot-commands`.

---

## Permission Matrix

| Category  | `@everyone` | `@Guest` | `@Team` | `@Agent` | `@Corven` | `@Admin` | `@Owner` |
| --------- | ----------- | -------- | ------- | -------- | --------- | -------- | -------- |
| 🤖 Agents | ❌          | ❌       | ❌      | ❌       | ✅        | ❌       | ✅       |
| 🚀 Squads | ❌          | ❌       | ✅      | ❌       | ✅        | ✅       | ✅       |
| 🔧 Meta   | ❌          | ❌       | ❌      | ❌\*     | ❌\*      | ✅       | ✅       |

`*` = per-channel overrides (see category details above)

---

## Bot Scope (Sentinel / Setup Bot)

This bot exists to **bootstrap and maintain** the server and **trigger agent sessions**. It is NOT an AI agent — it is infrastructure.

### What the bot does

1. **Initial setup** — Create all roles, categories, channels, and permission overwrites from architecture config
2. **Reconciliation** — `/setup update` creates missing, updates drifted (never deletes)
3. **Cleanup** — `/setup full clean:True` deletes all channels/categories not in the architecture, then runs full setup
4. **Drift detection** — `/setup verify` reports what matches, what's missing, what's extra
5. **Incremental changes** — `/create`, `/assign`, `/permissions` for one-off changes
6. **Audit logging** — Every action logged to `#audit-log`
7. **Agent sessions** — Session commands create threads with prompt-derived names and trigger the agent via OpenClaw Gateway WebSocket RPC
8. **Decision logging** — `/decision` posts structured embeds to `#squad-feed`

### What the bot does NOT do

- Chat with users (that's Corven's job via OpenClaw)
- Monitor messages or moderate
- Respond to non-slash-command messages (except dedupe handling for Corven)
- Delete anything unless `--clean` is explicitly used

### Slash Commands

**Session & activity commands (9):**

| Command                                             | Type       | Destination     | Description                            |
| --------------------------------------------------- | ---------- | --------------- | -------------------------------------- |
| `/corven prompt`                                    | Routed     | `#corven`       | Quick session with Corven              |
| `/session prompt [agent]`                           | Contextual | Current channel | Start agent session in current channel |
| `/growth prompt`                                    | Routed     | `#growth`       | Campaign/outbound session              |
| `/content prompt`                                   | Routed     | `#content`      | Content creation session               |
| `/ops prompt`                                       | Routed     | `#ops`          | Operations session                     |
| `/leads prompt`                                     | Routed     | `#growth`       | Lead generation session                |
| `/decision title [context] [alternatives] [impact]` | Routed     | `#squad-feed`   | Log a decision (embed)                        |
| `/standup [agent]`                                  | Routed     | `#squad-feed`   | Post standup (active agents only — Corven)    |
| `/report type`                                      | Routed     | `#ops`          | Post weekly report or daily checklist (Corven)|

**Infrastructure commands (8):**

| Command                           | Description                                                           |
| --------------------------------- | --------------------------------------------------------------------- |
| `/setup full [clean:True]`        | Full setup. Optional `--clean` deletes everything not in architecture |
| `/setup update`                   | Reconcile — creates missing, updates drifted, never deletes           |
| `/setup verify`                   | Read-only drift detection                                             |
| `/create role\|channel\|category` | Create a single item                                                  |
| `/assign role <user> <role>`      | Assign a role to a user                                               |
| `/permissions show\|set`          | View or modify channel permissions                                    |
| `/audit`                          | Dump current server structure to `#audit-log`                         |
| `/status`                         | Bot uptime, ping, server stats                                        |

### The `clean` flag

`/setup full clean:True` deletes everything not in the architecture before running setup:

1. **Pass 1:** Delete extra channels inside config-defined categories
2. **Pass 2:** Delete entire categories not in the config (with all their children)
3. **Pass 3:** Delete orphan channels with no parent category
4. Then proceeds with normal setup

**Caveat:** If you run this from a channel that gets deleted, the deferred reply fails. Run from `#bot-commands` to be safe.

---

## Expansion Playbook

### Adding a new agent

1. Create the agent's bot account and invite it to the server
2. Add the agent to `agentConfigs` in `server-architecture.ts`
3. Create a channel `#<name>` in the appropriate category with overwrites
4. Register a `/<name>` slash command
5. Assign the agent `@Agent` role
6. Run `/setup update`

### Adding a team member

1. Assign `@Team` role
2. They automatically see: 🚀 SQUADS
3. For elevated access, also assign `@Admin`

---

## Two Bots, Two Sets of Commands

Sentinel and Corven are separate Discord applications with different bot tokens:

- **Sentinel** registers: `/setup`, `/corven`, `/session`, `/growth`, `/content`, `/ops`, `/leads`, `/decision`, `/standup`, `/report`, `/create`, `/assign`, `/permissions`, `/audit`, `/status`
- **OpenClaw/Corven** registers: `/activation`, `/model`, `/focus`, `/unfocus`, `/agents`

They coexist in the same server. OpenClaw's commands only work in channels where Corven has `ViewChannel`.

---

## File Reference

| File                                       | Purpose                                                  |
| ------------------------------------------ | -------------------------------------------------------- |
| `docs/SERVER_ARCHITECTURE.md`              | This document — human-readable server spec               |
| `docs/SQUAD_MIGRATION_PLAN.md`             | Squad restructure plan, templates, formatting strategy   |
| `docs/HOOKS_THREAD_DELIVERY_RESOLUTION.md` | WebSocket RPC migration: root cause + protocol reference |
| `src/config/server-architecture.ts`        | Source of truth — architecture as code                   |
| `src/services/openclaw-ws.ts`              | Gateway WebSocket RPC client                             |
| `src/services/openclaw-client.ts`          | Dual-path agent trigger (WS + HTTP fallback)             |
| `src/commands/standup.ts`                  | `/standup` — Corven standup embed to `#squad-feed`       |
| `src/commands/report.ts`                   | `/report` — weekly summary / daily checklist to `#ops` (Corven) |
| `src/services/thread-creator.ts`           | Agent thread creation + member addition + agent trigger  |
| `src/services/setup-executor.ts`           | `/setup full` — idempotent bootstrap with `--clean`      |
| `src/services/update-executor.ts`          | `/setup update` — reconciliation (create + update only)  |
| `src/services/verify-executor.ts`          | `/setup verify` — read-only drift detection              |
| `src/services/position-enforcer.ts`        | Batch position enforcement for categories + channels     |
| `src/services/audit-logger.ts`             | Structured logging to `#audit-log`                       |
