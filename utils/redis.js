// utils/redis.js
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── Stock helpers ──────────────────────────────────────────────
// Stock shape per spawner: { count, buyPrice, sellPrice }
export async function getStock() {
  const raw = await redis.get('sh:stock');
  return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
}

export async function setStock(data) {
  await redis.set('sh:stock', JSON.stringify(data));
}

// ── Giveaway helpers ───────────────────────────────────────────
// Giveaway shape: { id, prize, messageId, channelId, hostId, endedAt, entries: [userId,...], winner, active }
export async function getGiveaway(id) {
  const raw = await redis.get(`sh:giveaway:${id}`);
  return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
}

export async function saveGiveaway(giveaway) {
  await redis.set(`sh:giveaway:${giveaway.id}`, JSON.stringify(giveaway));
  // Keep an index of all giveaway IDs
  await redis.sadd('sh:giveaways:all', giveaway.id);
}

export async function getAllGiveawayIds() {
  return await redis.smembers('sh:giveaways:all') || [];
}

export async function getRecentEndedGiveaways(limit = 10) {
  const ids = await getAllGiveawayIds();
  const all = await Promise.all(ids.map(id => getGiveaway(id)));
  return all
    .filter(g => g && !g.active)
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, limit);
}
