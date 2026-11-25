import type Redis from "ioredis"

// Atomic counting semaphore on a sorted set: members are holders scored by
// their expiry (ms). Expired holders (a crashed worker) are dropped first, so a
// slot is never held forever. Returns 1 when the slot was taken, 0 when full.
const ACQUIRE_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return 1
`

/**
 * A bounded number of holders per key across every process (e.g. publish jobs
 * per network). `acquire` never blocks: the caller defers when it is `false`.
 */
export const concurrencySlotsFactory = (
  getRedisClient: () => Promise<Redis>,
) => ({
  async acquire(input: {
    holder: string
    key: string
    limit: number
    /** After this the holder is dropped even if it never released. */
    ttlMs: number
  }): Promise<boolean> {
    const client = await getRedisClient()
    const now = Date.now()
    const result = await client.eval(
      ACQUIRE_LUA,
      1,
      input.key,
      String(now),
      String(now + input.ttlMs),
      String(input.limit),
      input.holder,
      String(input.ttlMs),
    )
    return result === 1
  },

  async release(input: { holder: string; key: string }): Promise<void> {
    const client = await getRedisClient()
    await client.zrem(input.key, input.holder)
  },
})
