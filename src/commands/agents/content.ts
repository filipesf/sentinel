import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { createSessionThread } from '../../services/thread-creator.js';
import type { Command } from '../../types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('content')
    .setDescription('Start a content session (posts, copy, CTAs)')
    .addStringOption((opt) =>
      opt
        .setName('prompt')
        .setDescription('What content task should the agent work on?')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const prompt = interaction.options.getString('prompt', true);

    const result = await createSessionThread({
      interaction,
      prompt,
      destinationChannel: 'content',
    });

    if (result.success) {
      await interaction.editReply({
        content: `\u{1f4dd} Content session \u2192 <#${result.threadId}>`,
      });
    } else {
      await interaction.editReply({
        content: `\u274c ${result.error}`,
      });
    }
  },
};

export default command;
