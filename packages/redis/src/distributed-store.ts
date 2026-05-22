import type Redis from "ioredis"

// Server-side Redis (Lua) script: atomically increments a counter only when
// the key already exists. Registered once per client via `defineCommand`.
const INCR_IF_EXISTS_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
local next = redis.call('INCRBY', KEYS[1], ARGV[1])
if tonumber(ARGV[2]) > 0 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return next
`

type IncrIfExistsClient = Redis & {
  incrIfExists: (
    key: string,
    delta: string,
    ttlSeconds: string,
  ) => Promise<number | false>
}

const clientsWithIncrIfExists = new WeakSet<Redis>()

function withIncrIfExists(client: Redis): IncrIfExistsClient {
  if (!clientsWithIncrIfExists.has(client)) {
    client.defineCommand("incrIfExists", {
      numberOfKeys: 1,
      lua: INCR_IF_EXISTS_LUA,
    })
    clientsWithIncrIfExists.add(client)
  }
  return client as IncrIfExistsClient
}

export const distributedStoreFactory = (
  getRedisClient: () => Promise<Redis>,
) => ({
  async put(key: string, value: unknown, ttlInSeconds?: number): Promise<void> {
    const serializedValue = JSON.stringify(value)
    const redisClient = await getRedisClient()
    if (ttlInSeconds) {
      await redisClient.setex(key, ttlInSeconds, serializedValue)
    } else {
      await redisClient.set(key, serializedValue)
    }
  },

  async get<T>(key: string): Promise<T | null> {
    const redisClient = await getRedisClient()
    const value = await redisClient.get(key)
    if (!value) {
      return null
    }

    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  },

  async getAll<T>(keys: string[]): Promise<Record<string, T | null>> {
    const redisClient = await getRedisClient()
    const values = await redisClient.mget(keys)
    return values.reduce<Record<string, T | null>>((result, value, index) => {
      if (value) {
        result[keys[index]] = JSON.parse(value)
      }
      return result
    }, {})
  },

  async delete(keys: string | string[]): Promise<void> {
    const keysArray = Array.isArray(keys) ? keys : [keys]
    if (keysArray.length === 0) {
      return
    }
    const redisClient = await getRedisClient()
    await redisClient.del(...keysArray)
  },

  async putMany(
    entries: Array<{ key: string; value: unknown; ttlInSeconds?: number }>,
  ): Promise<void> {
    if (entries.length === 0) {
      return
    }

    const redisClient = await getRedisClient()
    const pipeline = redisClient.pipeline()

    for (const { key, value, ttlInSeconds } of entries) {
      const serializedValue = JSON.stringify(value)
      if (ttlInSeconds) {
        pipeline.setex(key, ttlInSeconds, serializedValue)
      } else {
        pipeline.set(key, serializedValue)
      }
    }

    await pipeline.exec()
  },

  async putBoolean(key: string, value: boolean): Promise<void> {
    const redisClient = await getRedisClient()
    await redisClient.set(key, value ? "1" : "0")
  },

  async getBoolean(key: string): Promise<boolean | null> {
    const redisClient = await getRedisClient()
    const value = await redisClient.get(key)

    return value === null ? null : Boolean(value)
  },

  async putBooleanBatch(
    keyValuePairs: Array<{ key: string; value: boolean }>,
  ): Promise<void> {
    if (keyValuePairs.length === 0) {
      return
    }

    const redisClient = await getRedisClient()
    const multi = redisClient.multi()

    for (const { key, value } of keyValuePairs) {
      multi.set(key, value ? "1" : "0")
    }

    await multi.exec()
  },

  async hgetJson<T extends Record<string, unknown>>(
    key: string,
  ): Promise<T | null> {
    const redisClient = await getRedisClient()
    const hashData = await redisClient.hgetall(key)
    if (!hashData || Object.keys(hashData).length === 0) {
      return null
    }
    const result: Record<string, unknown> = {}
    for (const [field, value] of Object.entries(hashData)) {
      const hasValue =
        value !== null && value !== undefined && value.trim().length > 0
      if (!hasValue) {
        continue
      }
      try {
        result[field] = JSON.parse(value)
      } catch {
        result[field] = value
      }
    }
    return result as T
  },

  async merge<T extends Record<string, unknown>>(
    key: string,
    value: T,
    ttlInSeconds?: number,
  ): Promise<void> {
    const redisClient = await getRedisClient()
    const serializedFields: Record<string, string> = {}

    for (const [field, fieldValue] of Object.entries(value)) {
      if (fieldValue === null || fieldValue === undefined) {
        continue
      }
      serializedFields[field] = JSON.stringify(fieldValue)
    }

    await redisClient.hset(key, serializedFields)

    if (ttlInSeconds) {
      await redisClient.expire(key, ttlInSeconds)
    }
  },

  async deleteKeyIfFieldValueMatches(
    key: string,
    field: string,
    expectedValue: unknown,
  ): Promise<void> {
    const redisClient = await getRedisClient()
    const lua = `
            local currentValue = redis.call('HGET', KEYS[1], ARGV[1])
            if currentValue and currentValue == ARGV[2] then
                redis.call('DEL', KEYS[1])
            end
        `
    const serializedValue = JSON.stringify(expectedValue)
    await redisClient.eval(lua, 1, key, field, serializedValue)
  },

  async zadd(key: string, score: number, member: string): Promise<void> {
    const redisClient = await getRedisClient()
    await redisClient.zadd(key, score, member)
  },

  async zrem(key: string, member: string): Promise<void> {
    const redisClient = await getRedisClient()
    await redisClient.zrem(key, member)
  },

  async zrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<string[]> {
    const redisClient = await getRedisClient()
    return await redisClient.zrangebyscore(key, min, max)
  },

  async rpush(key: string, value: unknown) {
    const redisClient = await getRedisClient()
    return await redisClient.rpush(key, JSON.stringify(value))
  },

  async expire(key: string, ttlSeconds: number) {
    const redisClient = await getRedisClient()
    return await redisClient.expire(key, ttlSeconds)
  },

  async lrange(key: string, start: number | string, stop: number | string) {
    const redisClient = await getRedisClient()
    const items = await redisClient.lrange(key, start, stop)

    return items.map((item) => JSON.parse(item))
  },

  async sadd(key: string, member: string): Promise<number> {
    const redisClient = await getRedisClient()
    return await redisClient.sadd(key, member)
  },

  async smembers(key: string): Promise<string[]> {
    const redisClient = await getRedisClient()
    return await redisClient.smembers(key)
  },

  /**
   * Atomically increments an existing counter. If the key does not exist this
   * is a no-op and returns null — the counter is intentionally NOT created
   * from zero, so a stale/expired cache is repopulated from the source of
   * truth (via `getNumber` + `setNumberIfNotExists`) instead of drifting to a
   * delta-only value.
   */
  async incrementCounter(
    key: string,
    delta: number,
    ttlInSeconds?: number,
  ): Promise<number | null> {
    if (delta === 0) {
      return null
    }
    const redisClient = withIncrIfExists(await getRedisClient())
    const ttl = ttlInSeconds && ttlInSeconds > 0 ? ttlInSeconds : 0
    const result = await redisClient.incrIfExists(
      key,
      String(delta),
      String(ttl),
    )
    return typeof result === "number" ? result : null
  },

  async getNumber(key: string): Promise<number | null> {
    const redisClient = await getRedisClient()
    const value = await redisClient.get(key)
    if (value === null) {
      return null
    }
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  },

  async setNumberIfNotExists(
    key: string,
    value: number,
    ttlInSeconds: number,
  ): Promise<boolean> {
    const redisClient = await getRedisClient()
    const result = await redisClient.set(
      key,
      String(value),
      "EX",
      ttlInSeconds,
      "NX",
    )
    return result === "OK"
  },
})

export type DistributedStore = ReturnType<typeof distributedStoreFactory>
