# Discord.js Developer Reference

> Reference notes for building a Discord AI Agent bot using **discord.js v14**.
> Compiled from official discord.js documentation and guides.

---

## Table of Contents

1. [Bot Setup & Client Initialization](#1-bot-setup--client-initialization)
2. [Gateway Intents](#2-gateway-intents)
3. [Slash Commands](#3-slash-commands)
4. [Command Deployment](#4-command-deployment)
5. [Command Handling](#5-command-handling)
6. [Guild (Server) Management](#6-guild-server-management)
7. [Role Management](#7-role-management)
8. [Channel Management](#8-channel-management)
9. [Permission Management](#9-permission-management)
10. [Key API Endpoints](#10-key-api-endpoints)
11. [Useful Links](#11-useful-links)

---

## 1. Bot Setup & Client Initialization

### Prerequisites

- Node.js v16.11.0 or higher
- `discord.js` v14 (`npm install discord.js`)
- A bot token from the [Discord Developer Portal](https://discord.com/developers/applications)

### Basic Client Setup

```javascript
const { Client, Events, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.login('YOUR_BOT_TOKEN');
```

### Config Pattern (recommended)

Store sensitive values in `config.json` (gitignored) or environment variables:

```json
{
  "token": "YOUR_BOT_TOKEN",
  "clientId": "YOUR_APPLICATION_ID",
  "guildId": "YOUR_GUILD_ID"
}
```

```javascript
const { token } = require('./config.json');
client.login(token);
```

---

## 2. Gateway Intents

Intents control which events your bot receives. Only request what you need.

| Intent                                    | Description                                                  |
| ----------------------------------------- | ------------------------------------------------------------ |
| `GatewayIntentBits.Guilds`                | Guild create/update/delete, role/channel CRUD, thread events |
| `GatewayIntentBits.GuildMembers`          | Member add/update/remove (**Privileged**)                    |
| `GatewayIntentBits.GuildMessages`         | Message create/update/delete in guild channels               |
| `GatewayIntentBits.MessageContent`        | Access to message content (**Privileged**)                   |
| `GatewayIntentBits.GuildMessageReactions` | Reaction add/remove events                                   |
| `GatewayIntentBits.GuildPresences`        | Presence/status updates (**Privileged**)                     |
| `GatewayIntentBits.GuildVoiceStates`      | Voice state updates                                          |

**Privileged intents** must be enabled in the Discord Developer Portal under your app's Bot settings.

### For our AI Agent bot, we need at minimum:

```javascript
intents: [
  GatewayIntentBits.Guilds, // Guild and channel info
  GatewayIntentBits.GuildMembers, // Member management
  GatewayIntentBits.GuildMessages, // Read messages
  GatewayIntentBits.MessageContent, // Read message content
];
```

---

## 3. Slash Commands

### Defining a Command

Each command is a separate file exporting `data` (SlashCommandBuilder) and `execute` (function):

```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  async execute(interaction) {
    await interaction.reply('Pong!');
  },
};
```

### Command with Options

```javascript
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Select a member and ban them.')
    .addUserOption((option) =>
      option
        .setName('target')
        .setDescription('The member to ban')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('The reason for banning'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(InteractionContextType.Guild),
};
```

### Subcommands

```javascript
const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('info')
  .setDescription('Get info about a user or a server!')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('user')
      .setDescription('Info about a user')
      .addUserOption((option) =>
        option.setName('target').setDescription('The user'),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('server').setDescription('Info about the server'),
  );
```

### Available Option Types

| Method                    | Type                 |
| ------------------------- | -------------------- |
| `.addStringOption()`      | String input         |
| `.addIntegerOption()`     | Integer input        |
| `.addBooleanOption()`     | True/false toggle    |
| `.addUserOption()`        | User mention picker  |
| `.addChannelOption()`     | Channel picker       |
| `.addRoleOption()`        | Role picker          |
| `.addMentionableOption()` | User or role picker  |
| `.addNumberOption()`      | Float/decimal input  |
| `.addAttachmentOption()`  | File attachment      |
| `.addSubcommand()`        | Subcommand           |
| `.addSubcommandGroup()`   | Group of subcommands |

---

## 4. Command Deployment

Commands must be registered with Discord's API before they can be used.

### Deploy to a Specific Guild (instant, good for development)

```javascript
const { REST, Routes } = require('discord.js');
const { clientId, guildId, token } = require('./config.json');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing "data" or "execute".`,
      );
    }
  }
}

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`,
    );
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );
    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`,
    );
  } catch (error) {
    console.error(error);
  }
})();
```

### Deploy Globally (takes ~1 hour to propagate)

```javascript
await rest.put(Routes.applicationCommands(clientId), { body: commands });
```

---

## 5. Command Handling

### Dynamic Command Loader (in main bot file)

```javascript
const { Collection } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    }
  }
}
```

### Interaction Handler

```javascript
const { Events, MessageFlags } = require('discord.js');

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const content = 'There was an error while executing this command!';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
});
```

---

## 6. Guild (Server) Management

### Accessing the Guild

```javascript
// From an interaction
const guild = interaction.guild;

