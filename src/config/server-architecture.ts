/**
 * Flare — Server Architecture as Code
 *
 * This file is the single source of truth the bot reads from.
 * It must stay in sync with SERVER_ARCHITECTURE.md manually.
 *
 * If you want to change the architecture, change this file
 * and re-run `/setup full`.
 */

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { AUTO_ARCHIVE_DURATION, COLORS } from '../utils/constants.js';

// ─── Types ──────────────────────────────────────────────────────

export interface RoleConfig {
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: bigint[];
  /** Position in hierarchy — higher number = higher in list */
  position: number;
  /**
   * If true, this role is auto-created by Discord for a bot account.
   * The setup bot will NOT create it — only find and update it
   * (color, hoist, etc.) once the bot account has joined the server.
   * If the bot hasn't joined yet, the role simply won't exist and
   * that's fine — it's not "missing", it's "pending".
   */
  managed?: boolean;
}

export interface PermissionOverwrite {
  /** Role name (resolved at runtime to role ID) */
  role: string;
  allow: bigint[];
  deny: bigint[];
}

export interface ChannelConfig {
  name: string;
  type: ChannelType.GuildText | ChannelType.GuildVoice;
  /** Topic/description (text channels only — ignored for voice) */
  topic: string;
  /** Category name this channel belongs to */
  category: string;
  /** Channel-level permission overwrites (on top of category-level) */
  overwrites: PermissionOverwrite[];
  /** Whether this channel should have 24h auto-archive for threads (text only) */
  autoArchive: boolean;
}

export interface CategoryConfig {
  name: string;
  /** Position in category list (0 = top) */
  position: number;
  /** Category-level permission overwrites */
  overwrites: PermissionOverwrite[];
  /** Channels in this category */
  channels: ChannelConfig[];
}

// ─── Roles ──────────────────────────────────────────────────────

export const roles: RoleConfig[] = [
  {
    name: 'Owner',
    color: COLORS.OWNER,
    hoist: true,
    mentionable: false,
    permissions: [PermissionFlagsBits.Administrator],
    position: 8,
  },
  {
    name: 'Setup Bot',
    color: COLORS.SETUP_BOT,
    hoist: false,
    mentionable: false,
    permissions: [PermissionFlagsBits.Administrator], // Demoted after setup
    position: 7,
    managed: true, // Discord creates this when the setup bot joins
  },
  {
    name: 'Admin',
    color: COLORS.ADMIN,
    hoist: true,
    mentionable: true,
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.ReadMessageHistory,
    ],
    position: 6,
  },
  // Note: Corven's role is managed by Discord (auto-created when the bot
  // joins). It is NOT listed here — Sentinel doesn't create or edit it.
  // It's referenced by name in channel/category overwrites, and
  // resolveRole() finds it at runtime.
  {
    name: 'Agent',
    color: COLORS.AGENT,
    hoist: true,
    mentionable: false,
    permissions: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.ManageEvents,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.UseExternalEmojis,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ],
    position: 3,
  },
  {
    name: 'Team',
    color: COLORS.TEAM,
    hoist: true,
    mentionable: true,
    permissions: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.SendMessagesInThreads,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AddReactions,
    ],
    position: 2,
  },
  {
    name: 'Guest',
    color: COLORS.GUEST,
    hoist: false,
    mentionable: false,
    permissions: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AddReactions,
    ],
    position: 1,
  },
];

/** Permissions to set on @everyone (server-level) — ViewChannel denied */
export const everyonePermissions = {
  deny: [PermissionFlagsBits.ViewChannel],
};

/** Permissions for the Setup Bot role AFTER initial setup (demoted) */
export const setupBotDemotedPermissions: bigint[] = [
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
];

// ─── Shorthand permission helpers ───────────────────────────────

const V = PermissionFlagsBits.ViewChannel;
const S = PermissionFlagsBits.SendMessages;
const T = PermissionFlagsBits.SendMessagesInThreads;
const R = PermissionFlagsBits.ReadMessageHistory;
const E = PermissionFlagsBits.EmbedLinks;
const A = PermissionFlagsBits.AttachFiles;
const CO = PermissionFlagsBits.Connect;
const SP = PermissionFlagsBits.Speak;

// ─── Categories & Channels ──────────────────────────────────────

