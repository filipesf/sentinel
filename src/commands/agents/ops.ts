import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { createSessionThread } from '../../services/thread-creator.js';
import type { Command } from '../../types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ops')
    .setDescription('Start an ops session (checklists, tracking, reports)')
    .addStringOption((opt) =>
      opt
        .setName('prompt')
        .setDescription('What ops task should the agent work on?')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const prompt = interaction.options.getString('prompt', true);

    const result = await createSessionThread({
      interaction,
      prompt,
      destinationChannel: 'ops',
    });

    if (result.success) {
      await interaction.editReply({
        content: `\u{1f4cb} Ops session \u2192 <#${result.threadId}>`,
      });
    } else {
      await interaction.editReply({
        content: `\u274c ${result.error}`,
      });
    }
  },
};

export default command;
