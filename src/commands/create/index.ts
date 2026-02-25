import {
	type CategoryChannel,
	ChannelType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { logAction } from "../../services/audit-logger.js";
import type { Command } from "../../types.js";
import { EMBED_COLORS } from "../../utils/constants.js";

const command: Command = {
	data: new SlashCommandBuilder()
		.setName("create")
		.setDescription("Create server resources")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((sub) =>
			sub
				.setName("role")
				.setDescription("Create a new role")
				.addStringOption((opt) =>
					opt.setName("name").setDescription("Role name").setRequired(true),
				)
				.addStringOption((opt) =>
					opt
						.setName("color")
						.setDescription("Hex color (e.g. #3498db)")
						.setRequired(true),
				)
				.addBooleanOption((opt) =>
					opt
						.setName("hoist")
						.setDescription("Display separately in member list"),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("channel")
				.setDescription("Create a text channel in a category")
				.addStringOption((opt) =>
					opt
						.setName("category")
						.setDescription("Category name")
						.setRequired(true),
				)
				.addStringOption((opt) =>
					opt.setName("name").setDescription("Channel name").setRequired(true),
				)
				.addStringOption((opt) =>
					opt.setName("topic").setDescription("Channel topic"),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("category")
				.setDescription("Create a new category")
				.addStringOption((opt) =>
					opt.setName("name").setDescription("Category name").setRequired(true),
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

		if (sub === "role") {
			const name = interaction.options.getString("name", true);
			const color = interaction.options.getString("color", true);
			const hoist = interaction.options.getBoolean("hoist") ?? false;

			// Validate hex color
			const colorMatch = color.match(/^#?([0-9a-fA-F]{6})$/);
			if (!colorMatch) {
				await interaction.editReply({
					content: "Invalid hex color. Use format: #3498db",
				});
				return;
			}

			const existing = guild.roles.cache.find((r) => r.name === name);
			if (existing) {
				await interaction.editReply({
					content: `Role "@${name}" already exists.`,
				});
				return;
			}

			const role = await guild.roles.create({
				name,
				colors: { primaryColor: parseInt(colorMatch[1], 16) },
				hoist,
				reason: `Created by ${interaction.user.tag} via /create role`,
			});

			await logAction(
				guild,
				"ROLE",
				`Created @${name} by ${interaction.user.tag}`,
			);

			const embed = new EmbedBuilder()
				.setColor(EMBED_COLORS.SUCCESS)
				.setTitle("Role Created")
				.addFields(
					{ name: "Name", value: `@${role.name}`, inline: true },
					{
						name: "Color",
						value: `#${role.color.toString(16).padStart(6, "0")}`,
						inline: true,
					},
					{ name: "Hoisted", value: String(role.hoist), inline: true },
				)
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		}

		if (sub === "channel") {
			const categoryName = interaction.options.getString("category", true);
			const name = interaction.options.getString("name", true);
			const topic = interaction.options.getString("topic") ?? undefined;

			const category = guild.channels.cache.find(
				(ch) =>
					ch.name === categoryName && ch.type === ChannelType.GuildCategory,
			) as CategoryChannel | undefined;

			if (!category) {
				await interaction.editReply({
					content: `Category "${categoryName}" not found.`,
				});
				return;
			}

			const existing = guild.channels.cache.find(
				(ch) => ch.name === name && ch.parentId === category.id,
			);
			if (existing) {
				await interaction.editReply({
					content: `Channel "#${name}" already exists in "${categoryName}".`,
				});
				return;
			}

			const channel = await guild.channels.create({
				name,
				type: ChannelType.GuildText,
				topic,
				parent: category.id,
				reason: `Created by ${interaction.user.tag} via /create channel`,
			});

			await logAction(
				guild,
				"CHANNEL",
				`Created #${name} in ${categoryName} by ${interaction.user.tag}`,
			);

			const embed = new EmbedBuilder()
				.setColor(EMBED_COLORS.SUCCESS)
				.setTitle("Channel Created")
				.addFields(
					{ name: "Channel", value: `<#${channel.id}>`, inline: true },
					{ name: "Category", value: categoryName, inline: true },
					{ name: "Topic", value: topic ?? "None", inline: true },
				)
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		}

		if (sub === "category") {
			const name = interaction.options.getString("name", true);

			const existing = guild.channels.cache.find(
				(ch) => ch.name === name && ch.type === ChannelType.GuildCategory,
			);
			if (existing) {
				await interaction.editReply({
					content: `Category "${name}" already exists.`,
				});
				return;
			}

			// Deny @everyone ViewChannel by default
			const category = await guild.channels.create({
				name,
				type: ChannelType.GuildCategory,
				permissionOverwrites: [
					{
						id: guild.id,
						deny: [PermissionFlagsBits.ViewChannel],
					},
				],
				reason: `Created by ${interaction.user.tag} via /create category`,
			});

			await logAction(
				guild,
				"CATEGORY",
				`Created ${name} by ${interaction.user.tag}`,
			);

			const embed = new EmbedBuilder()
				.setColor(EMBED_COLORS.SUCCESS)
				.setTitle("Category Created")
				.addFields({ name: "Name", value: category.name })
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		}
	},
};

export default command;
