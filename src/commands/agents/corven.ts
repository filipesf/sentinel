import {
	type ChatInputCommandInteraction,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import { createAgentThread } from "../../services/thread-creator.js";
import type { Command } from "../../types.js";

const command: Command = {
	data: new SlashCommandBuilder()
		.setName("corven")
		.setDescription("Start a new conversation thread with Corven"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const result = await createAgentThread(interaction, "corven");

		if (result.success) {
			await interaction.editReply({
				content: [
					`\u{1fab6} Thread created! <#${result.threadId}>`,
					"",
					`Mention ${result.agentMention} in the thread to start chatting.`,
				].join("\n"),
			});
		} else {
			await interaction.editReply({
				content: `\u274c ${result.error}`,
			});
		}
	},
};

export default command;
