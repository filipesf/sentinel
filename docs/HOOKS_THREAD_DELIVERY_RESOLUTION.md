# Sentinel × OpenClaw: Discord Thread Delivery — Root Cause & Resolution

> Full root cause analysis, upstream bug discoveries, and the implemented fix
> for Discord thread delivery via OpenClaw.

---

## Problem Statement

When Sentinel triggers OpenClaw via `POST /hooks/agent` to make Corven respond
in a specific Discord thread, three issues interact:

1. **Responses land in the wrong session** — often `agent:corven:main` / heartbeat
   instead of the target thread.
2. **Duplicate messages** — hook delivery + heartbeat wake both produce output.
3. **Agent refusals** — Corven ignores or refuses request-like prompts wrapped
   as untrusted external content.

---

## Root Cause Analysis

### Bug 1: Announce routing bypasses thread targets

**Where:** `src/cron/delivery.ts:80-86`, `src/cron/isolated-agent/delivery-dispatch.ts:397`

When Sentinel calls `POST /hooks/agent` with `deliver:true, channel:"discord",
to:"channel:<threadId>"`, OpenClaw converts this into cron delivery mode
`"announce"` (not a direct send). The announce flow routes through the main
agent session.

Direct delivery is only selected when either:

- The delivery payload has structured content (`deliveryPayloadHasStructuredContent`), OR
- `resolvedDelivery.threadId != null`

Discord target parsing in `src/discord/targets.ts` treats `channel:<id>` as
generic `kind="channel"` with no dedicated thread kind. So `threadId` resolves
to `null` for plain-text responses, and the announce path is taken — which
targets `agent:corven:main` instead of the thread.

**Impact:** Responses go to the wrong session. Even when they eventually reach
Discord, they may not appear in the intended thread.

### Bug 2: Duplicate heartbeat wake on hook delivery

**Where:** `src/gateway/server/hooks.ts:83`

Older OpenClaw versions unconditionally posted both a hook summary AND triggered
a heartbeat wake, even when the hook had already delivered its response. This
caused duplicate messages.

**Fix (upstream):** PR #20678 (merged 2026-02-22, shipped in `v2026.2.22`)
guards `enqueueSystemEvent` + `requestHeartbeatNow` with
`if (!result.delivered)`. Related issues: #20196, #15692, #13021 — all closed.

**Impact:** Duplicate responses on versions < `v2026.2.22`.

### Bug 3: External content safety wrapper

**Where:** `src/cron/isolated-agent/run.ts:327-359`

`/hooks/agent` wraps all prompts as untrusted external content with safety
framing. This causes Corven to refuse or ignore request-like prompts.

Using `allowUnsafeExternalContent:true` in a custom mapped hook
(`hooks.mappings`) bypasses this — but doesn't fix bugs 1 or 2.

**Impact:** Agent refuses to act on many legitimate prompts.

---

## Solution: Gateway WebSocket RPC

### Why WebSocket RPC instead of HTTP hooks

The Gateway RPC `agent` method (`src/gateway/server-methods/agent.ts`) accepts
explicit `sessionKey`, `channel`, `to`, `threadId`, and `deliver` params. It
bypasses the entire cron/announce pipeline and uses the normal agent turn
delivery — the same code path that Discord inbound messages use.

| Aspect            | HTTP hooks                                     | WebSocket RPC                                    |
| ----------------- | ---------------------------------------------- | ------------------------------------------------ |
| Delivery pipeline | cron → announce → session resolution           | Direct agent turn                                |
| Thread targeting  | `channel:<id>` → generic kind, `threadId=null` | Explicit `threadId` param                        |
| Session key       | Auto-generated `hook:<uuid>`                   | Explicit `agent:<id>:discord:channel:<threadId>` |
| Content safety    | Untrusted external wrapper                     | No wrapper (operator auth)                       |
| Deduplication     | None (duplicate heartbeat wake)                | Built-in `idempotencyKey`                        |
| Connection        | One-shot HTTP per trigger                      | Persistent WebSocket                             |

### Implementation

Three new/modified files in Sentinel:

#### `src/services/openclaw-ws.ts` (new)

Gateway WebSocket RPC client. Handles:

- Connect to `ws://127.0.0.1:18789`
- Wait for `connect.challenge` event (server sends nonce)
- Send `connect` request with operator role + gateway token auth
- No device identity needed — operator + shared token skips device pairing
- Auto-reconnect with exponential backoff
- Request/response correlation via message IDs

Key protocol details:

- Protocol version: 3
- Client ID: `gateway-client` (recognized by the server)
- Client mode: `backend`
- Auth: `{ token: OPENCLAW_GATEWAY_TOKEN }` (NOT the hooks token)
- Role: `operator` (allows skipping device identity per `roleCanSkipDeviceIdentity()`)

