import type Redis from "ioredis"

export type BloomFilterOptions = {
  /** Error rate (default: 0.001 = 0.1%) */
  errorRate?: number
  /** Expected capacity (default: 100000) */
  capacity?: number
  /** TTL in seconds (optional, for auto-expiring filters) */
  ttlSeconds?: number
}

const DEFAULT_ERROR_RATE = 0.001
const DEFAULT_CAPACITY = 100_000

export const bloomFilterFactory = (getRedisClient: () => Promise<Redis>) => {
  const reservedKeys = new Set<string>()

  const ensureReserved = async (
    redis: Redis,
    key: string,
    options?: BloomFilterOptions,
  ): Promise<void> => {
    if (reservedKeys.has(key)) {
      return
    }

    const errorRate = options?.errorRate ?? DEFAULT_ERROR_RATE
    const capacity = options?.capacity ?? DEFAULT_CAPACITY

    try {
      await redis.call("BF.RESERVE", key, errorRate, capacity)
      reservedKeys.add(key)

      if (options?.ttlSeconds) {
        await redis.expire(key, options.ttlSeconds)
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("item exists")) {
        reservedKeys.add(key)
        return
      }
      throw error
    }
  }

  return {
    async reserve(key: string, options?: BloomFilterOptions): Promise<void> {
      const redis = await getRedisClient()
      await ensureReserved(redis, key, options)
    },

    async add(
      key: string,
      item: string,
      options?: BloomFilterOptions,
    ): Promise<boolean> {
      const redis = await getRedisClient()
      await ensureReserved(redis, key, options)
      const result = await redis.call("BF.ADD", key, item)
      return result === 1
    },

    async addMany(
      key: string,
      items: string[],
      options?: BloomFilterOptions,
    ): Promise<boolean[]> {
      if (items.length === 0) {
        return []
      }

      const redis = await getRedisClient()
      await ensureReserved(redis, key, options)
      const results = (await redis.call("BF.MADD", key, ...items)) as number[]
      return results.map((r) => r === 1)
    },

    async exists(key: string, item: string): Promise<boolean> {
      const redis = await getRedisClient()
      const result = await redis.call("BF.EXISTS", key, item)
      return result === 1
    },

    async existsMany(key: string, items: string[]): Promise<boolean[]> {
      if (items.length === 0) {
        return []
      }

      const redis = await getRedisClient()
      const results = (await redis.call(
        "BF.MEXISTS",
        key,
        ...items,
      )) as number[]
      return results.map((r) => r === 1)
    },

    async addIfNotExists(
      key: string,
      item: string,
      options?: BloomFilterOptions,
    ): Promise<boolean> {
      const redis = await getRedisClient()
      await ensureReserved(redis, key, options)
      const existed = await redis.call("BF.EXISTS", key, item)
      if (existed === 1) {
        return false
      }
      await redis.call("BF.ADD", key, item)
      return true
    },
  }
}

export type BloomFilter = ReturnType<typeof bloomFilterFactory>
