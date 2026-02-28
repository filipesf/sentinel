/**
 * OpenClaw Agent Trigger
 *
 * Primary path: Gateway WebSocket RPC "agent" method.
 * This uses the same delivery pipeline as normal Discord messages,
 * with explicit sessionKey, channel, threadId, and deliver params.
 * No cron/announce indirection — deterministic thread delivery.
 *
 * Fallback: HTTP POST /hooks/agent (legacy, less reliable for threads).
 *
 * Requires environment variables:
 *   OPENCLAW_GATEWAY_TOKEN  — gateway auth token (for WebSocket RPC)
 *   OPENCLAW_HOOKS_TOKEN    — shared secret for /hooks/* API (fallback)
 *   OPENCLAW_GATEWAY_PORT   — gateway port (default 18789)
 */

import { isReady, request } from './openclaw-ws.js';

const OPENCLAW_PORT = process.env.OPENCLAW_GATEWAY_PORT ?? '18789';
const OPENCLAW_HOOKS_TOKEN = process.env.OPENCLAW_HOOKS_TOKEN ?? '';
const OPENCLAW_BASE = `http://127.0.0.1:${OPENCLAW_PORT}`;

export interface TriggerAgentOptions {
  /** The user's prompt / initial instruction */
  prompt: string;
  /** Agent ID (e.g. "corven") */
  agentId: string;
  /** Discord thread ID where the agent should respond */
  threadId: string;
}

/**
 * Build the Discord session key for a thread.
 * Format: agent:<agentId>:discord:channel:<threadId>
 */
function buildSessionKey(agentId: string, threadId: string): string {
  return `agent:${agentId}:discord:channel:${threadId}`;
}

/**
 * Trigger an agent via Gateway WebSocket RPC.
 *
 * Uses the "agent" method which bypasses the cron/announce pipeline
 * and delivers directly to the specified Discord thread.
 */
async function triggerViaRpc(options: TriggerAgentOptions): Promise<boolean> {
  const { prompt, agentId, threadId } = options;
  const sessionKey = buildSessionKey(agentId, threadId);
  const idempotencyKey = crypto.randomUUID();

  try {
    const result = await request('agent', {
      message: prompt,
      agentId,
      sessionKey,
      channel: 'discord',
      to: `channel:${threadId}`,
      threadId,
      deliver: true,
      idempotencyKey,
    });

    const status = (result as { status?: string })?.status;
    console.log(
      `[OPENCLAW] RPC agent accepted: ${agentId} → thread ${threadId} (status: ${status})`,
    );
    return true;
  } catch (err) {
    console.error(`[OPENCLAW] RPC agent failed: ${err}`);
    return false;
  }
}

/**
 * Trigger an agent via HTTP POST /hooks/agent (fallback).
 *
 * Less reliable for thread delivery due to cron/announce routing,
 * but works when WebSocket is unavailable.
 */
async function triggerViaHooks(options: TriggerAgentOptions): Promise<boolean> {
  const { prompt, agentId, threadId } = options;

  if (!OPENCLAW_HOOKS_TOKEN) {
    console.error('[OPENCLAW] Missing OPENCLAW_HOOKS_TOKEN — HTTP fallback unavailable');
    return false;
  }

  const normalizedMessage = `User request from Discord thread ${threadId}:\n${prompt}`;

  try {
    const response = await fetch(`${OPENCLAW_BASE}/hooks/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENCLAW_HOOKS_TOKEN}`,
      },
      body: JSON.stringify({
        message: normalizedMessage,
        agentId,
        channel: 'discord',
        to: `channel:${threadId}`,
        deliver: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '(no body)');
      console.error(
        `[OPENCLAW] POST /hooks/agent failed: ${response.status} ${response.statusText} — ${body}`,
      );
      return false;
    }

    console.log(
      `[OPENCLAW] HTTP hook triggered ${agentId} in thread ${threadId} (${response.status})`,
    );
    return true;
  } catch (err) {
    console.error(`[OPENCLAW] HTTP hook failed: ${err}`);
    return false;
  }
}

/**
 * Trigger an agent session in a Discord thread.
 *
 * Tries WebSocket RPC first (deterministic delivery), falls back
 * to HTTP hooks if the WebSocket connection is down.
 *
 * Fire-and-forget — errors are logged but don't block the user.
 */
export async function triggerAgent(options: TriggerAgentOptions): Promise<boolean> {
  // Primary: WebSocket RPC
  if (isReady()) {
    const ok = await triggerViaRpc(options);
    if (ok) return true;
    console.warn('[OPENCLAW] RPC failed, falling back to HTTP hooks');
  }

  // Fallback: HTTP hooks
  return triggerViaHooks(options);
}
