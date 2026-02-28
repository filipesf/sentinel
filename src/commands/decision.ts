import {
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type TextChannel,
} from 'discord.js';
import { AGENT_COLORS } from '../utils/constants.js';
import { formatTimestamp } from '../utils/helpers.js';
import { logAction } from '../services/audit-logger.js';
import type { Command } from '../types.js';

const DESTINATION_CHANNEL = 'squad-feed';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('decision')
    .setDescription('Log a decision to #squad-feed')
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription('Short decision title')
        .setRequired(true)
        .setMaxLength(256),
    )
    .addStringOption((opt) =>
      opt
        .setName('context')
        .setDescription('What triggered this decision')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('alternatives')
        .setDescription('Other options considered')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('impact')
        .setDescription('What changes as a result')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const title = interaction.options.getString('title', true);
    const context = interaction.options.getString('context');
    const alternatives = interaction.options.getString('alternatives');
    const impact = interaction.options.getString('impact');

    const guild = interaction.guild!;

    // Find #squad-feed
    const feedChannel = guild.channels.cache.find(
      (ch) => ch.name === DESTINATION_CHANNEL && ch.type === ChannelType.GuildText,
    ) as TextChannel | undefined;

    if (!feedChannel) {
      await interaction.editReply({
        content: `\u274c Channel #${DESTINATION_CHANNEL} not found. Run \`/setup full\` to create it.`,
      });
      return;
    }

    // Build the decision embed
    const embed = new EmbedBuilder()
      .setTitle(`\u2696\ufe0f Decision: ${title}`)
      .setColor(AGENT_COLORS.DECISION)
      .setFooter({
        text: `${formatTimestamp()} \u00b7 decided by ${interaction.member && 'displayName' in interaction.member ? interaction.member.displayName : interaction.user.username}`,
      });

    const fields: { name: string; value: string; inline: boolean }[] = [];

    if (context) {
      fields.push({ name: 'Context', value: context, inline: false });
    }
    if (alternatives) {
      fields.push({ name: 'Alternatives Considered', value: alternatives, inline: false });
    }
    if (impact) {
      fields.push({ name: 'Impact', value: impact, inline: false });
    }

    if (fields.length > 0) {
      embed.addFields(fields);
    }

    // Post to #squad-feed
    const message = await feedChannel.send({ embeds: [embed] });

    // Audit log
    await logAction(
      guild,
      'DECISION',
      `\u2696\ufe0f "${title}" logged in #${DESTINATION_CHANNEL}`,
    );

    await interaction.editReply({
      content: `\u2696\ufe0f Decision logged \u2192 ${message.url}`,
    });
  },
};

export default command;
