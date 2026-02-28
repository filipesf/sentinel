/**
 * /standup — Post a standup to #squad-feed
 *
 * Posts a standup message with one embed per active agent.
 * Each embed uses the agent's color, emoji, and a consistent
 * three-field structure: ✅ Completed, 🔄 In Progress, 🚫 Blocked.
 *
 * Currently only Corven is active (single-agent, multi-context).
 * When dedicated squad agents are added to OpenClaw, add them to
 * `activeAgents` in server-architecture.ts — this command will
 * automatically pick them up.
 *
 * Type: Routed → #squad-feed
 */

import {
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type TextChannel,
} from 'discord.js';
import { activeAgents, agentConfigs } from '../config/server-architecture.js';
import { formatTimestamp } from '../utils/helpers.js';
import { logAction } from '../services/audit-logger.js';
import type { Command } from '../types.js';

const DESTINATION_CHANNEL = 'squad-feed';

/** Agents that participate in standups — derived from activeAgents (only agents live in OpenClaw) */
const STANDUP_AGENTS = activeAgents;

function buildStandupEmbed(agentKey: string): EmbedBuilder | null {
  const agent = agentConfigs[agentKey];
  if (!agent) return null;

  return new EmbedBuilder()
    .setTitle(`${agent.emoji} ${agent.name}`)
    .setColor(agent.color)
    .addFields(
      {
        name: '\u2705 Completed',
        value: '_No updates yet — reply in thread to fill in_',
        inline: false,
      },
      {
        name: '\u{1f504} In Progress',
        value: '_No updates yet — reply in thread to fill in_',
        inline: false,
      },
      {
        name: '\u{1f6ab} Blocked',
        value: 'Nothing blocked',
        inline: false,
      },
    )
    .setFooter({ text: `Last active: ${formatTimestamp()}` });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('standup')
    .setDescription('Post a standup to #squad-feed')
    .addStringOption((opt) =>
      opt
        .setName('agent')
        .setDescription('Specific agent (omit for all agents)')
        .setRequired(false)
        .addChoices(
          ...STANDUP_AGENTS.filter((key) => agentConfigs[key]).map((key) => {
            const cfg = agentConfigs[key]!;
            return { name: `${cfg.emoji} ${cfg.name}`, value: key };
          }),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const agentParam = interaction.options.getString('agent');
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

    // Build embeds
    const agents = agentParam ? [agentParam] : [...STANDUP_AGENTS];
    const embeds: EmbedBuilder[] = [];

    for (const key of agents) {
      const embed = buildStandupEmbed(key);
      if (embed) embeds.push(embed);
    }

    if (embeds.length === 0) {
      await interaction.editReply({
        content: '\u274c No valid agents found for standup.',
      });
      return;
    }

    // Build date header
    const today = new Date().toISOString().split('T')[0];
    const headerText = `\u{1f4e1} **Standup \u2014 ${today}**`;

    // Post to #squad-feed
    const message = await feedChannel.send({
      content: headerText,
      embeds,
    });

    // Audit log
    const agentNames = agents
      .map((k) => agentConfigs[k]?.name ?? k)
      .join(', ');
    await logAction(
      guild,
      'STANDUP',
      `\u{1f4e1} Standup posted in #${DESTINATION_CHANNEL} for: ${agentNames}`,
    );

    await interaction.editReply({
      content: `\u{1f4e1} Standup posted \u2192 ${message.url}`,
    });
  },
};

export default command;
