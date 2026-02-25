import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import corvenCommand from "./commands/agents/corven.js";
import assignCommand from "./commands/assign/index.js";
import auditCommand from "./commands/audit.js";
import createCommand from "./commands/create/index.js";
import permissionsCommand from "./commands/permissions/index.js";
import setupCommand from "./commands/setup/index.js";
// Import commands
import statusCommand from "./commands/status.js";
import * as interactionCreateEvent from "./events/interaction-create.js";
// Import events
import * as readyEvent from "./events/ready.js";
import type { Command } from "./types.js";

// Load config
const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "..", "config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
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
	statusCommand,
	setupCommand,
	corvenCommand,
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

// Prevent unhandled rejections from crashing the process
process.on("unhandledRejection", (error) => {
	console.error("[FATAL] Unhandled rejection:", error);
});

// Login
client.login(config.token);
