import {
	ChannelType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	PermissionsBitField,
	SlashCommandBuilder,
} from "discord.js";
import { logAction } from "../../services/audit-logger.js";
import type { Command } from "../../types.js";
import { EMBED_COLORS } from "../../utils/constants.js";

const command: Command = {
	data: new SlashCommandBuilder()
		.setName("permissions")
		.setDescription("View or modify channel permissions")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((sub) =>
			sub
				.setName("show")
				.setDescription("Show permission overwrites for a channel")
				.addChannelOption((opt) =>
					opt
						.setName("channel")
						.setDescription("The channel to inspect")
						.setRequired(true)
						.addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("set")
				.setDescription("Set a permission overwrite on a channel")
				.addChannelOption((opt) =>
					opt
						.setName("channel")
						.setDescription("The channel to modify")
						.setRequired(true)
						.addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory),
				)
				.addRoleOption((opt) =>
					opt.setName("role").setDescription("The role").setRequired(true),
				)
				.addStringOption((opt) =>
					opt
						.setName("action")
						.setDescription("Allow or deny")
						.setRequired(true)
						.addChoices(
							{ name: "Allow", value: "allow" },
							{ name: "Deny", value: "deny" },
							{ name: "Reset", value: "reset" },
						),
				)
				.addStringOption((opt) =>
					opt
						.setName("permission")
						.setDescription("Permission name (e.g. ViewChannel, SendMessages)")
						.setRequired(true)
						.addChoices(
							{ name: "ViewChannel", value: "ViewChannel" },
							{ name: "SendMessages", value: "SendMessages" },
							{ name: "SendMessagesInThreads", value: "SendMessagesInThreads" },
							{ name: "ReadMessageHistory", value: "ReadMessageHistory" },
							{ name: "EmbedLinks", value: "EmbedLinks" },
							{ name: "AttachFiles", value: "AttachFiles" },
							{ name: "ManageMessages", value: "ManageMessages" },
							{ name: "ManageThreads", value: "ManageThreads" },
							{ name: "CreatePublicThreads", value: "CreatePublicThreads" },
							{ name: "AddReactions", value: "AddReactions" },
						),
				),
		),

	async execute(interaction: ChatInputCommandInteraction) {
		const sub = interaction.options.getSubcommand();
		const guild = interaction.guild;

		if (!guild) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		if (sub === "show") {
			const channel = interaction.options.getChannel("channel", true);
			const guildChannel = guild.channels.cache.get(channel.id);

			if (!guildChannel || !("permissionOverwrites" in guildChannel)) {
				await interaction.editReply({
					content: "Channel not found or has no permission overwrites.",
				});
				return;
			}

			const overwrites = guildChannel.permissionOverwrites.cache;

			if (overwrites.size === 0) {
				await interaction.editReply({
					content: `No permission overwrites on <#${channel.id}>.`,
				});
				return;
			}

			const lines: string[] = [];
			for (const [, ow] of overwrites) {
				const target =
					ow.type === 0
						? (guild.roles.cache.get(ow.id)?.name ?? "Unknown Role")
						: (guild.members.cache.get(ow.id)?.displayName ?? "Unknown User");

				const allowed = new PermissionsBitField(ow.allow).toArray();
				const denied = new PermissionsBitField(ow.deny).toArray();

				let line = `**${target}**`;
				if (allowed.length > 0) line += `\n  Allow: ${allowed.join(", ")}`;
				if (denied.length > 0) line += `\n  Deny: ${denied.join(", ")}`;
				lines.push(line);
			}

			const embed = new EmbedBuilder()
				.setColor(EMBED_COLORS.INFO)
				.setTitle(`Permissions: #${guildChannel.name}`)
				.setDescription(lines.join("\n\n").slice(0, 4096))
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		}

		if (sub === "set") {
			const channel = interaction.options.getChannel("channel", true);
			const role = interaction.options.getRole("role", true);
			const action = interaction.options.getString("action", true);
			const permName = interaction.options.getString("permission", true);

			const guildChannel = guild.channels.cache.get(channel.id);
			if (!guildChannel || !("permissionOverwrites" in guildChannel)) {
				await interaction.editReply({ content: "Channel not found." });
				return;
			}

			const permValue: Record<string, boolean | null> = {};
			if (action === "allow") {
				permValue[permName] = true;
			} else if (action === "deny") {
				permValue[permName] = false;
			} else {
				permValue[permName] = null;
			}

			await guildChannel.permissionOverwrites.edit(role.id, permValue, {
				reason: `Set by ${interaction.user.tag} via /permissions set`,
			});

			await logAction(
				guild,
				"PERM",
				`${action} ${permName} for @${role.name} on #${guildChannel.name} by ${interaction.user.tag}`,
			);

			const embed = new EmbedBuilder()
				.setColor(EMBED_COLORS.SUCCESS)
				.setTitle("Permission Updated")
				.addFields(
					{ name: "Channel", value: `<#${channel.id}>`, inline: true },
					{ name: "Role", value: `@${role.name}`, inline: true },
					{ name: "Action", value: `${action} ${permName}`, inline: true },
				)
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		}
	},
};

export default command;
