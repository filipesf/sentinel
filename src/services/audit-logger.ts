import {
	ChannelType,
	EmbedBuilder,
	type Guild,
	type TextChannel,
} from "discord.js";
import { EMBED_COLORS } from "../utils/constants.js";
import { formatTimestamp } from "../utils/helpers.js";

const AUDIT_LOG_CHANNEL = "audit-log";

/**
 * Post a structured log entry to #audit-log.
 * Falls back to console.log if the channel doesn't exist yet.
 */
export async function logAction(
	guild: Guild,
	type: string,
	description: string,
): Promise<void> {
	const timestamp = formatTimestamp();
	const line = `\`[${timestamp}]\` **${type}** — ${description}`;

	console.log(`[AUDIT] [${timestamp}] ${type} — ${description}`);

	const channel = guild.channels.cache.find(
		(ch) => ch.name === AUDIT_LOG_CHANNEL && ch.type === ChannelType.GuildText,
	) as TextChannel | undefined;

	if (channel) {
		try {
			await channel.send(line);
		} catch (err) {
			console.error(`[AUDIT] Failed to post to #${AUDIT_LOG_CHANNEL}:`, err);
		}
	}
}

/**
 * Post a summary embed to #audit-log after a major operation.
 */
export async function logSummary(
	guild: Guild,
	title: string,
	fields: { name: string; value: string; inline?: boolean }[],
): Promise<void> {
	const channel = guild.channels.cache.find(
		(ch) => ch.name === AUDIT_LOG_CHANNEL && ch.type === ChannelType.GuildText,
	) as TextChannel | undefined;

	const embed = new EmbedBuilder()
		.setColor(EMBED_COLORS.SUCCESS)
		.setTitle(title)
		.addFields(fields)
		.setTimestamp();

	console.log(`[AUDIT] Summary: ${title}`);

	if (channel) {
		try {
			await channel.send({ embeds: [embed] });
		} catch (err) {
			console.error(
				`[AUDIT] Failed to post summary to #${AUDIT_LOG_CHANNEL}:`,
				err,
			);
		}
	}
}
