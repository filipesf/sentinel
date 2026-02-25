import { type Client, Events } from "discord.js";

export const name = Events.ClientReady;
export const once = true;

export function execute(client: Client<true>): void {
	console.log(`[READY] Logged in as ${client.user.tag}`);
	console.log(`[READY] Serving ${client.guilds.cache.size} guild(s)`);
}