export const categories: CategoryConfig[] = [
  // ── 🧠 PERSONAL ──
  {
    name: '\u{1f9e0} PERSONAL',
    position: 0,
    overwrites: [
      { role: '@everyone', allow: [], deny: [V] },
      { role: 'Corven', allow: [V, S, T, R, E], deny: [] },
      { role: 'Team', allow: [], deny: [V] },
    ],
    channels: [
      {
        name: 'journal',
        type: ChannelType.GuildText,
        topic: 'Daily reflections, thoughts, processing',
        category: '\u{1f9e0} PERSONAL',
        overwrites: [],
        autoArchive: true,
      },
      {
        name: 'finance',
        type: ChannelType.GuildText,
        topic: 'Budgets, expenses, financial planning',
        category: '\u{1f9e0} PERSONAL',
        overwrites: [],
        autoArchive: true,
      },
      {
        name: 'reminders',
        type: ChannelType.GuildText,
        topic: 'Reminders, deadlines, follow-ups',
        category: '\u{1f9e0} PERSONAL',
        overwrites: [],
        autoArchive: true,
      },
      {
        name: 'health',
        type: ChannelType.GuildText,
        topic: 'ADHD strategies, wellness, routines',
        category: '\u{1f9e0} PERSONAL',
        overwrites: [],
        autoArchive: true,
      },
      {
        name: 'Voice — Personal',
        type: ChannelType.GuildVoice,
        topic: '',
        category: '\u{1f9e0} PERSONAL',
        overwrites: [],
        autoArchive: false,
      },
    ],
  },

  // ── 💼 WORK ──
  {
    name: '\u{1f4bc} WORK',
    position: 1,
    overwrites: [
      { role: '@everyone', allow: [], deny: [V] },
      { role: 'Corven', allow: [V, S, T, R, E], deny: [] },
      { role: 'Team', allow: [V, S, T, R], deny: [] },
    ],
    channels: [
      {
        name: 'marketing',
        type: ChannelType.GuildText,
        topic: 'Marketing strategy, campaigns, content planning',
        category: '\u{1f4bc} WORK',
        overwrites: [],
        autoArchive: true,
      },
      {
        name: 'operations',
        type: ChannelType.GuildText,
        topic: 'Day-to-day operations, processes, logistics',
        category: '\u{1f4bc} WORK',
        overwrites: [],
        autoArchive: true,
      },
      {
        name: 'tasks',
        type: ChannelType.GuildText,
        topic: 'Task tracking, to-dos, progress updates',
        category: '\u{1f4bc} WORK',
        overwrites: [],
        autoArchive: true,
      },
      {
        name: 'research',
        type: ChannelType.GuildText,
        topic: 'Research findings, articles, analysis',
        category: '\u{1f4bc} WORK',
        overwrites: [],
        autoArchive: true,
      },
      {
        name: 'Voice — Work',
        type: ChannelType.GuildVoice,
        topic: '',
        category: '\u{1f4bc} WORK',
        overwrites: [],
        autoArchive: false,
      },
    ],
  },

  // ── 🤖 AGENTS ──
  {
    name: '\u{1f916} AGENTS',
    position: 2,
    overwrites: [{ role: '@everyone', allow: [], deny: [V] }],
    channels: [
      {
        name: 'corven',
        type: ChannelType.GuildText,
        topic: 'Freeform threads with Corven \u{1fab6} \u2014 use /corven',
        category: '\u{1f916} AGENTS',
        overwrites: [{ role: 'Corven', allow: [V, S, T, R], deny: [] }],
        autoArchive: true,
      },
      {
        name: 'agent-sandbox',
        type: ChannelType.GuildText,
        topic: 'Testing and experimentation \u2014 use any agent command',
        category: '\u{1f916} AGENTS',
        overwrites: [
          { role: 'Agent', allow: [V, S, T, R], deny: [] },
          { role: 'Admin', allow: [V, S, T, R], deny: [] },
        ],
        autoArchive: true,
      },
      {
        name: 'agent-to-agent',
        type: ChannelType.GuildText,
        topic: 'Inter-agent communication',
        category: '\u{1f916} AGENTS',
        overwrites: [{ role: 'Agent', allow: [V, S, T, R], deny: [] }],
        autoArchive: true,
      },
      {
        name: 'Voice — Corven',
        type: ChannelType.GuildVoice,
        topic: '',
        category: '\u{1f916} AGENTS',
        overwrites: [{ role: 'Corven', allow: [V, CO, SP], deny: [] }],
        autoArchive: false,
      },
    ],
  },

  // ── 🔧 META ──
  {
    name: '\u{1f527} META',
    position: 3,
    overwrites: [
      { role: '@everyone', allow: [], deny: [V] },
      { role: 'Agent', allow: [], deny: [V] },
      { role: 'Admin', allow: [V, S, T, R], deny: [] },
    ],
    channels: [
      {
        name: 'bot-commands',
        type: ChannelType.GuildText,
        topic:
          'Slash command invocations for the setup bot \u2014 your terminal for server operations',
        category: '\u{1f527} META',
        overwrites: [],
        autoArchive: false,
      },
      {
        name: 'audit-log',
        type: ChannelType.GuildText,
        topic:
          'Immutable record of every server change \u2014 automated by the setup bot',
        category: '\u{1f527} META',
        overwrites: [
          // Agents can post to audit-log even though they can't see META
          { role: 'Agent', allow: [S], deny: [] },
        ],
        autoArchive: false,
      },
      {
        name: 'server-config',
        type: ChannelType.GuildText,
        topic:
          'Human-readable notes about the current server state \u2014 the README for this server',
        category: '\u{1f527} META',
        overwrites: [],
        autoArchive: false,
      },
    ],
  },
];

// ─── Agent access map ───────────────────────────────────────────
// Used by /corven command to validate channel access

export interface AgentConfig {
  name: string;
  /** Role name for the managed bot role (used for channel overwrites + bot discovery) */
  roleName: string;
  emoji: string;
  /** Categories this agent has ViewChannel access to */
  accessibleCategories: string[];
  /** Specific channels where access is denied despite category access */
  deniedChannels: string[];
}

export const agentConfigs: Record<string, AgentConfig> = {
  corven: {
    name: 'Corven',
    roleName: 'Corven',
    emoji: '\u{1fab6}',
    accessibleCategories: [
      '\u{1f9e0} PERSONAL',
      '\u{1f4bc} WORK',
      '\u{1f916} AGENTS',
    ],
    deniedChannels: [],
  },
};
