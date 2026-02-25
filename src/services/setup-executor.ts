/**
 * Setup Executor — Idempotent server bootstrapper
 *
 * Reads from server-architecture.ts config and creates/updates
 * all roles, categories, channels, and permissions.
 */

import {
  type CategoryChannel,
  ChannelType,
  type Guild,
  type OverwriteResolvable,
  PermissionsBitField,
  type Role,
  type TextChannel,
} from 'discord.js';
import {
  type CategoryConfig,
  categories as categoryConfigs,
  everyonePermissions,
  type PermissionOverwrite,
  roles as roleConfigs,
  setupBotDemotedPermissions,
} from '../config/server-architecture.js';
import { AUTO_ARCHIVE_DURATION } from '../utils/constants.js';
import { sleep } from '../utils/helpers.js';
import { logAction, logSummary } from './audit-logger.js';
import { enforcePositions } from './position-enforcer.js';

interface SetupResult {
  rolesCreated: number;
  rolesSkipped: number;
  categoriesCreated: number;
  categoriesSkipped: number;
  channelsCreated: number;
  channelsSkipped: number;
  errors: string[];
}

/**
 * Resolve a role name to a Role object, handling @everyone specially.
 */
function resolveRole(guild: Guild, roleName: string): Role | undefined {
  if (roleName === '@everyone') {
    return guild.roles.everyone;
  }
  return guild.roles.cache.find((r) => r.name === roleName);
}

/**
 * Build Discord permission overwrites from our config format.
 */
function buildOverwrites(
  guild: Guild,
  overwrites: PermissionOverwrite[],
): OverwriteResolvable[] {
  const result: OverwriteResolvable[] = [];

  for (const ow of overwrites) {
    const role = resolveRole(guild, ow.role);
    if (!role) {
      console.warn(`[SETUP] Role "${ow.role}" not found, skipping overwrite`);
      continue;
    }
    result.push({
      id: role.id,
      allow: ow.allow,
      deny: ow.deny,
    });
  }

  return result;
}

export interface SetupOptions {
  /** Delete all channels and categories not defined in the architecture config */
  clean?: boolean;
}

/**
 * Run the full server setup. Idempotent — safe to run repeatedly.
 */
