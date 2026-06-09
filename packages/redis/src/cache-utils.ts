import logger from "@chatbotx.io/logger"
import { distributedStore } from "."

export const withCache = async <T>(
  key: string,
  fn: () => Promise<T>,
  options?: {
    ttl?: number
    tags?: string[]
    dynamicTags?: (result: T) => string[] | undefined
  },
): Promise<T> => {
  const { ttl = 24 * 60 * 60, tags = [], dynamicTags } = options || {}

  // Cache reads must never break callers: on a Redis failure (timeout, cold
  // connection, server down) fall back to the source function instead of
  // propagating. See cache-connection.ts — cache commands are configured to
  // fail fast so callers can degrade gracefully.
  try {
    const cached = await distributedStore.get<T>(key)
    if (cached) {
      return cached
    }
  } catch (err) {
    logger.debug({ err, key }, "Cache read failed, falling back to source")
  }

  const result = await fn()
  // Skip cache write if result is null or undefined
  if (result === null || result === undefined) {
    return result
  }

  // Cache writes are best-effort: a failure here must not break the caller,
  // which already has a valid result from the source function.
  try {
    await distributedStore.put(key, result, ttl)

    // Add tags to the cache
    const dynamicTagsResult = dynamicTags?.(result)
    const allTags = [...tags, ...(dynamicTagsResult || [])]
    if (allTags.length > 0) {
      await Promise.all(
        allTags.map(async (tag) => {
          await distributedStore.sadd(`tags:${tag}`, key)
          await distributedStore.expire(`tags:${tag}`, ttl)
        }),
      )
    }
  } catch (err) {
    logger.debug({ err, key }, "Cache write failed, returning source result")
  }

  return result
}

export const invalidateCacheByTags = async (tags: string[]) => {
  if (tags.length === 0) {
    return
  }
  for (const tag of tags) {
    const keys = await distributedStore.smembers(`tags:${tag}`)
    await distributedStore.delete([...keys, `tags:${tag}`])
  }
}
