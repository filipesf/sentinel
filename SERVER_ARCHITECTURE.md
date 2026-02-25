# Discord Server Architecture

> **Server Name:** Flare
> **Purpose:** AI-agent command center, personal workspace, and eventual company operating system.
> **Owner:** Filipe Fernandes

---

## Design Principles

1. **Agent-native** — Agents are first-class citizens. They have their own channels, roles, and dedicated workspaces. Humans interact _with_ and _through_ agents.
2. **Separation of concerns** — Personal life, work, agents, and infrastructure each have clear boundaries. No cross-contamination.
3. **ADHD-friendly** — Minimal noise, obvious naming, consistent patterns. If you have to think about where something goes, the structure failed.
4. **Growth-ready** — The structure accommodates a solo founder today, a small team tomorrow, and a full company later. Categories and roles are designed to be added to, not restructured.
5. **Secure by default** — Least-privilege permissions. Agents only see what they need. Visitors see nothing by default.

---

## Agent Behavior

### Thread-based sessions

All agent conversations happen **inside threads**, never in the main channel body. Each thread is a self-contained session — like a conversation in WhatsApp or a chat window. This keeps channels clean, contexts isolated, and history browsable.

**Main channels are indexes, not chat rooms.** When you open any channel, you see a list of thread titles — not a wall of messages.

### Starting a session

You use the `/corven` slash command **in the channel you're currently in**:

```
/corven
```

_(typed while in `#journal`)_

What happens:

1. Sentinel creates a new thread **in the current channel** (`#journal`)
2. Thread is named with a timestamp: `20260224 — New session`
3. Sentinel adds you and Corven's bot account to the thread
4. Sentinel replies ephemerally with a link to the thread and instructions
5. **You** @mention Corven in the thread to start chatting
6. OpenClaw's Discord integration picks up your message and Corven responds
7. After the first exchange, the thread can be renamed to something descriptive
8. After 24h of inactivity, the thread auto-archives (still searchable and readable)

**Important:** Sentinel does NOT post any messages in the thread. OpenClaw ignores bot messages — the user must @mention Corven themselves so OpenClaw sees a real user message and responds.

### Channel awareness

The agent receives the **channel name and category** as context. This means:

- `/corven` in `#journal` → Corven knows this is a personal reflection context
- `/corven` in `#research` → Corven knows this is a work research context
- `/corven` in `#corven` → Corven knows this is a freeform 1:1 conversation

### Per-agent commands

| Command   | Creates thread in   | Notes                            |
| --------- | ------------------- | -------------------------------- |
| `/corven` | **Current channel** | No params — creates blank thread |

Future agents get their own command when added to the server.

**Validation:** The bot verifies the agent has access to the current channel before creating the thread. If you try `/corven` in `#bot-commands` (where agents are denied), the bot responds with an ephemeral error.

### Thread naming convention

| Phase   | Thread name                  |
| ------- | ---------------------------- |
| Created | `YYYYMMDD — New session`     |
| Later   | Can be renamed by agent/user |

### Auto-archive

- **Duration:** 24 hours of inactivity
- **What it means:** Thread drops off the active list, but remains in the channel — fully searchable, fully readable
- **Reopening:** Just post in the thread to unarchive it instantly

---

## Active Agents

### Corven 🪶 (active)

- **Role:** Personal companion — warm, playful, creative
- **Discord role:** `Corven` (managed bot role, auto-created by Discord)
- **Backend:** OpenClaw gateway running in `openclaw-vm` Docker container
- **Model:** `gpt-5-mini` (switchable per-session via `/model`)
- **Access:** Personal, Work, Agents categories
- **Command:** `/corven`

### Lumi 💡 (inactive)

Lumi is temporarily removed from the Discord bot and OpenClaw config while Filipe learns the setup. Her workspace is preserved on the OpenClaw VM (`~/.openclaw/workspace-lumi/`). She will be re-added when ready as a professional work assistant.

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
├── 🧠 PERSONAL (pos 0)
│   ├── #journal
│   ├── #finance
│   ├── #reminders
│   ├── #health
│   └── 🔊 Voice — Personal
│
├── 💼 WORK (pos 1)
│   ├── #marketing
│   ├── #operations
│   ├── #tasks
│   ├── #research
│   └── 🔊 Voice — Work
│
├── 🤖 AGENTS (pos 2)
│   ├── #corven
│   ├── #agent-sandbox
│   ├── #agent-to-agent
│   └── 🔊 Voice — Corven
│
└── 🔧 META (pos 3)
    ├── #bot-commands
    ├── #audit-log
    └── #server-config
```

---

### Category Details

#### 🧠 PERSONAL

> Private space. Corven's domain. Only Filipe and Corven. No work agents, no team members, nobody else.

| Channel            | Topic                                   | Type  | Access              |
| ------------------ | --------------------------------------- | ----- | ------------------- |
| `#journal`         | Daily reflections, thoughts, processing | Text  | `@Owner`, `@Corven` |
| `#finance`         | Budgets, expenses, financial planning   | Text  | `@Owner`, `@Corven` |
| `#reminders`       | Reminders, deadlines, follow-ups        | Text  | `@Owner`, `@Corven` |
| `#health`          | ADHD strategies, wellness, routines     | Text  | `@Owner`, `@Corven` |
| `Voice — Personal` | —                                       | Voice | `@Owner`, `@Corven` |

**Permissions:**

- `@everyone`: Deny `ViewChannel`
- `@Corven`: Allow `ViewChannel`, `SendMessages`, `SendMessagesInThreads`, `ReadMessageHistory`, `EmbedLinks`
- `@Team`: Deny `ViewChannel`

---

#### 💼 WORK

