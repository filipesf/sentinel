/**
 * Update Executor — Reconcile server state to match architecture config
 *
 * Unlike `/setup full` (which skips existing items), `/setup update`:
 * - Creates anything missing
 * - Updates existing roles (color, hoist, mentionable, permissions)
 * - Updates existing channels (topic, auto-archive, permission overwrites)
 * - Updates existing categories (permission overwrites)
 * - Never deletes anything — only adds or patches
 *   (use `/setup full clean:True` to remove extra channels/categories)
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
  categories as categoryConfigs,
  type PermissionOverwrite,
  roles as roleConfigs,
} from '../config/server-architecture.js';
import { AUTO_ARCHIVE_DURATION } from '../utils/constants.js';
import { sleep } from '../utils/helpers.js';
import { logAction, logSummary } from './audit-logger.js';
import { enforcePositions } from './position-enforcer.js';

interface UpdateResult {
  rolesCreated: number;
  rolesUpdated: number;
  rolesUnchanged: number;
  categoriesCreated: number;
  categoriesUpdated: number;
  categoriesUnchanged: number;
  channelsCreated: number;
  channelsUpdated: number;
  channelsUnchanged: number;
  changes: string[];
  errors: string[];
}

/**
 * Resolve a role name to a Role object, handling @everyone specially.
 */
function resolveRole(guild: Guild, roleName: string): Role | undefined {
  if (roleName === '@everyone') return guild.roles.everyone;
  return guild.roles.cache.find((r) => r.name === roleName);
}

function buildOverwrites(
  guild: Guild,
  overwrites: PermissionOverwrite[],
): OverwriteResolvable[] {
  const result: OverwriteResolvable[] = [];
  for (const ow of overwrites) {
    const role = resolveRole(guild, ow.role);
    if (!role) {
      console.warn(`[UPDATE] Role "${ow.role}" not found, skipping overwrite`);
      continue;
    }
    result.push({ id: role.id, allow: ow.allow, deny: ow.deny });
  }
  return result;
}

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

/**
 * Run a full reconciliation — create missing, update drifted, skip matching.
 */
