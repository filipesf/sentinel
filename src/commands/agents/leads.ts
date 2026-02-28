import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { createSessionThread } from '../../services/thread-creator.js';
import type { Command } from '../../types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('leads')
    .setDescription('Start a lead generation session')
    .addStringOption((opt) =>
      opt
        .setName('prompt')
        .setDescription('What leads should the agent build?')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const prompt = interaction.options.getString('prompt', true);

    const result = await createSessionThread({
      interaction,
      prompt,
      destinationChannel: 'growth', // leads route to #growth
    });

    if (result.success) {
      await interaction.editReply({
        content: `\u{1f50d} Lead session \u2192 <#${result.threadId}>`,
      });
    } else {
      await interaction.editReply({
        content: `\u274c ${result.error}`,
      });
    }
  },
};

export default command;
