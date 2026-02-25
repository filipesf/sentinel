import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { EMBED_COLORS } from '../utils/constants.js';
import type { Command } from '../types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show bot status, uptime, and server info'),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client;
    const guild = interaction.guild;
    const uptime = client.uptime ?? 0;

    const hours = Math.floor(uptime / 3_600_000);
    const minutes = Math.floor((uptime % 3_600_000) / 60_000);
    const seconds = Math.floor((uptime % 60_000) / 1_000);

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.INFO)
      .setTitle('Setup Bot Status')
      .addFields(
        { name: 'Bot', value: client.user?.tag ?? 'Unknown', inline: true },
        { name: 'Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
        { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
      );

    if (guild) {
      embed.addFields(
        { name: 'Server', value: guild.name, inline: true },
        { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
        { name: 'Channels', value: String(guild.channels.cache.size), inline: true },
      );
    }

    embed.setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default command;
