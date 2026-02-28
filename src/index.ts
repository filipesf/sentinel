import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { connect as connectGateway } from './services/openclaw-ws.js';

// Agent commands
import corvenCommand from './commands/agents/corven.js';
import sessionCommand from './commands/agents/session.js';
import growthCommand from './commands/agents/growth.js';
import contentCommand from './commands/agents/content.js';
import opsCommand from './commands/agents/ops.js';
import leadsCommand from './commands/agents/leads.js';

// Activity commands
import decisionCommand from './commands/decision.js';

// Infrastructure commands
import assignCommand from './commands/assign/index.js';
import auditCommand from './commands/audit.js';
import createCommand from './commands/create/index.js';
import permissionsCommand from './commands/permissions/index.js';
import setupCommand from './commands/setup/index.js';
import statusCommand from './commands/status.js';

// Events
import * as interactionCreateEvent from './events/interaction-create.js';
import * as messageCreateEvent from './events/message-create.js';
import * as readyEvent from './events/ready.js';

import type { Command } from './types.js';

// Load config
const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
  token: string;
  clientId: string;
  guildId: string;
};

// Create client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Register commands
client.commands = new Collection<string, Command>();
const commands: Command[] = [
  // Agent session commands
  corvenCommand,
  sessionCommand,
  growthCommand,
  contentCommand,
  opsCommand,
  leadsCommand,
  // Activity commands
  decisionCommand,
  // Infrastructure commands
  statusCommand,
  setupCommand,
  createCommand,
  assignCommand,
  permissionsCommand,
  auditCommand,
];

for (const command of commands) {
  client.commands.set(command.data.name, command);
  console.log(`[INIT] Registered command: /${command.data.name}`);
}

// Register events
client.once(readyEvent.name, readyEvent.execute);
client.on(interactionCreateEvent.name, interactionCreateEvent.execute);
client.on(messageCreateEvent.name, messageCreateEvent.execute);

// Prevent unhandled rejections from crashing the process
process.on('unhandledRejection', (error) => {
  console.error('[FATAL] Unhandled rejection:', error);
});

// Connect to OpenClaw gateway (non-blocking — reconnects automatically)
connectGateway().then((ok) => {
  if (ok) {
    console.log('[INIT] OpenClaw gateway WebSocket connected');
  } else {
    console.warn('[INIT] OpenClaw gateway WebSocket unavailable — using HTTP hooks fallback');
  }
});

// Login
client.login(config.token);
