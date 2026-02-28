import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { createSessionThread } from '../../services/thread-creator.js';
import type { Command } from '../../types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('growth')
    .setDescription('Start a growth session (campaigns, outbound, ICP)')
    .addStringOption((opt) =>
      opt
        .setName('prompt')
        .setDescription('What growth task should the agent work on?')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const prompt = interaction.options.getString('prompt', true);

    const result = await createSessionThread({
      interaction,
      prompt,
      destinationChannel: 'growth',
    });

    if (result.success) {
      await interaction.editReply({
        content: `\u{1f3af} Growth session \u2192 <#${result.threadId}>`,
      });
    } else {
      await interaction.editReply({
        content: `\u274c ${result.error}`,
      });
    }
  },
};

export default command;
