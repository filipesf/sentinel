import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { executeFullSetup } from "../../services/setup-executor.js";
import { executeUpdate } from "../../services/update-executor.js";
import { executeVerify } from "../../services/verify-executor.js";
import type { Command } from "../../types.js";
import { EMBED_COLORS } from "../../utils/constants.js";

const command: Command = {
	data: new SlashCommandBuilder()
		.setName("setup")
		.setDescription("Server setup and maintenance")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((sub) =>
			sub
				.setName("full")
				.setDescription(
					"Run the full server setup from the architecture spec (idempotent)",
				)
				.addBooleanOption((opt) =>
					opt
						.setName("clean")
						.setDescription(
							"Delete all channels and categories not in the architecture before setup",
						),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("update")
				.setDescription(
					"Reconcile server to match architecture — creates missing, updates drifted",
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("verify")
				.setDescription(
					"Check current server state against the architecture spec (read-only)",
				),
		),

	async execute(interaction: ChatInputCommandInteraction) {
		const subcommand = interaction.options.getSubcommand();
		const guild = interaction.guild;

		if (!guild) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (subcommand === "full") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const clean = interaction.options.getBoolean("clean") ?? false;
			const result = await executeFullSetup(guild, interaction.user.id, {
				clean,
			});

			const embed = new EmbedBuilder()
				.setColor(
					result.errors.length > 0
						? EMBED_COLORS.WARNING
						: EMBED_COLORS.SUCCESS,
				)
				.setTitle("Full Setup Complete")
				.addFields(
					{
						name: "Roles",
						value: `${result.rolesCreated} created, ${result.rolesSkipped} skipped`,
						inline: true,
					},
					{
						name: "Categories",
						value: `${result.categoriesCreated} created, ${result.categoriesSkipped} skipped`,
						inline: true,
					},
					{
						name: "Channels",
						value: `${result.channelsCreated} created, ${result.channelsSkipped} skipped`,
						inline: true,
					},
				)
				.setTimestamp();

			if (result.errors.length > 0) {
				embed.addFields({
					name: "Errors",
					value: result.errors.slice(0, 10).join("\n").slice(0, 1024),
				});
			}

			try {
				await interaction.editReply({ embeds: [embed] });
			} catch {
				// If --clean deleted the channel this command was invoked from,
				// the deferred reply's message no longer exists. The summary is
				// already in #audit-log, so just log the failure.
				console.warn(
					"[SETUP] Could not send reply (channel may have been deleted by --clean). Check #audit-log for results.",
				);
			}
		}

		if (subcommand === "update") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const result = await executeUpdate(guild, interaction.user.id);

			const totalChanges =
				result.rolesCreated +
				result.rolesUpdated +
				result.categoriesCreated +
				result.categoriesUpdated +
				result.channelsCreated +
				result.channelsUpdated;

			const embed = new EmbedBuilder()
				.setColor(
					result.errors.length > 0
						? EMBED_COLORS.WARNING
						: totalChanges > 0
							? EMBED_COLORS.SUCCESS
							: EMBED_COLORS.INFO,
				)
				.setTitle(
					totalChanges > 0 ? "Setup Update Complete" : "No Changes Needed",
				)
				.addFields(
					{
						name: "Roles",
						value: `${result.rolesCreated} created, ${result.rolesUpdated} updated, ${result.rolesUnchanged} unchanged`,
						inline: false,
					},
					{
						name: "Categories",
						value: `${result.categoriesCreated} created, ${result.categoriesUpdated} updated, ${result.categoriesUnchanged} unchanged`,
						inline: false,
					},
					{
						name: "Channels",
						value: `${result.channelsCreated} created, ${result.channelsUpdated} updated, ${result.channelsUnchanged} unchanged`,
						inline: false,
					},
				)
				.setTimestamp();

			if (result.changes.length > 0) {
				embed.addFields({
					name: "Changes",
					value: result.changes.slice(0, 15).join("\n").slice(0, 1024),
				});
			}

			if (result.errors.length > 0) {
				embed.addFields({
					name: "Errors",
					value: result.errors.slice(0, 10).join("\n").slice(0, 1024),
				});
			}

			await interaction.editReply({ embeds: [embed] });
		}

		if (subcommand === "verify") {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const result = await executeVerify(guild);

			const statusIcon =
				result.missing.length === 0 && result.misconfigured.length === 0
					? "\u2705"
					: "\u26a0\ufe0f";

			const embed = new EmbedBuilder()
				.setColor(
					result.missing.length === 0 && result.misconfigured.length === 0
						? EMBED_COLORS.SUCCESS
						: EMBED_COLORS.WARNING,
				)
				.setTitle(`${statusIcon} Server Architecture Verification`)
				.addFields({
					name: "Matching",
					value:
						result.matching.length > 0
							? result.matching
									.map((m) => `\u2705 ${m}`)
									.join("\n")
									.slice(0, 1024)
							: "None",
				});

			if (result.missing.length > 0) {
				embed.addFields({
					name: "Missing",
					value: result.missing
						.map((m) => `\u274c ${m}`)
						.join("\n")
						.slice(0, 1024),
				});
			}

			if (result.extra.length > 0) {
				embed.addFields({
					name: "Extra (not in spec)",
					value: result.extra
						.map((m) => `\u2139\ufe0f ${m}`)
						.join("\n")
						.slice(0, 1024),
				});
			}

			if (result.misconfigured.length > 0) {
				embed.addFields({
					name: "Misconfigured",
					value: result.misconfigured
						.map((m) => `\u26a0\ufe0f ${m}`)
						.join("\n")
						.slice(0, 1024),
				});
			}

			embed.setTimestamp();
			embed.setFooter({ text: "Read-only \u2014 no changes made" });

			await interaction.editReply({ embeds: [embed] });
		}
	},
};

export default command;
