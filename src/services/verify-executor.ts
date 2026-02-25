/**
 * Verify Executor — Drift detection (read-only)
 *
 * Compares current server state against the architecture config.
 * Reports: matching, missing, extra, misconfigured.
 */

import { Guild, ChannelType, type GuildBasedChannel } from 'discord.js';
import {
  roles as roleConfigs,
  categories as categoryConfigs,
} from '../config/server-architecture.js';

export interface VerifyResult {
  matching: string[];
  missing: string[];
  extra: string[];
  misconfigured: string[];
}

export async function executeVerify(guild: Guild): Promise<VerifyResult> {
  const result: VerifyResult = {
    matching: [],
    missing: [],
    extra: [],
    misconfigured: [],
  };

  // Ensure we have fresh data
  await guild.roles.fetch();
  await guild.channels.fetch();

  // ── Verify roles ──────────────────────────────────────────────

  const specRoleNames = new Set(roleConfigs.map((r) => r.name));
  const serverRoleNames = new Set(
    guild.roles.cache
      .filter((r) => r.name !== '@everyone' && !r.managed) // Skip @everyone and bot-managed roles
      .map((r) => r.name),
  );

  for (const roleConfig of roleConfigs) {
    const serverRole = guild.roles.cache.find((r) => r.name === roleConfig.name);
    if (!serverRole) {
      if (roleConfig.managed) {
        // Managed roles only exist once their bot account joins.
        // Not an error — just pending.
        result.matching.push(`Role: @${roleConfig.name} (managed — bot not in server yet)`);
      } else {
        result.missing.push(`Role: @${roleConfig.name}`);
      }
      continue;
    }

    // Check color
    if (serverRole.color !== roleConfig.color) {
      result.misconfigured.push(
        `Role @${roleConfig.name}: color is #${serverRole.color.toString(16).padStart(6, '0')}, expected #${roleConfig.color.toString(16).padStart(6, '0')}`,
      );
    }

    // Check hoist
    if (serverRole.hoist !== roleConfig.hoist) {
      result.misconfigured.push(
        `Role @${roleConfig.name}: hoist is ${serverRole.hoist}, expected ${roleConfig.hoist}`,
      );
    }

    // If no misconfig detected, it's matching
    const hasMisconfig = result.misconfigured.some((m) => m.includes(`@${roleConfig.name}`));
    if (!hasMisconfig) {
      result.matching.push(`Role: @${roleConfig.name}${roleConfig.managed ? ' (managed)' : ''}`);
    }
  }

  // Check for extra roles (not in spec, not @everyone, not managed)
  for (const [, role] of guild.roles.cache) {
    if (role.name === '@everyone' || role.managed) continue;
    if (!specRoleNames.has(role.name)) {
      result.extra.push(`Role: @${role.name}`);
    }
  }

  // ── Verify categories ─────────────────────────────────────────

  const specCategoryNames = new Set(categoryConfigs.map((c) => c.name));

  for (const catConfig of categoryConfigs) {
    const serverCategory = guild.channels.cache.find(
      (ch) => ch.name === catConfig.name && ch.type === ChannelType.GuildCategory,
    );

    if (!serverCategory) {
      result.missing.push(`Category: ${catConfig.name}`);
      continue;
    }

    // Check category position
    if ('position' in serverCategory && serverCategory.position !== catConfig.position) {
      result.misconfigured.push(
        `Category ${catConfig.name}: position is ${serverCategory.position}, expected ${catConfig.position}`,
      );
    } else {
      result.matching.push(`Category: ${catConfig.name}`);
    }

    // Check for extra channels within this category (not in config)
    const expectedChannelNames = new Set(catConfig.channels.map((c) => c.name));
    const childChannels = guild.channels.cache.filter(
      (ch) => ch.parentId === serverCategory.id,
    );
    for (const [, ch] of childChannels) {
      if (!expectedChannelNames.has(ch.name)) {
        const prefix = ch.type === ChannelType.GuildVoice ? '(voice) ' : '#';
        result.extra.push(`Channel: ${prefix}${ch.name} (${catConfig.name})`);
      }
    }

    // Verify channels within this category
    for (let i = 0; i < catConfig.channels.length; i++) {
      const channelConfig = catConfig.channels[i];
      const serverChannel = guild.channels.cache.find(
        (ch) =>
          ch.name === channelConfig.name &&
          ch.parentId === serverCategory.id,
      );

      if (!serverChannel) {
        const prefix = channelConfig.type === ChannelType.GuildVoice ? '(voice) ' : '#';
        result.missing.push(`Channel: ${prefix}${channelConfig.name} (${catConfig.name})`);
        continue;
      }

      const issues: string[] = [];

      // Check type mismatch
      if (serverChannel.type !== channelConfig.type) {
        issues.push(`type is ${serverChannel.type}, expected ${channelConfig.type}`);
      }

      // Check topic (text channels only)
      if (
        serverChannel.type === ChannelType.GuildText &&
        channelConfig.type === ChannelType.GuildText &&
        'topic' in serverChannel &&
        serverChannel.topic !== channelConfig.topic
      ) {
        issues.push('topic mismatch');
      }

      // Check channel position within category
      if ('position' in serverChannel && serverChannel.position !== i) {
        issues.push(`position is ${(serverChannel as any).position}, expected ${i}`);
      }

      const label = channelConfig.type === ChannelType.GuildVoice
        ? `(voice) ${channelConfig.name}`
        : `#${channelConfig.name}`;

      if (issues.length > 0) {
        result.misconfigured.push(
          `Channel ${label}: ${issues.join(', ')}`,
        );
      } else {
        result.matching.push(`Channel: ${label}`);
      }
    }
  }

  // Check for extra categories
  const serverCategories = guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildCategory,
  );
  for (const [, cat] of serverCategories) {
    if (!specCategoryNames.has(cat.name)) {
      result.extra.push(`Category: ${cat.name}`);
    }
  }

  return result;
}