#### `src/services/openclaw-client.ts` (rewritten)

Dual-path agent trigger:

1. **Primary — WebSocket RPC:** Calls the `agent` method with:

   ```
   message, agentId, sessionKey, channel, to, threadId, deliver, idempotencyKey
   ```

   Session key format: `agent:<agentId>:discord:channel:<threadId>`

2. **Fallback — HTTP hooks:** Original `POST /hooks/agent` if WebSocket is down.

#### `src/index.ts` (modified)

Initializes the WebSocket connection on startup (non-blocking). If the
connection fails, it retries automatically in the background. The HTTP
fallback is always available.

### Environment Changes

| Variable                          | Where                                 | Value                                |
| --------------------------------- | ------------------------------------- | ------------------------------------ |
| `OPENCLAW_GATEWAY_TOKEN`          | Sentinel `.env`                       | Gateway auth token (64-char hex)     |
| `OPENCLAW_GATEWAY_TOKEN`          | `docker-compose.yml` sentinel service | `${SENTINEL_OPENCLAW_GATEWAY_TOKEN}` |
| `SENTINEL_OPENCLAW_GATEWAY_TOKEN` | Host `.env`                           | Same gateway token value             |

**Important:** The gateway token and hooks token are different values. OpenClaw
enforces that `hooks.token !== gateway.auth.token` at startup
(`src/gateway/startup-auth.ts:151-176`).

---

## OpenClaw Gateway WebSocket Protocol Reference

This section documents what we learned about the protocol for future reference.

### Connection Handshake

```
Client                                   Server
  |                                        |
  |-------- TCP/WebSocket connect -------->|
  |                                        |
  |<--- event: connect.challenge {nonce} --|
  |                                        |
  |--- req: connect {auth, client, ...} -->|
  |                                        |
  |<------ res: hello-ok {snapshot} -------|
  |                                        |
  |--- req: agent {message, ...} --------->|
  |                                        |
  |<------ res: {status: "accepted"} ------|
  |<------ res: {status: "ok"} -----------|  (second res, same id)
```

### Connect Request Shape

```typescript
{
  type: "req",
  id: "<unique-id>",
  method: "connect",
  params: {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: "gateway-client",     // enum: webchat-ui | openclaw-control-ui | webchat | cli | gateway-client | ...
      version: "1.0.0",
      platform: "linux",        // required
      mode: "backend",          // enum: webchat | cli | ui | backend | node | probe | test
    },
    role: "operator",           // "operator" | "node"
    auth: {
      token: "<gateway-token>", // gateway.auth.token, NOT hooks.token
    },
  },
}
```

### Auth Methods

| Method       | When                                            | Device identity required? |
| ------------ | ----------------------------------------------- | ------------------------- |
| Token        | `auth.token` matches `gateway.auth.token`       | No (operator role only)   |
| Password     | `auth.password` matches `gateway.auth.password` | No (operator role only)   |
| Device token | `auth.deviceToken` matches stored device token  | Yes                       |
| Tailscale    | Tailscale proxy whois verification              | Depends                   |
| None         | `gateway.auth.mode = "none"`                    | No                        |

**Key insight:** Operator role + valid shared token/password = device identity
not required. This is what makes Sentinel's simple client possible.
Code: `src/gateway/role-policy.ts:14-16`:

```typescript
export function roleCanSkipDeviceIdentity(role, sharedAuthOk) {
  return role === 'operator' && sharedAuthOk;
}
```

### Agent RPC Method Shape

```typescript
{
  type: "req",
  id: "<unique-id>",
  method: "agent",
  params: {
    message: "the prompt",
    agentId: "corven",
    sessionKey: "agent:corven:discord:channel:<threadId>",
    channel: "discord",
    to: "channel:<threadId>",
    threadId: "<threadId>",
    deliver: true,
    idempotencyKey: "<uuid>",
  },
}
```

The server responds twice with the same `id`:

1. Immediate `{status: "accepted"}` — agent turn queued
2. Final `{status: "ok", result: ...}` — agent turn completed

We resolve on the first response (accepted) since delivery is fire-and-forget.

### Session Key Format

Discord thread sessions: `agent:<agentId>:discord:channel:<threadId>`
Main session: `agent:<agentId>:main`

### Keepalive

The server sends periodic `tick` events (every ~30s). The reference client
watches for these and closes if none arrive within `2 × tickIntervalMs`. Our
client ignores tick events — the server doesn't require a response. The
connection stays alive as long as the underlying TCP connection holds.

---