// From client cache
const guild = client.guilds.cache.get('GUILD_ID');

// Fetch from API (if not cached)
const guild = await client.guilds.fetch('GUILD_ID');
```

### Key Guild Properties

| Property            | Description                          |
| ------------------- | ------------------------------------ |
| `guild.name`        | Server name                          |
| `guild.id`          | Server ID (snowflake)                |
| `guild.memberCount` | Approximate member count             |
| `guild.channels`    | ChannelManager (access all channels) |
| `guild.roles`       | RoleManager (access all roles)       |
| `guild.members`     | GuildMemberManager                   |
| `guild.ownerId`     | ID of the server owner               |
| `guild.icon`        | Server icon hash                     |

---

## 7. Role Management

### Creating a Role

```javascript
const role = await guild.roles.create({
  name: 'Moderator',
  color: '#3498db', // Hex color or Discord color resolvable
  hoist: true, // Display separately in member list
  mentionable: true, // Allow @mentions
  permissions: [
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
  ],
  reason: 'Created by AI Agent',
});
console.log(`Created role: ${role.name} (${role.id})`);
```

### Role Create Options

| Option         | Type                 | Description                       |
| -------------- | -------------------- | --------------------------------- |
| `name`         | string               | Role name (required)              |
| `color`        | ColorResolvable      | Hex, integer, or named color      |
| `colors`       | RoleColorsResolvable | Multi-color support (newer)       |
| `hoist`        | boolean              | Show separately in member sidebar |
| `mentionable`  | boolean              | Allow @role mentions              |
| `permissions`  | PermissionResolvable | Bitfield or array of permissions  |
| `position`     | number               | Position in role hierarchy        |
| `icon`         | BufferResolvable     | Role icon image                   |
| `unicodeEmoji` | string               | Unicode emoji for role            |
| `reason`       | string               | Audit log reason                  |

### Editing a Role

```javascript
const role = guild.roles.cache.find((r) => r.name === 'Moderator');
await role.edit({
  name: 'Senior Moderator',
  color: '#e74c3c',
});
```

### Deleting a Role

```javascript
await role.delete('No longer needed');
```

### Assigning a Role to a Member

```javascript
const member = await guild.members.fetch('USER_ID');
await member.roles.add(role, 'Assigned by AI Agent');
```

### Removing a Role from a Member

```javascript
await member.roles.remove(role, 'Removed by AI Agent');
```

---

## 8. Channel Management

### Creating a Text Channel

```javascript
const { ChannelType } = require('discord.js');

