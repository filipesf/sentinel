import {
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
		.setName("assign")
		.setDescription("Assign resources")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((sub) =>
			sub
				.setName("role")
				.setDescription("Assign a role to a user")
				.addUserOption((opt) =>
					opt.setName("user").setDescription("The user").setRequired(true),
				)
				.addRoleOption((opt) =>
					opt
						.setName("role")
						.setDescription("The role to assign")
						.setRequired(true),
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
			const user = interaction.options.getUser("user", true);
			const role = interaction.options.getRole("role", true);

			const member = await guild.members.fetch(user.id).catch(() => null);
			if (!member) {
				await interaction.editReply({
					content: `User ${user.tag} is not in this server.`,
				});
				return;
			}

			if (member.roles.cache.has(role.id)) {
				await interaction.editReply({
					content: `${user.tag} already has @${role.name}.`,
				});
				return;
			}

			const guildRole = guild.roles.cache.get(role.id);
			if (!guildRole) {
				await interaction.editReply({ content: "Role not found." });
				return;
			}

			await member.roles.add(
				guildRole,
				`Assigned by ${interaction.user.tag} via /assign role`,
			);

			await logAction(
				guild,
				"ROLE",
				`Assigned @${role.name} to ${user.tag} by ${interaction.user.tag}`,
			);

			const embed = new EmbedBuilder()
				.setColor(EMBED_COLORS.SUCCESS)
				.setTitle("Role Assigned")
				.addFields(
					{ name: "User", value: `<@${user.id}>`, inline: true },
					{ name: "Role", value: `@${role.name}`, inline: true },
				)
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		}
	},
};

export default command;