## Bug Fix: WebSocket Connect Timer Race

During implementation, we hit a reconnect cycling bug:

**Symptom:** "Connected (server dev)" immediately followed by "Connect timeout"
→ disconnect → reconnect → repeat.

**Cause:** The connect timeout was a local variable in the `connect()` closure.
When a successful connection later dropped and `scheduleReconnect()` called
`connect()` again, a new timeout was created. If the new connection's
`hello-ok` arrived quickly, the `handleMessage` function transitioned state to
`ready` but couldn't clear the closure-scoped timeout from the `connect()` call.
The timeout then fired and closed the healthy connection.

**Fix:** Moved `connectTimer` to module scope. The `handleMessage` connect
response handler clears it on hello-ok (success or failure). The `close`
handler also clears it. The `connect()` function clears any leftover timer
before creating a new one.

---

## Files Changed

| File                              | Change                                                         |
| --------------------------------- | -------------------------------------------------------------- |
| `src/services/openclaw-ws.ts`     | New — WebSocket RPC client                                     |
| `src/services/openclaw-client.ts` | Rewritten — dual-path (WS primary, HTTP fallback)              |
| `src/index.ts`                    | Added WS connection init on startup                            |
| `.env`                            | Added `OPENCLAW_GATEWAY_TOKEN`                                 |
| VM `docker-compose.yml`           | Added `OPENCLAW_GATEWAY_TOKEN` env mapping to sentinel service |

---

## Verification

- [x] Build succeeds (no new dependencies — Node 22 built-in WebSocket)
- [x] WebSocket connects and authenticates on startup
- [x] Connection stays stable (no disconnect cycling after timer fix)
- [x] `/corven` command triggers agent and response appears in correct thread
- [x] No duplicate messages
- [x] HTTP fallback works when WS is unavailable

---

## Relevant OpenClaw Source Files

For future debugging or if upstream changes break something:

| File                                                  | What it does                                |
| ----------------------------------------------------- | ------------------------------------------- |
| `src/gateway/server-methods/agent.ts`                 | RPC `agent` method — our target entry point |
| `src/gateway/server/hooks.ts`                         | HTTP hooks dispatch (the old path)          |
| `src/gateway/server/ws-connection.ts`                 | WS connection setup, challenge nonce        |
| `src/gateway/server/ws-connection/message-handler.ts` | Connect handshake validation                |
| `src/gateway/server/ws-connection/auth-context.ts`    | Auth resolution (token/password/device)     |
| `src/gateway/protocol/schema/frames.ts`               | ConnectParams schema, HelloOk schema        |
| `src/gateway/protocol/client-info.ts`                 | Valid client IDs and modes                  |
| `src/gateway/role-policy.ts`                          | `roleCanSkipDeviceIdentity()`               |
| `src/gateway/auth.ts`                                 | Gateway auth validation                     |
| `src/gateway/client.ts`                               | Reference WS client implementation          |
| `src/cron/delivery.ts`                                | Cron delivery plan (where hooks go wrong)   |
| `src/cron/isolated-agent/delivery-dispatch.ts`        | Announce vs direct delivery gate            |
| `src/discord/targets.ts`                              | Discord target parsing                      |

---

## Lessons Learned

1. **HTTP hooks are not designed for targeted thread delivery.** They go through
   the cron/announce pipeline which was built for broadcast-style delivery, not
   "post in this specific thread." The RPC `agent` method is the correct API
   for external systems that need deterministic delivery to a specific target.

2. **The gateway token and hooks token serve different purposes and must be
   different values.** The gateway token authenticates WebSocket connections
   (operator-level access). The hooks token authenticates HTTP webhook calls
   (limited to hook actions). OpenClaw enforces separation at startup.

3. **Operator role + shared token auth skips device identity entirely.** This
   makes it possible to connect with a simple token — no keypair generation,
   device signing, or pairing flow needed. Perfect for backend service clients.

4. **The `agent` RPC method sends two responses.** The first is an immediate
   "accepted" acknowledgment. The second is the final result after the agent
   turn completes. For fire-and-forget triggers, resolve on the first response.

5. **WebSocket connect timers must be module-scoped when reconnect loops exist.**
   Closure-scoped timers in `connect()` can't be cleared by message handlers
   from a different invocation, causing healthy connections to be killed by
   stale timeouts.

6. **Node 22 has built-in WebSocket.** No need for the `ws` package. The API
   is browser-compatible (`addEventListener`, `send`, `close`).

7. **OpenClaw version matters.** The duplicate-delivery bug was only fixed in
   `v2026.2.22`. Always check the running version via the `hello-ok` snapshot
   (`snapshot.updateAvailable.currentVersion`).