const channel = await guild.channels.create({
  name: 'general-chat',
  type: ChannelType.GuildText,
  topic: 'A place for general discussion',
  parent: 'CATEGORY_ID', // Optional: place in a category
  reason: 'Created by AI Agent',
});
```

### Creating a Voice Channel

```javascript
const voiceChannel = await guild.channels.create({
  name: 'Voice Lounge',
  type: ChannelType.GuildVoice,
  bitrate: 96000,
  userLimit: 10,
  parent: 'CATEGORY_ID',
  reason: 'Created by AI Agent',
});
```

### Creating a Category

```javascript
const category = await guild.channels.create({
  name: 'Staff Area',
  type: ChannelType.GuildCategory,
  reason: 'Created by AI Agent',
});
```

### Channel Types

| Type                            | Enum Value           |
| ------------------------------- | -------------------- |
| `ChannelType.GuildText`         | Text channel         |
| `ChannelType.GuildVoice`        | Voice channel        |
| `ChannelType.GuildCategory`     | Category (container) |
| `ChannelType.GuildAnnouncement` | Announcement channel |
| `ChannelType.GuildForum`        | Forum channel        |
| `ChannelType.GuildStageVoice`   | Stage channel        |

### Channel Create Options (CategoryCreateChannelOptions)

| Option                 | Type                  | Description               |
| ---------------------- | --------------------- | ------------------------- |
| `name`                 | string                | Channel name (required)   |
| `type`                 | ChannelType           | Channel type              |
| `topic`                | string                | Channel topic/description |
| `parent`               | Snowflake             | Parent category ID        |
| `position`             | number                | Position in channel list  |
| `nsfw`                 | boolean               | NSFW flag                 |
| `rateLimitPerUser`     | number                | Slowmode in seconds       |
| `bitrate`              | number                | Voice bitrate in bits     |
| `userLimit`            | number                | Voice user limit          |
| `permissionOverwrites` | OverwriteResolvable[] | Permission overrides      |
| `reason`               | string                | Audit log reason          |

### Editing a Channel

```javascript
await channel.edit({
  name: 'new-channel-name',
  topic: 'Updated topic',
  rateLimitPerUser: 5, // 5 second slowmode
});
```

### Deleting a Channel

```javascript
await channel.delete('No longer needed');
```

### Setting Channel Position

```javascript
await channel.setPosition(0); // Move to top
```

---

## 9. Permission Management

### Permission Flags (commonly used)

| Flag                                          | Description                     |
| --------------------------------------------- | ------------------------------- |
| `PermissionFlagsBits.Administrator`           | Full server access              |
| `PermissionFlagsBits.ManageGuild`             | Edit server settings            |
| `PermissionFlagsBits.ManageRoles`             | Create/edit/delete roles        |
| `PermissionFlagsBits.ManageChannels`          | Create/edit/delete channels     |
| `PermissionFlagsBits.ManageMessages`          | Delete/pin messages             |
| `PermissionFlagsBits.KickMembers`             | Kick members                    |
| `PermissionFlagsBits.BanMembers`              | Ban members                     |
| `PermissionFlagsBits.SendMessages`            | Send messages                   |
| `PermissionFlagsBits.ViewChannel`             | View/read channels              |
| `PermissionFlagsBits.Connect`                 | Connect to voice                |
| `PermissionFlagsBits.Speak`                   | Speak in voice                  |
| `PermissionFlagsBits.MentionEveryone`         | Use @everyone/@here             |
| `PermissionFlagsBits.ManageNicknames`         | Change other members' nicknames |
| `PermissionFlagsBits.ModerateMembers`         | Timeout members                 |
| `PermissionFlagsBits.ManageWebhooks`          | Create/edit/delete webhooks     |
| `PermissionFlagsBits.ManageEmojisAndStickers` | Manage emojis/stickers          |

### Channel Permission Overwrites

Set per-channel permissions for a role or user:

```javascript
// Create/replace permission overwrites
await channel.permissionOverwrites.create(role, {
  ViewChannel: true,
  SendMessages: true,
  ManageMessages: false,
});

// Edit existing overwrites (merge)
await channel.permissionOverwrites.edit(role, {
  SendMessages: false,
});

