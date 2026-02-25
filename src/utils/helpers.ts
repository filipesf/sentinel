import { THREAD_TITLE_MAX_LENGTH } from './constants.js';

/**
 * Format a date as compact YYYYMMDD for thread naming.
 */
export function formatDateCompact(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format a date as YYYY-MM-DD HH:MM:SS for audit log entries.
 */
export function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Create a thread title from a user message.
 * Format: YYYYMMDD — <message truncated to ~60 chars>
 */
export function createThreadTitle(message: string, date?: Date): string {
  const dateStr = formatDateCompact(date);
  const truncated =
    message.length > THREAD_TITLE_MAX_LENGTH
      ? `${message.slice(0, THREAD_TITLE_MAX_LENGTH).trimEnd()}…`
      : message;
  return `${dateStr} \u2014 ${truncated}`;
}

/**
 * Sleep for a given number of milliseconds.
 * Useful for rate limit handling.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
