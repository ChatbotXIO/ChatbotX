import type Redis from "ioredis"

/**
 * Generic ephemeral presence set: a member that "heartbeats" within a TTL
 * window counts as live, and drops out on its own once it stops — no sweeper
 * needed. Backed by a Redis sorted set scored by each member's expiry (epoch
 * ms); a read prunes the expired members in the same round-trip, so a crashed
 * or closed client never lingers. Channel-agnostic in the same factory style
 * as {@link import("./cas-store").casStoreFactory}: it knows nothing about
 * calls/agents/workspaces, only `key -> { member, expiresAt }`.
 */
export const presenceStoreFactory = (getRedisClient: () => Promise<Redis>) => ({
  /**
   * Marks `member` live under `key` until `now + ttlMs`, and bounds the key's
   * own lifetime to the same window so an abandoned set cannot linger in Redis
   * after its last member expires.
   */
  async heartbeat(key: string, member: string, ttlMs: number): Promise<void> {
    const redis = await getRedisClient()
    const expiresAt = Date.now() + ttlMs
    // One pipeline so the member add and the key-TTL refresh land together — a
    // crash between two separate calls could otherwise leave the set without a
    // TTL (the doc contract is "no abandoned key can linger").
    await redis.multi().zadd(key, expiresAt, member).pexpire(key, ttlMs).exec()
  },

  /** Removes `member` immediately (e.g. an explicit sign-off / tab close). */
  async drop(key: string, member: string): Promise<void> {
    const redis = await getRedisClient()
    await redis.zrem(key, member)
  },

  /**
   * Live members under `key` (expiry still in the future), most-recently-seen
   * first, capped at `limit`. Self-cleaning: it drops the already-expired
   * members before reading, so the returned set never includes a stale entry.
   */
  async liveMembers(key: string, limit: number): Promise<string[]> {
    const redis = await getRedisClient()
    const now = Date.now()
    await redis.zremrangebyscore(key, 0, now)
    return await redis.zrevrangebyscore(key, "+inf", now, "LIMIT", 0, limit)
  },
})

export type PresenceStore = ReturnType<typeof presenceStoreFactory>
