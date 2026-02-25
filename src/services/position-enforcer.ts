/**
 * Position Enforcer — Ensures categories and channels are in strict order
 *
 * Discord positions are 0-indexed integers. Lower = higher on screen.
 * Categories are positioned globally, channels are positioned within
 * their parent category.
 *
 * The array order in server-architecture.ts IS the display order.
 * Categories: index in the `categories` array = position
 * Channels: index in the category's `channels` array = position within that category
 */

import {
  type CategoryChannel,
  ChannelType,
  type Guild,
  type NonThreadGuildBasedChannel,
} from 'discord.js';
import { categories as categoryConfigs } from '../config/server-architecture.js';
import { sleep } from '../utils/helpers.js';
import { logAction } from './audit-logger.js';

export interface PositionResult {
  categoriesMoved: number;
  channelsMoved: number;
  errors: string[];
}

/**
 * Enforce strict ordering of categories and channels to match the architecture config.
 * Returns a summary of what was moved.
 */
export async function enforcePositions(guild: Guild): Promise<PositionResult> {
  const result: PositionResult = {
    categoriesMoved: 0,
    channelsMoved: 0,
    errors: [],
  };

  // Refresh cache
  await guild.channels.fetch();

  // ── Category positions ────────────────────────────────────────
  // Build a single batch: [{channel, position}, ...]
  // Discord handles batch position updates more reliably than one-by-one

  const categoryPositions: { channel: string; position: number }[] = [];

  for (let i = 0; i < categoryConfigs.length; i++) {
    const catConfig = categoryConfigs[i];
    const serverCat = guild.channels.cache.find(
      (ch) =>
        ch.name === catConfig.name && ch.type === ChannelType.GuildCategory,
    ) as CategoryChannel | undefined;

    if (!serverCat) continue;

    // 'position' in the config is the intended order
    const targetPosition = catConfig.position;

    if (serverCat.position !== targetPosition) {
      categoryPositions.push({
        channel: serverCat.id,
        position: targetPosition,
      });
    }
  }

  if (categoryPositions.length > 0) {
    try {
      // guild.channels.setPositions() does a batch update — much cleaner
      // than individual setPosition calls which cause cascading reorders
      await guild.channels.setPositions(categoryPositions);
      result.categoriesMoved = categoryPositions.length;

      for (const cp of categoryPositions) {
        const ch = guild.channels.cache.get(cp.channel);
        await logAction(
          guild,
          'POSITION',
          `Category ${ch?.name ?? cp.channel} -> position ${cp.position}`,
        );
      }
    } catch (err) {
      result.errors.push(`Failed to reorder categories: ${err}`);
    }

    await sleep(500);
    // Refresh after category reorder
    await guild.channels.fetch();
  }

  // ── Channel positions within each category ────────────────────

  for (const catConfig of categoryConfigs) {
    if (catConfig.channels.length === 0) continue;

    const parentCategory = guild.channels.cache.find(
      (ch) =>
        ch.name === catConfig.name && ch.type === ChannelType.GuildCategory,
    ) as CategoryChannel | undefined;

    if (!parentCategory) continue;

    const channelPositions: { channel: string; position: number }[] = [];

    for (let i = 0; i < catConfig.channels.length; i++) {
      const channelConfig = catConfig.channels[i];
      const serverChannel = guild.channels.cache.find(
        (ch) =>
          ch.name === channelConfig.name && ch.parentId === parentCategory.id,
      ) as NonThreadGuildBasedChannel | undefined;

      if (!serverChannel || !('position' in serverChannel)) continue;

      // Position within the category — array index IS the order
      if (serverChannel.position !== i) {
        channelPositions.push({ channel: serverChannel.id, position: i });
      }
    }

    if (channelPositions.length > 0) {
      try {
        await guild.channels.setPositions(channelPositions);
        result.channelsMoved += channelPositions.length;

        for (const cp of channelPositions) {
          const ch = guild.channels.cache.get(cp.channel);
          await logAction(
            guild,
            'POSITION',
            `#${ch?.name ?? cp.channel} in ${catConfig.name} -> position ${cp.position}`,
          );
        }
      } catch (err) {
        result.errors.push(
          `Failed to reorder channels in ${catConfig.name}: ${err}`,
        );
      }

      await sleep(300);
    }
  }

  return result;
}
