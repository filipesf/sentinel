/**
 * Thread Creator — Creates agent session threads
 *
 * Supports two modes:
 *
 * 1. **Contextual** — Thread created in the current channel (e.g. /session).
 * 2. **Routed** — Thread created in a fixed destination channel,
 *    regardless of where the command was invoked (e.g. /corven, /growth).
 *
 * All session threads are prompt-based: the user's prompt determines the
 * thread name and is sent to the agent via OpenClaw's POST /hooks/agent.
 * No @mentioning needed — the agent starts working immediately.
 *
 * Flow:
 * 1. User runs a session command with a prompt
 * 2. Sentinel resolves the target channel (current or routed)
 * 3. Sentinel derives the thread name from the prompt
 * 4. Sentinel creates the thread and adds invoker + agent bot
 * 5. Sentinel calls OpenClaw to kick off the agent with the prompt
 * 6. Sentinel replies ephemerally with a link to the thread
 */

import {
  ChannelType,
  type ChatInputCommandInteraction,
  type Guild,
  type TextChannel,
  type ThreadAutoArchiveDuration,
} from 'discord.js';
import {
  agentConfigs,
  channelAgentDefaults,
} from '../config/server-architecture.js';
import { AUTO_ARCHIVE_DURATION } from '../utils/constants.js';
import { deriveThreadName } from '../utils/helpers.js';
import { logAction } from './audit-logger.js';
import { triggerAgent } from './openclaw-client.js';

export interface ThreadResult {
  success: boolean;
  threadId?: string;
  agentMention?: string;
  error?: string;
}

export interface CreateSessionOptions {
  /** The interaction that triggered this command */
  interaction: ChatInputCommandInteraction;
  /** User's prompt — used for thread name and agent instruction */
  prompt: string;
  /** Agent key (e.g. "corven"). If omitted, resolved from channel defaults. */
  agentKey?: string;
  /**
   * Destination channel name for routed commands (e.g. "corven", "growth").
   * If null/undefined, the thread is created in the current channel (contextual).
   */
  destinationChannel?: string;
}

/**
 * Find a text channel by name in the guild.
 */
function findTextChannel(guild: Guild, channelName: string): TextChannel | undefined {
  return guild.channels.cache.find(
    (ch) => ch.name === channelName && ch.type === ChannelType.GuildText,
  ) as TextChannel | undefined;
}

/**
 * Resolve the agent bot's Discord user ID from the managed role.
 * Returns the bot member or undefined if not found.
 */
async function resolveAgentBot(guild: Guild, roleName: string) {
  // Ensure guild member cache is populated
  await guild.members.fetch();

  const botRole = guild.roles.cache.find(
    (r) => r.name === roleName && r.managed,
  );

  if (!botRole) {
    console.warn(
      `[THREAD] Bot role @${roleName} (managed) not found — agent may not be in the server yet`,
    );
    return undefined;
  }

  const member = botRole.members.first();
  if (!member) {
    console.warn(
      `[THREAD] Managed role @${roleName} has no members — cache may be stale`,
    );
  }
  return member;
}

/**
 * Create a prompt-based agent session thread.
 *
 * Handles both contextual (current channel) and routed (destination channel)
 * modes. Creates the thread, adds members, and triggers the agent via OpenClaw.
 */
export async function createSessionThread(
  options: CreateSessionOptions,
): Promise<ThreadResult> {
  const { interaction, prompt, destinationChannel } = options;
  const guild = interaction.guild!;

  // Resolve target channel
  let targetChannel: TextChannel;

  if (destinationChannel) {
    // Routed: find the destination channel
    const found = findTextChannel(guild, destinationChannel);
    if (!found) {
      return {
        success: false,
        error: `Channel #${destinationChannel} not found. Run \`/setup full\` to create it.`,
      };
    }
    targetChannel = found;
  } else {
    // Contextual: use current channel
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      return {
        success: false,
        error: 'This command can only be used in a text channel.',
      };
    }
    targetChannel = channel as TextChannel;
  }

  // Resolve agent
  const agentKey =
    options.agentKey ?? channelAgentDefaults[targetChannel.name] ?? 'corven';
  const agent = agentConfigs[agentKey];

  if (!agent) {
    return { success: false, error: `Unknown agent: ${agentKey}` };
  }

  // Derive thread name from prompt
  const threadName = deriveThreadName(prompt);

  try {
    // Create the thread
    const thread = await targetChannel.threads.create({
      name: threadName,
      autoArchiveDuration: AUTO_ARCHIVE_DURATION as ThreadAutoArchiveDuration,
      reason: `${agent.name} session: "${threadName}" — invoked by ${interaction.user.tag}`,
    });

    // Add invoker
    await thread.members.add(interaction.user.id);

    // Add agent bot
    let agentMention = `@${agent.name}`;
    const agentBot = await resolveAgentBot(guild, agent.roleName);

    if (agentBot) {
      await thread.members.add(agentBot.id);
      agentMention = `<@${agentBot.id}>`;
      console.log(
        `[THREAD] Added ${agent.name} bot (${agentBot.id}) to thread`,
      );
    }

    // Trigger agent via OpenClaw hooks API (fire-and-forget).
    // deliver: true posts the response to the thread. threadBindings
    // is disabled to prevent the Discord listener from re-triggering
    // on the delivered message.
    const triggered = await triggerAgent({
      prompt,
      agentId: agentKey,
      threadId: thread.id,
    });

    if (!triggered) {
      console.warn(
        `[THREAD] Agent trigger failed for ${agentKey} — thread created but agent won't auto-respond`,
      );
    }

    // Audit log
    await logAction(
      guild,
      'THREAD',
      `${agent.emoji} ${agent.name} session in #${targetChannel.name}: "${threadName}"`,
    );

    return { success: true, threadId: thread.id, agentMention };
  } catch (err) {
    return {
      success: false,
      error: `Failed to create thread: ${err}`,
    };
  }
}
