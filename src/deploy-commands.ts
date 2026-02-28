import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REST, Routes } from 'discord.js';

// Agent commands
import corvenCommand from './commands/agents/corven.js';
import sessionCommand from './commands/agents/session.js';
import growthCommand from './commands/agents/growth.js';
import contentCommand from './commands/agents/content.js';
import opsCommand from './commands/agents/ops.js';
import leadsCommand from './commands/agents/leads.js';

// Activity commands
import decisionCommand from './commands/decision.js';
import standupCommand from './commands/standup.js';
import reportCommand from './commands/report.js';

// Infrastructure commands
import assignCommand from './commands/assign/index.js';
import auditCommand from './commands/audit.js';
import createCommand from './commands/create/index.js';
import permissionsCommand from './commands/permissions/index.js';
import setupCommand from './commands/setup/index.js';
import statusCommand from './commands/status.js';

// Load config
const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
  token: string;
  clientId: string;
  guildId: string;
};

const commands = [
  // Agent session commands
  corvenCommand,
  sessionCommand,
  growthCommand,
  contentCommand,
  opsCommand,
  leadsCommand,
  // Activity commands
  decisionCommand,
  standupCommand,
  reportCommand,
  // Infrastructure commands
  statusCommand,
  setupCommand,
  createCommand,
  assignCommand,
  permissionsCommand,
  auditCommand,
].map((cmd) => cmd.data.toJSON());

const rest = new REST().setToken(config.token);

(async () => {
  try {
    console.log(`[DEPLOY] Registering ${commands.length} slash commands...`);

    const data = (await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands },
    )) as unknown[];

    console.log(`[DEPLOY] Successfully registered ${data.length} commands.`);
  } catch (error) {
    console.error('[DEPLOY] Error:', error);
  }
})();
