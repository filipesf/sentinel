/**
 * Thread Creator — Creates agent session threads
 *
 * Creates a blank thread and adds the user + agent bot as members.
 * The thread starts with a timestamp-only name (YYYYMMDD — New session).
 * The user then mentions the agent to start chatting. OpenClaw's Discord
 * integration picks up the user's message and responds via its AI backend.
 *
 * Flow:
 * 1. User runs /corven (no params)
 * 2. Sentinel creates the thread with a timestamp title
 * 3. Sentinel adds the invoker + agent bot to the thread
 * 4. Sentinel replies ephemerally with a link + instructions
 * 5. The user @mentions the agent in the thread to start chatting
 * 6. OpenClaw sees the user message and responds
 * 7. After the first exchange, the thread name can be updated to
 *    something meaningful (by the agent or Sentinel)
 */

import {
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
  type ThreadAutoArchiveDuration,
} from 'discord.js';
import { agentConfigs } from '../config/server-architecture.js';
import { AUTO_ARCHIVE_DURATION } from '../utils/constants.js';
import { formatDateCompact } from '../utils/helpers.js';
import { logAction } from './audit-logger.js';

export interface ThreadResult {
  success: boolean;
  threadId?: string;
  agentMention?: string;
  error?: string;
}

/**
 * Check if an agent has access to a specific channel.
 * Uses the architecture config, not live permission checks.
 */
function agentHasAccess(
  agentKey: string,
  channelName: string,
  categoryName: string | null,
): boolean {
  const agent = agentConfigs[agentKey];
  if (!agent) return false;

  if (agent.deniedChannels.includes(channelName)) {
    return false;
  }

  if (categoryName && agent.accessibleCategories.includes(categoryName)) {
    return true;
  }

  return false;
}

/**
 * Create an agent session thread in the current channel.
 *
 * The bot creates a blank thread and adds members. No messages are posted.
 * The user starts the conversation by @mentioning the agent.
 */
export async function createAgentThread(
  interaction: ChatInputCommandInteraction,
  agentKey: string,
): Promise<ThreadResult> {
  const agent = agentConfigs[agentKey];
  if (!agent) {
    return { success: false, error: `Unknown agent: ${agentKey}` };
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    return {
      success: false,
      error: 'This command can only be used in a text channel.',
    };
  }

  const textChannel = channel as TextChannel;
  const categoryName = textChannel.parent?.name ?? null;

  if (!agentHasAccess(agentKey, textChannel.name, categoryName)) {
    return {
      success: false,
      error: `${agent.name} doesn't have access to this channel.`,
    };
  }

  const threadTitle = `${formatDateCompact()} \u2014 New session`;

  try {
    const guild = interaction.guild!;

    const thread = await textChannel.threads.create({
      name: threadTitle,
      autoArchiveDuration: AUTO_ARCHIVE_DURATION as ThreadAutoArchiveDuration,
      reason: `Agent session: ${agent.name} invoked by ${interaction.user.tag}`,
    });

    // Add the invoker to the thread
    await thread.members.add(interaction.user.id);

    // Find the agent's bot account via the managed role. Both the custom
    // permission role and the managed bot role share the same name
    // (e.g. "Corven"). Filter by r.managed to get the bot's role,
    // which has exactly one member: the bot account.
    //
    // IMPORTANT: role.members only includes cached members. We must fetch
    // guild members first to ensure the cache is populated, otherwise
    // the collection may be empty even though the bot is in the server.
    await guild.members.fetch();

    const botRole = guild.roles.cache.find(
      (r) => r.name === agent.roleName && r.managed,
    );

    let agentMention = `@${agent.name}`;

    if (botRole) {
      const agentMember = botRole.members.first();
      if (agentMember) {
        await thread.members.add(agentMember.id);
        agentMention = `<@${agentMember.id}>`;
        console.log(
          `[THREAD] Added ${agent.name} bot (${agentMember.id}) to thread`,
        );
      } else {
        console.warn(
          `[THREAD] Managed role @${agent.roleName} has no members — cache may be stale`,
        );
      }
    } else {
      console.warn(
        `[THREAD] Bot role @${agent.roleName} (managed) not found — agent may not be in the server yet`,
      );
    }

    // Log the action
    await logAction(
      guild,
      'THREAD',
      `${agent.emoji} ${agent.name} session created in #${textChannel.name}: "${threadTitle}"`,
    );

    return { success: true, threadId: thread.id, agentMention };
  } catch (err) {
    return {
      success: false,
      error: `Failed to create thread: ${err}`,
    };
  }
}
