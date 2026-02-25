/** Role colors (hex) matching SERVER_ARCHITECTURE.md */
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

/** Thread auto-archive duration in minutes (24h) */
export const AUTO_ARCHIVE_DURATION = 1440;

/** Thread title max length for user message portion */
export const THREAD_TITLE_MAX_LENGTH = 60;

/** Category names with emoji prefixes */
export const CATEGORY_NAMES = {
  PERSONAL: '\u{1f9e0} PERSONAL',
  WORK: '\u{1f4bc} WORK',
  AGENTS: '\u{1f916} AGENTS',
  META: '\u{1f527} META',
} as const;
