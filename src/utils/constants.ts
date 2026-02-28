/** Role colors (hex) matching docs/SERVER_ARCHITECTURE.md */
export const COLORS = {
  OWNER: 0xe74c3c,       // Red
  SETUP_BOT: 0x95a5a6,   // Grey
  ADMIN: 0xe67e22,        // Orange
  AGENT: 0x3498db,        // Blue
  TEAM: 0x2ecc71,         // Green
  GUEST: 0xbdc3c7,        // Light grey
} as const;

/** Embed colors for bot responses */
export const EMBED_COLORS = {
  SUCCESS: 0x2ecc71,
  ERROR: 0xe74c3c,
  WARNING: 0xf39c12,
  INFO: 0x3498db,
} as const;

/** Agent embed sidebar colors (decimal) — from Agent Color Registry */
export const AGENT_COLORS = {
  CORVEN: 15247484,       // #e8a87c
  FLARE_GROWTH: 3447003,  // #3498db
  FLARE_CONTENT: 2067276, // #1f8b4c
  FLARE_OPS: 15105570,    // #e67e22
  FLARE_LEADS: 10181046,  // #9b59b6
  DECISION: 16776960,     // #ffff00 — gold for decision embeds
} as const;

/** Thread auto-archive duration in minutes (24h) */
export const AUTO_ARCHIVE_DURATION = 1440;

/** Thread title max length for prompt-derived portion */
export const THREAD_TITLE_MAX_LENGTH = 80;

/** Category names with emoji prefixes */
export const CATEGORY_NAMES = {
  AGENTS: '\u{1f916} AGENTS',
  SQUADS: '\u{1f680} SQUADS',
  META: '\u{1f527} META',
} as const;
