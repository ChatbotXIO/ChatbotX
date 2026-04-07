import type Redis from "ioredis"

const TAG_PREFIX = "cache:tag:"

type CacheOptions = {
  key: string
  ttlInSeconds: number
  tags?: string[]
}

export const cacheFactory = (getRedisClient: () => Promise<Redis>) => ({
  async withCache<T>(options: CacheOptions, fn: () => Promise<T>): Promise<T> {
    const { key, ttlInSeconds, tags } = options
    const client = await getRedisClient()

    const cached = await client.get(key)
    if (cached) {
      try {
        return JSON.parse(cached) as T
      } catch {
        // corrupted cache entry, fall through to refresh
      }
    }

    const result = await fn()

    const pipeline = client.pipeline()
    pipeline.setex(key, ttlInSeconds, JSON.stringify(result))

    if (tags?.length) {
      for (const tag of tags) {
        const tagKey = `${TAG_PREFIX}${tag}`
        pipeline.sadd(tagKey, key)
        pipeline.expire(tagKey, ttlInSeconds)
      }
    }

    await pipeline.exec()
    return result
  },

  async invalidateByTag(tag: string): Promise<void> {
    const client = await getRedisClient()
    const tagKey = `${TAG_PREFIX}${tag}`

    const keys = await client.smembers(tagKey)
    if (keys.length === 0) {
      await client.del(tagKey)
      return
    }

    await client.del(...keys, tagKey)
  },

  async invalidateByTags(tags: string[]): Promise<void> {
    if (tags.length === 0) {
      return
    }

    const client = await getRedisClient()
    const tagKeys = tags.map((tag) => `${TAG_PREFIX}${tag}`)

    const pipeline = client.pipeline()
    for (const tagKey of tagKeys) {
      pipeline.smembers(tagKey)
    }
    const results = await pipeline.exec()

    const keysToDelete = new Set<string>(tagKeys)
    if (results) {
      for (const [err, members] of results) {
        if (!err && Array.isArray(members)) {
          for (const key of members) {
            keysToDelete.add(key as string)
          }
        }
      }
    }

    if (keysToDelete.size > 0) {
      await client.del(...keysToDelete)
    }
  },
})

export type Cache = ReturnType<typeof cacheFactory>
