import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REST, Routes } from "discord.js";
import corvenCommand from "./commands/agents/corven.js";
import assignCommand from "./commands/assign/index.js";
import auditCommand from "./commands/audit.js";
import createCommand from "./commands/create/index.js";
import permissionsCommand from "./commands/permissions/index.js";
import setupCommand from "./commands/setup/index.js";
// Import all commands
import statusCommand from "./commands/status.js";

// Load config
const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "..", "config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
	token: string;
	clientId: string;
	guildId: string;
};

const commands = [
	statusCommand,
	setupCommand,
	corvenCommand,
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
		console.error("[DEPLOY] Error:", error);
	}
})();