export async function executeFullSetup(
  guild: Guild,
  invokerId: string,
  options: SetupOptions = {},
): Promise<SetupResult> {
  const result: SetupResult = {
    rolesCreated: 0,
    rolesSkipped: 0,
    categoriesCreated: 0,
    categoriesSkipped: 0,
    channelsCreated: 0,
    channelsSkipped: 0,
    errors: [],
  };

  const invoker = await guild.members.fetch(invokerId).catch(() => null);
  const invokerName = invoker?.displayName ?? invokerId;

  await logAction(
    guild,
    'SETUP',
    `Full setup initiated by ${invokerName}${options.clean ? ' (with --clean)' : ''}`,
  );

  // ── Step 0: Clean — delete everything not in the architecture ──
  //
  // When --clean is set, remove all channels and categories from the server
  // that are NOT defined in server-architecture.ts. This includes Discord's
  // default categories ("Text channels", "Voice channels") and any leftovers
  // from removed agents, experiments, etc.
  //
  // Order: extra channels first (within known AND unknown categories),
  // then extra categories (which may now be empty).

  if (options.clean) {
    console.log(
      '[SETUP] Step 0: Cleaning channels/categories not in architecture...',
    );

    // Build lookup sets from the config
    const configCategoryNames = new Set(categoryConfigs.map((c) => c.name));
    const configChannelsByCategory = new Map<string, Set<string>>();
    for (const cat of categoryConfigs) {
      configChannelsByCategory.set(
        cat.name,
        new Set(cat.channels.map((ch) => ch.name)),
      );
    }

    // Pass 1: Delete extra channels inside config-defined categories
    for (const catConfig of categoryConfigs) {
      const category = guild.channels.cache.find(
        (ch) =>
          ch.name === catConfig.name && ch.type === ChannelType.GuildCategory,
      );
      if (!category) continue;

      const expectedChannels = configChannelsByCategory.get(catConfig.name)!;
      const children = guild.channels.cache.filter(
        (ch) => ch.parentId === category.id,
      );

      for (const [, child] of children) {
        if (!expectedChannels.has(child.name)) {
          try {
            const label =
              child.type === ChannelType.GuildVoice
                ? `(voice) ${child.name}`
                : `#${child.name}`;
            await child.delete(
              `Setup bot: clean — channel not in architecture (${catConfig.name})`,
            );
            await logAction(
              guild,
              'CLEAN',
              `Deleted ${label} from ${catConfig.name}`,
            );
            console.log(
              `[SETUP] Deleted extra channel ${label} from ${catConfig.name}`,
            );
            await sleep(300);
          } catch (err) {
            result.errors.push(`Failed to delete #${child.name}: ${err}`);
          }
        }
      }
    }

    // Pass 2: Delete entire categories (and their children) that aren't in the config
    const serverCategories = guild.channels.cache.filter(
      (ch) => ch.type === ChannelType.GuildCategory,
    );

    for (const [, category] of serverCategories) {
      if (configCategoryNames.has(category.name)) continue;

      // Delete children first
      const children = guild.channels.cache.filter(
        (ch) => ch.parentId === category.id,
      );
      for (const [, child] of children) {
        try {
          await child.delete('Setup bot: clean — category not in architecture');
          console.log(
            `[SETUP] Deleted #${child.name} (child of extra category "${category.name}")`,
          );
          await sleep(300);
        } catch (err) {
          result.errors.push(`Failed to delete #${child.name}: ${err}`);
        }
      }

      // Delete the category
      try {
        await category.delete(
          'Setup bot: clean — category not in architecture',
        );
        await logAction(
          guild,
          'CLEAN',
          `Deleted extra category "${category.name}" and its channels`,
        );
        console.log(`[SETUP] Deleted extra category "${category.name}"`);
        await sleep(300);
      } catch (err) {
        result.errors.push(
          `Failed to delete category "${category.name}": ${err}`,
        );
      }
    }

    // Pass 3: Delete orphan channels (no parent category)
    await guild.channels.fetch();
    const orphanChannels = guild.channels.cache.filter(
      (ch) => ch.parentId === null && ch.type !== ChannelType.GuildCategory,
    );

    for (const [, channel] of orphanChannels) {
      try {
        const label =
          channel.type === ChannelType.GuildVoice
            ? `(voice) ${channel.name}`
            : `#${channel.name}`;
        await channel.delete(
          'Setup bot: clean — orphan channel not in any category',
        );
        await logAction(guild, 'CLEAN', `Deleted orphan channel ${label}`);
        console.log(`[SETUP] Deleted orphan channel ${label}`);
        await sleep(300);
      } catch (err) {
        result.errors.push(`Failed to delete orphan #${channel.name}: ${err}`);
      }
    }

    // Refresh cache after deletions
    await guild.channels.fetch();
  }

  // ── Step 1: Create roles ──────────────────────────────────────

  console.log('[SETUP] Step 1: Creating roles...');

  for (const roleConfig of roleConfigs) {
    try {
      // For managed roles (bot accounts like Corven, Setup Bot),
      // Discord auto-creates the role when the bot joins. We only find
      // and update it — never create it. If the bot hasn't joined yet,
      // the role won't exist and that's fine.
      const existing = guild.roles.cache.find(
        (r) => r.name === roleConfig.name,
      );

      if (roleConfig.managed) {
        if (existing) {
          // Update managed role properties (color, hoist, etc.)
          await existing.edit({
            colors: { primaryColor: roleConfig.color },
            hoist: roleConfig.hoist,
            reason: 'Setup bot: updating managed bot role to match spec',
          });
          console.log(`[SETUP] Role "${roleConfig.name}" (managed) updated`);
          result.rolesSkipped++;
          await logAction(
            guild,
            'ROLE',
            `Updated managed role @${roleConfig.name}`,
          );
        } else {
          console.log(
            `[SETUP] Role "${roleConfig.name}" (managed) not in server yet — bot hasn't joined`,
          );
          result.rolesSkipped++;
        }
        continue;
      }

      if (existing) {
        console.log(
          `[SETUP] Role "${roleConfig.name}" already exists, skipping`,
        );
        result.rolesSkipped++;
        continue;
      }

      const permBitfield =
        roleConfig.permissions.length > 0
          ? roleConfig.permissions.reduce((acc, p) => acc | p, 0n)
          : 0n;

      await guild.roles.create({
        name: roleConfig.name,
        colors: { primaryColor: roleConfig.color },
        hoist: roleConfig.hoist,
        mentionable: roleConfig.mentionable,
        permissions: new PermissionsBitField(permBitfield),
        reason: `Setup bot: initial server setup`,
      });

      result.rolesCreated++;
      await logAction(
        guild,
        'ROLE',
        `Created @${roleConfig.name} (${roleConfig.hoist ? 'hoisted' : 'not hoisted'})`,
      );
      await sleep(300); // Rate limit breathing room
    } catch (err) {
      const msg = `Failed to create role "${roleConfig.name}": ${err}`;
      console.error(`[SETUP] ${msg}`);
      result.errors.push(msg);
    }
  }

  // ── Step 1b: Position roles in hierarchy ──────────────────────

  console.log('[SETUP] Step 1b: Positioning roles in hierarchy...');

  // Sort role configs by position descending so highest goes first
  const sortedConfigs = [...roleConfigs].sort(
    (a, b) => b.position - a.position,
  );

  for (const roleConfig of sortedConfigs) {
    try {
      const role = guild.roles.cache.find((r) => r.name === roleConfig.name);
      if (!role) continue;

      // The bot can only position roles below its own highest role
      const botMember = await guild.members.fetchMe();
      const botHighestPosition = botMember.roles.highest.position;

      // Target position: we want higher config.position = higher Discord position
      // But we can't go above the bot's own role
      const targetPosition = Math.min(
        roleConfig.position,
        botHighestPosition - 1,
      );

      if (role.position !== targetPosition && targetPosition > 0) {
        await role.setPosition(targetPosition).catch((err) => {
          // Position conflicts are common and usually harmless
          console.warn(
            `[SETUP] Could not set position for "${roleConfig.name}": ${err.message}`,
          );
        });
        await sleep(300);
      }
    } catch (err) {
      console.warn(
        `[SETUP] Error positioning role "${roleConfig.name}": ${err}`,
      );
    }
  }

  // ── Step 2: Lock @everyone ────────────────────────────────────

  console.log('[SETUP] Step 2: Locking @everyone...');

  try {
    const everyoneRole = guild.roles.everyone;
    const currentPerms = everyoneRole.permissions;
    const denyBit = everyonePermissions.deny.reduce((acc, p) => acc | p, 0n);

    // Remove ViewChannel from @everyone
    if (currentPerms.has(PermissionsBitField.Flags.ViewChannel)) {
      await everyoneRole.setPermissions(
        currentPerms.remove(PermissionsBitField.Flags.ViewChannel),
        'Setup bot: lock @everyone — deny ViewChannel server-wide',
      );
      await logAction(
        guild,
        'PERM',
        '@everyone ViewChannel denied (server-level)',
      );
    } else {
      console.log('[SETUP] @everyone ViewChannel already denied');
    }
  } catch (err) {
    const msg = `Failed to lock @everyone: ${err}`;
    console.error(`[SETUP] ${msg}`);
    result.errors.push(msg);
  }

  // ── Step 3: Create categories ─────────────────────────────────

  console.log('[SETUP] Step 3: Creating categories...');

  for (const catConfig of categoryConfigs) {
    try {
      const existing = guild.channels.cache.find(
        (ch) =>
          ch.name === catConfig.name && ch.type === ChannelType.GuildCategory,
      );

      if (existing) {
        console.log(
          `[SETUP] Category "${catConfig.name}" already exists, skipping`,
        );
        result.categoriesSkipped++;
        // Still update permission overwrites on existing categories
        await updateCategoryPermissions(
          guild,
          existing as CategoryChannel,
          catConfig,
        );
        continue;
      }

      const overwrites = buildOverwrites(guild, catConfig.overwrites);

      const category = await guild.channels.create({
        name: catConfig.name,
        type: ChannelType.GuildCategory,
        position: catConfig.position,
        permissionOverwrites: overwrites,
        reason: 'Setup bot: initial server setup',
      });

      result.categoriesCreated++;
      await logAction(guild, 'CATEGORY', `Created ${catConfig.name}`);
      await sleep(300);
    } catch (err) {
      const msg = `Failed to create category "${catConfig.name}": ${err}`;
      console.error(`[SETUP] ${msg}`);
      result.errors.push(msg);
    }
  }

  // ── Step 4: Create channels ───────────────────────────────────

  console.log('[SETUP] Step 4: Creating channels...');

  for (const catConfig of categoryConfigs) {
    const parentCategory = guild.channels.cache.find(
      (ch) =>
        ch.name === catConfig.name && ch.type === ChannelType.GuildCategory,
    ) as CategoryChannel | undefined;

    if (!parentCategory && catConfig.channels.length > 0) {
      result.errors.push(
        `Category "${catConfig.name}" not found, can't create its channels`,
      );
      continue;
    }

    for (const channelConfig of catConfig.channels) {
      try {
        const existing = guild.channels.cache.find(
          (ch) =>
            ch.name === channelConfig.name &&
            ch.type === channelConfig.type &&
            ch.parentId === parentCategory?.id,
        );

        if (existing) {
          console.log(
            `[SETUP] Channel "#${channelConfig.name}" already exists in "${catConfig.name}", skipping`,
          );
          result.channelsSkipped++;

          // Update auto-archive if needed
          if (
            channelConfig.autoArchive &&
            existing.type === ChannelType.GuildText
          ) {
            const textChannel = existing as TextChannel;
            if (
              textChannel.defaultAutoArchiveDuration !== AUTO_ARCHIVE_DURATION
            ) {
              await textChannel.edit({
                defaultAutoArchiveDuration: AUTO_ARCHIVE_DURATION,
              });
              console.log(
                `[SETUP] Updated auto-archive on #${channelConfig.name}`,
              );
            }
          }
          continue;
        }

        // Build channel-specific overwrites
        // Start with category overwrites, then add channel-level ones
        const channelOverwrites = buildOverwrites(
          guild,
          channelConfig.overwrites,
        );

        const isText = channelConfig.type === ChannelType.GuildText;

        const channel = await guild.channels.create({
          name: channelConfig.name,
          type: channelConfig.type,
          topic:
            isText && channelConfig.topic ? channelConfig.topic : undefined,
          parent: parentCategory?.id,
          permissionOverwrites:
            channelConfig.overwrites.length > 0 ? channelOverwrites : undefined,
          defaultAutoArchiveDuration:
            isText && channelConfig.autoArchive
              ? AUTO_ARCHIVE_DURATION
              : undefined,
          reason: 'Setup bot: initial server setup',
        });

        result.channelsCreated++;
        await logAction(
          guild,
          'CHANNEL',
          `Created #${channelConfig.name} in ${catConfig.name}`,
        );
        await sleep(300);
      } catch (err) {
        const msg = `Failed to create channel "#${channelConfig.name}": ${err}`;
        console.error(`[SETUP] ${msg}`);
        result.errors.push(msg);
      }
    }
  }

  // ── Step 4b: Enforce channel ordering ──────────────────────────

  console.log('[SETUP] Step 4b: Enforcing channel positions...');

  try {
    const posResult = await enforcePositions(guild);
    if (posResult.categoriesMoved > 0 || posResult.channelsMoved > 0) {
      console.log(
        `[SETUP] Positions enforced: ${posResult.categoriesMoved} categories, ${posResult.channelsMoved} channels moved`,
      );
    }
    if (posResult.errors.length > 0) {
      result.errors.push(...posResult.errors);
    }
  } catch (err) {
    result.errors.push(`Failed to enforce positions: ${err}`);
  }

  // ── Step 5: Assign @Owner to invoker ──────────────────────────

  console.log('[SETUP] Step 5: Assigning @Owner role...');

  try {
    const ownerRole = guild.roles.cache.find((r) => r.name === 'Owner');
    if (ownerRole && invoker && !invoker.roles.cache.has(ownerRole.id)) {
      await invoker.roles.add(ownerRole, 'Setup bot: assigning Owner role');
      await logAction(guild, 'ROLE', `Assigned @Owner to ${invokerName}`);
    } else if (ownerRole && invoker?.roles.cache.has(ownerRole.id)) {
      console.log(`[SETUP] ${invokerName} already has @Owner role`);
    }
  } catch (err) {
    const msg = `Failed to assign @Owner: ${err}`;
    console.error(`[SETUP] ${msg}`);
    result.errors.push(msg);
  }

  // ── Step 6: Post summary ──────────────────────────────────────

  // Refresh channel cache to find newly created #audit-log
  await guild.channels.fetch();

  await logSummary(guild, 'Full Setup Complete', [
    {
      name: 'Roles',
      value: `${result.rolesCreated} created, ${result.rolesSkipped} already existed`,
      inline: true,
    },
    {
      name: 'Categories',
      value: `${result.categoriesCreated} created, ${result.categoriesSkipped} already existed`,
      inline: true,
    },
    {
      name: 'Channels',
      value: `${result.channelsCreated} created, ${result.channelsSkipped} already existed`,
      inline: true,
    },
    {
      name: 'Errors',
      value: result.errors.length > 0 ? result.errors.join('\n') : 'None',
      inline: false,
    },
  ]);

  // ── Step 7: Demote bot ────────────────────────────────────────

  console.log('[SETUP] Step 7: Demoting bot...');
  try {
    const setupBotRole = guild.roles.cache.find((r) => r.name === 'Setup Bot');
    if (setupBotRole) {
      const demotedBitfield = setupBotDemotedPermissions.reduce(
        (acc, p) => acc | p,
        0n,
      );
      await setupBotRole.setPermissions(
        new PermissionsBitField(demotedBitfield),
        'Setup bot: self-demotion after setup',
      );
      await logAction(
        guild,
        'PERM',
        'Bot demoted from Administrator to minimal permissions',
      );
    }
  } catch (err) {
    const msg = `Failed to demote bot: ${err}`;
    console.error(`[SETUP] ${msg}`);
    result.errors.push(msg);
  }

  console.log('[SETUP] Full setup complete.');
  return result;
}