> Professional context. Corven has access (covering for Lumi until she's set up). Team members can see and participate.

| Channel        | Topic                                           | Type  | Access                       |
| -------------- | ----------------------------------------------- | ----- | ---------------------------- |
| `#marketing`   | Marketing strategy, campaigns, content planning | Text  | `@Owner`, `@Corven`, `@Team` |
| `#operations`  | Day-to-day operations, processes, logistics     | Text  | `@Owner`, `@Corven`, `@Team` |
| `#tasks`       | Task tracking, to-dos, progress updates         | Text  | `@Owner`, `@Corven`, `@Team` |
| `#research`    | Research findings, articles, analysis           | Text  | `@Owner`, `@Corven`, `@Team` |
| `Voice — Work` | —                                               | Voice | `@Owner`, `@Corven`, `@Team` |

**Permissions:**

- `@everyone`: Deny `ViewChannel`
- `@Corven`: Allow `ViewChannel`, `SendMessages`, `SendMessagesInThreads`, `ReadMessageHistory`, `EmbedLinks`
- `@Team`: Allow `ViewChannel`, `SendMessages`, `SendMessagesInThreads`, `ReadMessageHistory`

---

#### 🤖 AGENTS

> Dedicated spaces for each agent. Use `/corven` here for freeform 1:1 conversations. Use the same command in other channels for context-specific sessions.

| Channel           | Topic                                               | Type  | Access                       |
| ----------------- | --------------------------------------------------- | ----- | ---------------------------- |
| `#corven`         | Freeform threads with Corven 🪶 — use /corven       | Text  | `@Owner`, `@Corven`          |
| `#agent-sandbox`  | Testing and experimentation — use any agent command | Text  | `@Owner`, `@Admin`, `@Agent` |
| `#agent-to-agent` | Inter-agent communication                           | Text  | `@Owner`, `@Agent`           |
| `Voice — Corven`  | —                                                   | Voice | `@Owner`, `@Corven`          |

**Permissions:**

- `@everyone`: Deny `ViewChannel`
- `#corven`: Only `@Owner` + `@Corven` can view/send/thread
- `#agent-sandbox`: All agents + admins + owner
- `#agent-to-agent`: All agents + owner
- `Voice — Corven`: Only `@Owner` + `@Corven`

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

| Category    | `@everyone` | `@Guest` | `@Team` | `@Agent` | `@Corven` | `@Admin` | `@Owner` |
| ----------- | ----------- | -------- | ------- | -------- | --------- | -------- | -------- |
| 🧠 Personal | ❌          | ❌       | ❌      | ❌       | ✅        | ❌       | ✅       |
| 💼 Work     | ❌          | ❌       | ✅      | ❌       | ✅        | ❌       | ✅       |
| 🤖 Agents   | ❌          | ❌       | ❌      | ✅\*     | ✅\*      | ✅       | ✅       |
| 🔧 Meta     | ❌          | ❌       | ❌      | ❌\*     | ❌\*      | ✅       | ✅       |

`*` = per-channel overrides (see category details above)

---

## Bot Scope (Sentinel / Setup Bot)

This bot exists to **bootstrap and maintain** the server. It is NOT an AI agent — it is infrastructure.

### What the bot does

1. **Initial setup** — Create all roles, categories, channels, and permission overwrites from architecture config
2. **Reconciliation** — `/setup update` creates missing, updates drifted (never deletes)
3. **Cleanup** — `/setup full clean:True` deletes all channels/categories not in the architecture, then runs full setup
4. **Drift detection** — `/setup verify` reports what matches, what's missing, what's extra
5. **Incremental changes** — `/create`, `/assign`, `/permissions` for one-off changes
6. **Audit logging** — Every action logged to `#audit-log`
7. **Agent sessions** — `/corven` creates blank threads, adds members

### What the bot does NOT do

- Chat with users (that's Corven's job via OpenClaw)
- Monitor messages or moderate
- Respond to non-slash-command messages
- Delete anything unless `--clean` is explicitly used

### Slash Commands

**Server management (7 commands):**

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
| `/corven`                         | Create blank agent session thread                                     |

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
3. Create a channel `#<name>` in 🤖 AGENTS with appropriate overwrites
4. Register a `/<name>` slash command
5. Assign the agent `@Agent` role
6. Run `/setup update`

### Adding a team member

1. Assign `@Team` role
2. They automatically see: 💼 Work
3. For elevated access, also assign `@Admin`

---

## Two Bots, Two Sets of Commands

Sentinel and Corven are separate Discord applications with different bot tokens:

- **Sentinel** registers infrastructure commands: `/setup`, `/corven`, `/create`, `/assign`, `/permissions`, `/audit`, `/status`
- **OpenClaw/Corven** registers agent commands: `/activation`, `/model`, etc.

They coexist in the same server. OpenClaw's commands only work in channels where Corven has `ViewChannel`.

---

## File Reference

| File                                | Purpose                                                 |
| ----------------------------------- | ------------------------------------------------------- |
| `SERVER_ARCHITECTURE.md`            | This document — human-readable server spec              |
| `BUILD_PLAN.md`                     | Implementation plan with phases and checklist           |
| `src/config/server-architecture.ts` | Source of truth — architecture as code                  |
| `src/services/setup-executor.ts`    | `/setup full` — idempotent bootstrap with `--clean`     |
| `src/services/update-executor.ts`   | `/setup update` — reconciliation (create + update only) |
| `src/services/verify-executor.ts`   | `/setup verify` — read-only drift detection             |
| `src/services/thread-creator.ts`    | Agent thread creation + member addition + bot discovery |
| `src/services/position-enforcer.ts` | Batch position enforcement for categories + channels    |
| `src/services/audit-logger.ts`      | Structured logging to `#audit-log`                      |
