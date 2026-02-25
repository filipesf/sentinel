import { Events, type Interaction, MessageFlags } from 'discord.js';

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) {
    console.error(
      `[COMMAND] No command matching "${interaction.commandName}" was found.`,
    );
    return;
  }

  console.log(
    `[COMMAND] ${interaction.user.tag} used /${interaction.commandName}${interaction.options.getSubcommand(false) ? ` ${interaction.options.getSubcommand()}` : ''} in #${interaction.channel && 'name' in interaction.channel ? interaction.channel.name : 'unknown'}`,
  );

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(
      `[COMMAND] Error executing /${interaction.commandName}:`,
      error,
    );

    // The interaction's channel or message may have been deleted (e.g. --clean
    // deletes the channel the command was invoked from). Wrap recovery in
    // try/catch so a failed followUp doesn't crash the process.
    try {
      const content = 'There was an error while executing this command.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    } catch {
      console.warn(
        `[COMMAND] Could not send error response for /${interaction.commandName} (interaction may have expired or channel was deleted)`,
      );
    }
  }
}
