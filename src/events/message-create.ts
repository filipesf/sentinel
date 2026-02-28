import { Events, type Message } from 'discord.js';

export const name = Events.MessageCreate;

const CORVEN_BOT_ID = process.env.OPENCLAW_DISCORD_BOT_ID ?? '1475916909647233208';
const DEDUPE_WINDOW_MS = 30_000;

type SeenMessage = {
  id: string;
  ts: number;
};

const recentMessages = new Map<string, SeenMessage>();

function buildSignature(message: Message): string {
  const content = message.content.trim();
  const embeds = message.embeds
    .map((embed) => `${embed.title ?? ''}|${embed.description ?? ''}`.trim())
    .filter(Boolean)
    .join('\n');

  return `${content}\n${embeds}`.trim().replace(/\s+/g, ' ');
}

function pruneOldEntries(now: number): void {
  for (const [key, value] of recentMessages.entries()) {
    if (now - value.ts > DEDUPE_WINDOW_MS) {
      recentMessages.delete(key);
    }
  }
}

export async function execute(message: Message): Promise<void> {
  if (!message.guild) return;
  const isCorvenSource =
    message.author.id === CORVEN_BOT_ID ||
    (message.author.bot && message.author.username.toLowerCase() === 'corven');
  if (!isCorvenSource) return;
  if (message.author.id === message.client.user?.id) return;

  const signature = buildSignature(message);
  if (!signature) return;

  const now = Date.now();
  const key = `${message.channelId}:${message.author.id}:${signature}`;
  const seen = recentMessages.get(key);

  if (seen && now - seen.ts <= DEDUPE_WINDOW_MS && seen.id !== message.id) {
    try {
      await message.delete();
      console.log(
        `[DEDUPE] Deleted duplicate Corven message ${message.id} in #${message.channelId}`,
      );
    } catch (error) {
      console.error(`[DEDUPE] Failed to delete duplicate message ${message.id}:`, error);
    }
    return;
  }

  recentMessages.set(key, { id: message.id, ts: now });
  console.log(
    `[DEDUPE] Tracked Corven message ${message.id} author=${message.author.id} in #${message.channelId}`,
  );
  pruneOldEntries(now);
}
