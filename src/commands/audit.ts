import {
  ChatInputCommandInteraction,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { EMBED_COLORS } from '../utils/constants.js';
import { logAction } from '../services/audit-logger.js';
import type { Command } from '../types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Dump current server structure to #audit-log')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Gather server info
    await guild.roles.fetch();
    await guild.channels.fetch();
    await guild.members.fetch();

    // Roles (excluding @everyone and managed/bot roles)
    const roles = guild.roles.cache
      .filter((r) => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map((r) => {
        const members = r.members.map((m) => m.displayName).join(', ') || 'none';
        return `@${r.name} — ${r.managed ? '(managed) ' : ''}${r.hoist ? 'hoisted ' : ''}#${r.color.toString(16).padStart(6, '0')} — members: ${members}`;
      });

    // Categories and channels
    const categories = guild.channels.cache
      .filter((ch) => ch.type === ChannelType.GuildCategory)
      .sort((a, b) => ('position' in a ? a.position : 0) - ('position' in b ? b.position : 0));

    const structure: string[] = [];
    for (const [, cat] of categories) {
      const channels = guild.channels.cache
        .filter((ch) => ch.parentId === cat.id)
        .sort((a, b) => ('position' in a ? a.position : 0) - ('position' in b ? b.position : 0))
        .map((ch) => `  #${ch.name}`)
        .join('\n');
      structure.push(`${cat.name}\n${channels || '  (empty)'}`);
    }

    // Orphan channels (no category)
    const orphans = guild.channels.cache
      .filter((ch) => !ch.parentId && ch.type !== ChannelType.GuildCategory)
      .map((ch) => `#${ch.name}`);

    // Post to audit-log
    await logAction(guild, 'AUDIT', `Server structure dump requested by ${interaction.user.tag}`);

    const roleEmbed = new EmbedBuilder()
      .setColor(EMBED_COLORS.INFO)
      .setTitle('Server Audit — Roles')
      .setDescription(roles.join('\n').slice(0, 4096) || 'No roles')
      .setTimestamp();

    const structureEmbed = new EmbedBuilder()
      .setColor(EMBED_COLORS.INFO)
      .setTitle('Server Audit — Channel Structure')
      .setDescription(structure.join('\n\n').slice(0, 4096) || 'No categories')
      .setTimestamp();

    // Try to post to #audit-log
    const auditChannel = guild.channels.cache.find(
      (ch) => ch.name === 'audit-log' && ch.type === ChannelType.GuildText,
    );

    if (auditChannel && auditChannel.type === ChannelType.GuildText) {
      await (auditChannel as import('discord.js').TextChannel).send({ embeds: [roleEmbed, structureEmbed] });
    }

    // Reply to the user
    const summaryEmbed = new EmbedBuilder()
      .setColor(EMBED_COLORS.SUCCESS)
      .setTitle('Audit Complete')
      .addFields(
        { name: 'Roles', value: String(guild.roles.cache.size - 1), inline: true }, // -1 for @everyone
        { name: 'Categories', value: String(categories.size), inline: true },
        {
          name: 'Channels',
          value: String(guild.channels.cache.filter((ch) => ch.type !== ChannelType.GuildCategory).size),
          inline: true,
        },
        { name: 'Members', value: String(guild.memberCount), inline: true },
      )
      .setTimestamp();

    if (orphans.length > 0) {
      summaryEmbed.addFields({
        name: 'Orphan Channels',
        value: orphans.join(', '),
      });
    }

    await interaction.editReply({
      content: auditChannel ? 'Full dump posted to #audit-log.' : 'No #audit-log channel found. Run `/setup full` first.',
      embeds: [summaryEmbed],
    });
  },
};

export default command;