/**
 * Update permission overwrites on an existing category.
 */
async function updateCategoryPermissions(
  guild: Guild,
  category: CategoryChannel,
  config: CategoryConfig,
): Promise<void> {
  for (const ow of config.overwrites) {
    const role = resolveRole(guild, ow.role);
    if (!role) continue;

    try {
      const allowObj: Record<string, boolean> = {};
      const denyObj: Record<string, boolean> = {};

      for (const p of ow.allow) {
        const flagName = getPermissionName(p);
        if (flagName) allowObj[flagName] = true;
      }
      for (const p of ow.deny) {
        const flagName = getPermissionName(p);
        if (flagName) denyObj[flagName] = false;
      }

      await category.permissionOverwrites.edit(role, {
        ...allowObj,
        ...denyObj,
      });
    } catch (err) {
      console.warn(
        `[SETUP] Could not update overwrite for "${ow.role}" on "${config.name}": ${err}`,
      );
    }
  }
}

/**
 * Get the string name of a permission flag bit for use with permissionOverwrites.edit().
 */
function getPermissionName(bit: bigint): string | null {
  const entries = Object.entries(PermissionsBitField.Flags) as [
    string,
    bigint,
  ][];
  for (const [name, value] of entries) {
    if (value === bit) return name;
  }
  return null;
}