export async function executeUpdate(
  guild: Guild,
  invokerId: string,
): Promise<UpdateResult> {
  const result: UpdateResult = {
    rolesCreated: 0,
    rolesUpdated: 0,
    rolesUnchanged: 0,
    categoriesCreated: 0,
    categoriesUpdated: 0,
    categoriesUnchanged: 0,
    channelsCreated: 0,
    channelsUpdated: 0,
    channelsUnchanged: 0,
    changes: [],
    errors: [],
  };

  const invoker = await guild.members.fetch(invokerId).catch(() => null);
  const invokerName = invoker?.displayName ?? invokerId;

  await logAction(guild, 'UPDATE', `Setup update initiated by ${invokerName}`);

  // ── Step 1: Reconcile roles ───────────────────────────────────

  console.log('[UPDATE] Step 1: Reconciling roles...');

  for (const roleConfig of roleConfigs) {
    try {
      const existing = guild.roles.cache.find(
        (r) => r.name === roleConfig.name,
      );

      if (!existing) {
        if (roleConfig.managed) {
          // Managed roles are created by Discord when the bot joins.
          // If the bot hasn't joined yet, this is expected — not an error.
          console.log(
            `[UPDATE] Role "${roleConfig.name}" (managed) not in server yet — bot hasn't joined`,
          );
          result.rolesUnchanged++;
          continue;
        }

        // Create missing non-managed role
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
          reason: 'Setup bot: update — created missing role',
        });

        result.rolesCreated++;
        const change = `Created role @${roleConfig.name}`;
        result.changes.push(change);
        await logAction(guild, 'ROLE', change);
        await sleep(300);
        continue;
      }

      // Existing role found — check if it needs updating.
      // For managed roles (bot accounts), we can only update color and hoist
      // (Discord controls permissions on managed roles).
      const edits: Record<string, unknown> = {};
      const diffs: string[] = [];

      if (existing.color !== roleConfig.color) {
        edits.colors = { primaryColor: roleConfig.color };
        diffs.push(
          `color #${existing.color.toString(16).padStart(6, '0')} -> #${roleConfig.color.toString(16).padStart(6, '0')}`,
        );
      }

      if (existing.hoist !== roleConfig.hoist) {
        edits.hoist = roleConfig.hoist;
        diffs.push(`hoist ${existing.hoist} -> ${roleConfig.hoist}`);
      }

      // Skip mentionable and permissions checks for managed roles —
      // Discord controls those and will reject edits.
      if (!roleConfig.managed) {
        if (existing.mentionable !== roleConfig.mentionable) {
          edits.mentionable = roleConfig.mentionable;
          diffs.push(
            `mentionable ${existing.mentionable} -> ${roleConfig.mentionable}`,
          );
        }

        const expectedBitfield =
          roleConfig.permissions.length > 0
            ? roleConfig.permissions.reduce((acc, p) => acc | p, 0n)
            : 0n;

        if (existing.permissions.bitfield !== expectedBitfield) {
          edits.permissions = new PermissionsBitField(expectedBitfield);
          diffs.push('permissions changed');
        }
      }

      if (Object.keys(edits).length > 0) {
        await existing.edit({
          ...edits,
          reason: `Setup bot: update — reconciling @${roleConfig.name}${roleConfig.managed ? ' (managed)' : ''}`,
        });

        result.rolesUpdated++;
        const change = `Updated @${roleConfig.name}: ${diffs.join(', ')}`;
        result.changes.push(change);
        await logAction(guild, 'ROLE', change);
        await sleep(300);
      } else {
        result.rolesUnchanged++;
      }
    } catch (err) {
      const msg = `Failed to reconcile role "${roleConfig.name}": ${err}`;
      console.error(`[UPDATE] ${msg}`);
      result.errors.push(msg);
    }
  }

  // ── Step 1b: Position roles ───────────────────────────────────

  console.log('[UPDATE] Step 1b: Positioning roles...');

  const sortedConfigs = [...roleConfigs].sort(
    (a, b) => b.position - a.position,
  );
  for (const roleConfig of sortedConfigs) {
    try {
      const role = guild.roles.cache.find((r) => r.name === roleConfig.name);
      if (!role) continue;

      const botMember = await guild.members.fetchMe();
      const botHighestPosition = botMember.roles.highest.position;
      const targetPosition = Math.min(
        roleConfig.position,
        botHighestPosition - 1,
      );

      if (role.position !== targetPosition && targetPosition > 0) {
        await role.setPosition(targetPosition).catch((err) => {
          console.warn(
            `[UPDATE] Could not set position for "${roleConfig.name}": ${err.message}`,
          );
        });
        await sleep(300);
      }
    } catch (err) {
      console.warn(
        `[UPDATE] Error positioning role "${roleConfig.name}": ${err}`,
      );
    }
  }

  // ── Step 2: Lock @everyone ────────────────────────────────────

  console.log('[UPDATE] Step 2: Ensuring @everyone is locked...');

  try {
    const everyoneRole = guild.roles.everyone;
    if (everyoneRole.permissions.has(PermissionsBitField.Flags.ViewChannel)) {
      await everyoneRole.setPermissions(
        everyoneRole.permissions.remove(PermissionsBitField.Flags.ViewChannel),
        'Setup bot: update — lock @everyone',
      );
      result.changes.push('@everyone ViewChannel denied');
      await logAction(
        guild,
        'PERM',
        '@everyone ViewChannel denied (server-level)',
      );
    }
  } catch (err) {
    result.errors.push(`Failed to lock @everyone: ${err}`);
  }

  // ── Step 3: Reconcile categories ──────────────────────────────

  console.log('[UPDATE] Step 3: Reconciling categories...');

  for (const catConfig of categoryConfigs) {
    try {
      const existing = guild.channels.cache.find(
        (ch) =>
          ch.name === catConfig.name && ch.type === ChannelType.GuildCategory,
      ) as CategoryChannel | undefined;

      if (!existing) {
        const overwrites = buildOverwrites(guild, catConfig.overwrites);
        await guild.channels.create({
          name: catConfig.name,
          type: ChannelType.GuildCategory,
          position: catConfig.position,
          permissionOverwrites: overwrites,
          reason: 'Setup bot: update — created missing category',
        });

        result.categoriesCreated++;
        const change = `Created category ${catConfig.name}`;
        result.changes.push(change);
        await logAction(guild, 'CATEGORY', change);
        await sleep(300);
        continue;
      }

      // Update permission overwrites on existing category
      const updated = await reconcileOverwrites(
        guild,
        existing,
        catConfig.overwrites,
      );
      if (updated) {
        result.categoriesUpdated++;
        const change = `Updated permissions on ${catConfig.name}`;
        result.changes.push(change);
        await logAction(guild, 'CATEGORY', change);
      } else {
        result.categoriesUnchanged++;
      }
    } catch (err) {
      result.errors.push(
        `Failed to reconcile category "${catConfig.name}": ${err}`,
      );
    }
  }

  // ── Step 4: Reconcile channels ────────────────────────────────

  console.log('[UPDATE] Step 4: Reconciling channels...');

  // Refresh cache after category creation
  await guild.channels.fetch();

  for (const catConfig of categoryConfigs) {
    const parentCategory = guild.channels.cache.find(
      (ch) =>
        ch.name === catConfig.name && ch.type === ChannelType.GuildCategory,
    ) as CategoryChannel | undefined;

    if (!parentCategory && catConfig.channels.length > 0) {
      result.errors.push(
        `Category "${catConfig.name}" not found, can't reconcile its channels`,
      );
      continue;
    }

    for (const channelConfig of catConfig.channels) {
      try {
        const existing = guild.channels.cache.find(
          (ch) =>
            ch.name === channelConfig.name &&
            ch.parentId === parentCategory?.id,
        );

        if (!existing) {
          // Create missing channel
          const channelOverwrites = buildOverwrites(
            guild,
            channelConfig.overwrites,
          );
          const isText = channelConfig.type === ChannelType.GuildText;

          await guild.channels.create({
            name: channelConfig.name,
            type: channelConfig.type,
            topic:
              isText && channelConfig.topic ? channelConfig.topic : undefined,
            parent: parentCategory?.id,
            permissionOverwrites:
              channelConfig.overwrites.length > 0
                ? channelOverwrites
                : undefined,
            defaultAutoArchiveDuration:
              isText && channelConfig.autoArchive
                ? AUTO_ARCHIVE_DURATION
                : undefined,
            reason: 'Setup bot: update — created missing channel',
          });

          result.channelsCreated++;
          const change = `Created ${channelConfig.type === ChannelType.GuildVoice ? '(voice)' : '#'}${channelConfig.name} in ${catConfig.name}`;
          result.changes.push(change);
          await logAction(guild, 'CHANNEL', change);
          await sleep(300);
          continue;
        }

        // Update existing channel — only text channels have topic/autoArchive
        if (existing.type === ChannelType.GuildText) {
          const textChannel = existing as TextChannel;
          const edits: Record<string, unknown> = {};
          const diffs: string[] = [];

          if (textChannel.topic !== channelConfig.topic) {
            edits.topic = channelConfig.topic;
            diffs.push('topic');
          }

          if (
            channelConfig.autoArchive &&
            textChannel.defaultAutoArchiveDuration !== AUTO_ARCHIVE_DURATION
          ) {
            edits.defaultAutoArchiveDuration = AUTO_ARCHIVE_DURATION;
            diffs.push('auto-archive');
          }

          if (Object.keys(edits).length > 0) {
            await textChannel.edit({
              ...edits,
              reason: `Setup bot: update — reconciling #${channelConfig.name}`,
            } as Parameters<TextChannel['edit']>[0]);

            result.channelsUpdated++;
            const change = `Updated #${channelConfig.name}: ${diffs.join(', ')}`;
            result.changes.push(change);
            await logAction(guild, 'CHANNEL', change);
            await sleep(300);
          }
        }

        // Reconcile channel-level permission overwrites (both text and voice)
        if (
          channelConfig.overwrites.length > 0 &&
          'permissionOverwrites' in existing
        ) {
          const permUpdated = await reconcileOverwrites(
            guild,
            existing as CategoryChannel | TextChannel,
            channelConfig.overwrites,
          );
          if (permUpdated) {
            result.channelsUpdated++;
            const change = `Updated permissions on ${channelConfig.name}`;
            result.changes.push(change);
            await logAction(guild, 'CHANNEL', change);
          }
        }

        // Count unchanged if no edits were made for this channel
        // (only if we didn't already count it as updated above)
        if (!result.changes.some((c) => c.includes(channelConfig.name))) {
          result.channelsUnchanged++;
        }
      } catch (err) {
        result.errors.push(
          `Failed to reconcile channel "#${channelConfig.name}": ${err}`,
        );
      }
    }
  }

  // ── Step 4b: Enforce channel ordering ──────────────────────────

  console.log('[UPDATE] Step 4b: Enforcing channel positions...');

  try {
    const posResult = await enforcePositions(guild);
    if (posResult.categoriesMoved > 0 || posResult.channelsMoved > 0) {
      if (posResult.categoriesMoved > 0) {
        result.changes.push(
          `Reordered ${posResult.categoriesMoved} categor${posResult.categoriesMoved === 1 ? 'y' : 'ies'}`,
        );
      }
      if (posResult.channelsMoved > 0) {
        result.changes.push(
          `Reordered ${posResult.channelsMoved} channel${posResult.channelsMoved === 1 ? '' : 's'}`,
        );
      }
    }
    if (posResult.errors.length > 0) {
      result.errors.push(...posResult.errors);
    }
  } catch (err) {
    result.errors.push(`Failed to enforce positions: ${err}`);
  }

  // ── Step 5: Post summary ──────────────────────────────────────

  await guild.channels.fetch();

  const totalChanges =
    result.rolesCreated +
    result.rolesUpdated +
    result.categoriesCreated +
    result.categoriesUpdated +
    result.channelsCreated +
    result.channelsUpdated;

  await logSummary(
    guild,
    totalChanges > 0
      ? 'Setup Update Complete'
      : 'Setup Update — No Changes Needed',
    [
      {
        name: 'Roles',
        value: `${result.rolesCreated} created, ${result.rolesUpdated} updated, ${result.rolesUnchanged} unchanged`,
        inline: false,
      },
      {
        name: 'Categories',
        value: `${result.categoriesCreated} created, ${result.categoriesUpdated} updated, ${result.categoriesUnchanged} unchanged`,
        inline: false,
      },
      {
        name: 'Channels',
        value: `${result.channelsCreated} created, ${result.channelsUpdated} updated, ${result.channelsUnchanged} unchanged`,
        inline: false,
      },
      ...(result.changes.length > 0
        ? [
            {
              name: 'Changes',
              value: result.changes.slice(0, 15).join('\n').slice(0, 1024),
              inline: false,
            },
          ]
        : []),
      ...(result.errors.length > 0
        ? [
            {
              name: 'Errors',
              value: result.errors.join('\n').slice(0, 1024),
              inline: false,
            },
          ]
        : []),
    ],
  );

  console.log(
    `[UPDATE] Complete. ${totalChanges} change(s), ${result.errors.length} error(s).`,
  );
  return result;
}

