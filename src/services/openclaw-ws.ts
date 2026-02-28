/**
 * OpenClaw Gateway WebSocket RPC Client
 *
 * Connects to the OpenClaw gateway over WebSocket, handles the
 * connect challenge + token auth handshake, and provides a typed
 * request/response API for triggering agent turns.
 *
 * Protocol:
 *   1. Server sends connect.challenge with nonce
 *   2. Client sends connect request with token auth (operator role)
 *   3. Server responds with hello-ok
 *   4. Client can now send RPC requests (e.g. "agent" method)
 *
 * Reconnects automatically with exponential backoff on disconnect.
 * No external dependencies — uses Node 22 built-in WebSocket.
 */

const GATEWAY_PORT = process.env.OPENCLAW_GATEWAY_PORT ?? '18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? '';
const GATEWAY_URL = `ws://127.0.0.1:${GATEWAY_PORT}`;

const PROTOCOL_VERSION = 3;
const CONNECT_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

type RequestResolver = {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type ConnectionState = 'disconnected' | 'connecting' | 'challenged' | 'ready';

let ws: WebSocket | null = null;
let state: ConnectionState = 'disconnected';
let pendingRequests = new Map<string, RequestResolver>();
let connectResolve: ((ok: boolean) => void) | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let intentionalClose = false;
let requestCounter = 0;

function nextId(): string {
  return `sentinel-${++requestCounter}-${Date.now()}`;
}

function log(msg: string) {
  console.log(`[OPENCLAW-WS] ${msg}`);
}

function logError(msg: string) {
  console.error(`[OPENCLAW-WS] ${msg}`);
}

/**
 * Handle incoming WebSocket messages.
 */
function handleMessage(data: string) {
  let msg: {
    type: string;
    event?: string;
    id?: string;
    ok?: boolean;
    payload?: unknown;
    error?: unknown;
  };

  try {
    msg = JSON.parse(data);
  } catch {
    logError(`Invalid JSON: ${data.slice(0, 200)}`);
    return;
  }

  // Phase 1: connect.challenge event
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const payload = msg.payload as { nonce?: string } | undefined;
    const nonce = payload?.nonce;
    if (!nonce || state !== 'connecting') {
      logError('Unexpected challenge or missing nonce');
      return;
    }
    state = 'challenged';
    sendConnect();
    return;
  }

  // Phase 2: connect response
  if (msg.type === 'res' && msg.id === 'sentinel-connect') {
    // Clear the connect timeout — handshake completed (success or failure)
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }

    if (msg.ok) {
      state = 'ready';
      reconnectAttempt = 0;
      const version =
        (msg.payload as { server?: { version?: string } })?.server?.version ?? 'unknown';
      log(`Connected (server ${version})`);
      connectResolve?.(true);
      connectResolve = null;
    } else {
      const errMsg =
        (msg.error as { message?: string })?.message ?? 'connect rejected';
      logError(`Connect failed: ${errMsg}`);
      connectResolve?.(false);
      connectResolve = null;
      ws?.close();
    }
    return;
  }

  // Phase 3: RPC responses
  if (msg.type === 'res' && msg.id) {
    const pending = pendingRequests.get(msg.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRequests.delete(msg.id);
      if (msg.ok) {
        pending.resolve(msg.payload);
      } else {
        const errMsg =
          (msg.error as { message?: string })?.message ?? 'RPC error';
        pending.reject(new Error(errMsg));
      }
    }
    // Note: the agent method sends TWO responses (accepted + completed).
    // We resolve on the first one (accepted) which is what we need.
    return;
  }

  // Ignore other events (tick, presence, health, etc.)
}

/**
 * Send the connect request with token auth.
 */
function sendConnect() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const frame = {
    type: 'req',
    id: 'sentinel-connect',
    method: 'connect',
    params: {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: 'gateway-client' as const,
        version: '1.0.0',
        platform: 'linux',
        mode: 'backend' as const,
      },
      role: 'operator',
      scopes: ['operator.write'],
      auth: {
        token: GATEWAY_TOKEN,
      },
    },
  };

  ws.send(JSON.stringify(frame));
}

/**
 * Schedule a reconnection attempt with exponential backoff.
 */
function scheduleReconnect() {
  if (intentionalClose || reconnectTimer) return;

  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt),
    RECONNECT_MAX_MS,
  );
  reconnectAttempt++;

  log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, delay);
}

/**
 * Reject all pending requests (connection lost).
 */
function rejectAllPending(reason: string) {
  for (const [id, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
    pendingRequests.delete(id);
  }
}

/**
 * Connect to the OpenClaw gateway.
 * Resolves true when the handshake completes, false on failure.
 */
export function connect(): Promise<boolean> {
  if (state === 'ready' && ws?.readyState === WebSocket.OPEN) {
    return Promise.resolve(true);
  }

  if (!GATEWAY_TOKEN) {
    logError('Missing OPENCLAW_GATEWAY_TOKEN — WebSocket disabled');
    return Promise.resolve(false);
  }

  // Clean up any existing connection
  if (ws) {
    try {
      ws.close();
    } catch {
      // ignore
    }
    ws = null;
  }

  state = 'connecting';

  // Clear any existing connect timer from a previous attempt
  if (connectTimer) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }

  return new Promise<boolean>((resolve) => {
    connectResolve = resolve;

    connectTimer = setTimeout(() => {
      connectTimer = null;
      logError('Connect timeout');
      connectResolve = null;
      resolve(false);
      ws?.close();
    }, CONNECT_TIMEOUT_MS);

    try {
      ws = new WebSocket(GATEWAY_URL);
    } catch (err) {
      logError(`WebSocket constructor failed: ${err}`);
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      state = 'disconnected';
      resolve(false);
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      // Wait for connect.challenge — handled in handleMessage
    });

    ws.addEventListener('message', (event) => {
      const data = typeof event.data === 'string' ? event.data : String(event.data);
      handleMessage(data);
    });

    ws.addEventListener('close', (event) => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      const wasReady = state === 'ready';
      state = 'disconnected';
      ws = null;

      rejectAllPending('WebSocket closed');

      if (connectResolve) {
        connectResolve(false);
        connectResolve = null;
      }

      if (wasReady) {
        log(`Disconnected (code=${event.code} reason="${event.reason}")`);
      }

      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // Error details are not available on the Node WebSocket error event.
      // The close handler will fire next with the actual reason.
      logError('WebSocket error');
    });
  });
}

/**
 * Send an RPC request to the gateway.
 * Rejects if not connected or on timeout.
 */
export function request(method: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (state !== 'ready' || !ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected to gateway'));
      return;
    }

    const id = nextId();

    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`RPC timeout: ${method}`));
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(id, { resolve, reject, timer });

    const frame = {
      type: 'req',
      id,
      method,
      params,
    };

    ws.send(JSON.stringify(frame));
  });
}

/**
 * Check if the WebSocket is connected and ready.
 */
export function isReady(): boolean {
  return state === 'ready' && ws?.readyState === WebSocket.OPEN;
}

/**
 * Gracefully disconnect. Does not auto-reconnect.
 */
export function disconnect() {
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  rejectAllPending('Disconnecting');
  if (ws) {
    ws.close();
    ws = null;
  }
  state = 'disconnected';
}