// Delete overwrites
const overwrite = channel.permissionOverwrites.cache.get(role.id);
await overwrite.delete('Reset permissions');
```

### Setting Multiple Overwrites at Channel Creation

```javascript
const channel = await guild.channels.create({
  name: 'staff-only',
  type: ChannelType.GuildText,
  permissionOverwrites: [
    {
      id: guild.id, // @everyone role
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: staffRole.id, // Staff role
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ],
    },
  ],
});
```

---

## 10. Key API Endpoints

These are the REST endpoints discord.js uses under the hood. Useful for understanding rate limits and API structure:

| Action                     | Method   | Endpoint                                               |
| -------------------------- | -------- | ------------------------------------------------------ |
| Create Role                | `POST`   | `/guilds/{guild.id}/roles`                             |
| Edit Role                  | `PATCH`  | `/guilds/{guild.id}/roles/{role.id}`                   |
| Delete Role                | `DELETE` | `/guilds/{guild.id}/roles/{role.id}`                   |
| Create Channel             | `POST`   | `/guilds/{guild.id}/channels`                          |
| Edit Channel               | `PATCH`  | `/channels/{channel.id}`                               |
| Delete Channel             | `DELETE` | `/channels/{channel.id}`                               |
| Set Channel Perms          | `PUT`    | `/channels/{channel.id}/permissions/{overwrite.id}`    |
| Delete Channel Perms       | `DELETE` | `/channels/{channel.id}/permissions/{overwrite.id}`    |
| Add Role to Member         | `PUT`    | `/guilds/{guild.id}/members/{user.id}/roles/{role.id}` |
| Remove Role from Member    | `DELETE` | `/guilds/{guild.id}/members/{user.id}/roles/{role.id}` |
| Register Commands (Guild)  | `PUT`    | `/applications/{app.id}/guilds/{guild.id}/commands`    |
| Register Commands (Global) | `PUT`    | `/applications/{app.id}/commands`                      |

---

## 11. Useful Links

- **Discord.js Guide**: https://discordjs.guide/
- **Discord.js Docs (v14)**: https://discord.js.org/docs/packages/discord.js/14.25.1
- **Discord Developer Portal**: https://discord.com/developers/applications
- **Discord API Docs**: https://discord.com/developers/docs/intro
- **Discord.js GitHub**: https://github.com/discordjs/discord.js
- **Permissions Calculator**: https://discordapi.com/permissions.html

---

## Project Architecture (Planned)

```
discord/
├── config.json              # Token, clientId, guildId (gitignored)
├── index.js                 # Main bot entry point
├── deploy-commands.js       # Script to register slash commands
├── commands/
│   └── admin/
│       ├── create-role.js   # /create-role command
│       ├── create-channel.js # /create-channel command
│       ├── set-permissions.js # /set-permissions command
│       └── setup-server.js  # /setup-server (AI-driven full setup)
├── events/
│   ├── ready.js             # Client ready handler
│   └── interactionCreate.js # Interaction router
├── services/
│   └── ai-agent.js          # AI agent logic (LLM integration)
├── utils/
│   └── permissions.js       # Permission helpers
└── DISCORD_JS_REFERENCE.md  # This file
```

---

## Notes for AI Agent Integration

- The bot will use **slash commands** as the primary interface for users to interact with the AI agent.
- The AI agent will receive natural language instructions (e.g., "create a moderator role with kick and ban permissions") and translate them into discord.js API calls.
- All operations should include **audit log reasons** for traceability.
- The bot needs the following **bot permissions** in the server:
  - `Administrator` (simplest), or specifically:
  - `Manage Roles`, `Manage Channels`, `Manage Guild`, `Send Messages`, `View Channels`
- **Rate limits**: Discord has rate limits on API calls. The bot should handle `429 Too Many Requests` responses gracefully (discord.js handles this automatically with built-in queue).
- **Role hierarchy**: The bot can only manage roles **below** its own highest role in the hierarchy. Ensure the bot's role is positioned high enough.
- **Privileged intents** (`GuildMembers`, `MessageContent`) must be enabled in the Developer Portal.