/**
 * Reconcile permission overwrites on a category or channel.
 * Returns true if any overwrites were changed.
 */
async function reconcileOverwrites(
  guild: Guild,
  target: CategoryChannel | TextChannel,
  configOverwrites: PermissionOverwrite[],
): Promise<boolean> {
  let changed = false;

  for (const ow of configOverwrites) {
    const role = resolveRole(guild, ow.role);
    if (!role) continue;

    const existing = target.permissionOverwrites.cache.get(role.id);

    const expectedAllow = ow.allow.reduce((acc, p) => acc | p, 0n);
    const expectedDeny = ow.deny.reduce((acc, p) => acc | p, 0n);

    // Check if overwrite exists and matches
    if (existing) {
      const currentAllow = existing.allow.bitfield;
      const currentDeny = existing.deny.bitfield;

      // Check if the expected bits are all present (don't clobber extra bits from other sources)
      const allowMatch = (currentAllow & expectedAllow) === expectedAllow;
      const denyMatch = (currentDeny & expectedDeny) === expectedDeny;

      if (allowMatch && denyMatch) continue;
    }

    // Apply the overwrite
    const permObj: Record<string, boolean> = {};
    for (const p of ow.allow) {
      const name = getPermissionName(p);
      if (name) permObj[name] = true;
    }
    for (const p of ow.deny) {
      const name = getPermissionName(p);
      if (name) permObj[name] = false;
    }

    try {
      await target.permissionOverwrites.edit(role, permObj, {
        reason: 'Setup bot: update — reconciling permissions',
      });
      changed = true;
      await sleep(200);
    } catch (err) {
      console.warn(
        `[UPDATE] Could not update overwrite for "${ow.role}" on "${target.name}": ${err}`,
      );
    }
  }

  return changed;
}
