import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { activeAgents, agentConfigs } from '../../config/server-architecture.js';
import { createSessionThread } from '../../services/thread-creator.js';
import type { Command } from '../../types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('session')
    .setDescription('Start an agent session in the current channel')
    .addStringOption((opt) =>
      opt
        .setName('prompt')
        .setDescription('Initial instruction for the agent')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('agent')
        .setDescription('Agent to use (defaults to channel default)')
        .setRequired(false)
        .addChoices(
          ...activeAgents
            .filter((key) => agentConfigs[key])
            .map((key) => ({
              name: `${agentConfigs[key]!.emoji} ${agentConfigs[key]!.name}`,
              value: key,
            })),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const prompt = interaction.options.getString('prompt', true);
    const agentKey = interaction.options.getString('agent') ?? undefined;

    const result = await createSessionThread({
      interaction,
      prompt,
      agentKey,
      // contextual — no destinationChannel, thread goes in current channel
    });

    if (result.success) {
      await interaction.editReply({
        content: `Session started \u2192 <#${result.threadId}>`,
      });
    } else {
      await interaction.editReply({
        content: `\u274c ${result.error}`,
      });
    }
  },
};

export default command;
