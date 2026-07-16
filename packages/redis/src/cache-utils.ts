import logger from "@chatbotx.io/logger"
import type { SuperJSONResult } from "superjson"
import superjson from "superjson"
import { distributedStore } from "."

// Cached values are stored as SuperJSON envelopes so rich types (Date, Map,
// Set, BigInt, …) survive the Redis JSON round-trip — a plain JSON.parse
// turns Drizzle timestamp columns back into ISO strings, which breaks
// consumers that expect Date instances (e.g. oRPC output validation).
//
// The prefix versions the cache namespace: entries written by pre-SuperJSON
// code live under the unprefixed keys, are never read again, and expire by
// TTL. During a rolling deploy old readers keep using the unprefixed keys, so
// they never see an envelope they cannot decode.
const CACHE_KEY_PREFIX = "sj:"

const isSuperJsonEnvelope = (value: unknown): value is SuperJSONResult =>
  typeof value === "object" && value !== null && "json" in value

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
  const cacheKey = `${CACHE_KEY_PREFIX}${key}`

  // Cache reads must never break callers: on a Redis failure (timeout, cold
  // connection, server down) or a malformed envelope fall back to the source
  // function instead of propagating. See cache-connection.ts — cache commands
  // are configured to fail fast so callers can degrade gracefully.
  try {
    const cached = await distributedStore.get<SuperJSONResult>(cacheKey)
    if (isSuperJsonEnvelope(cached)) {
      return superjson.deserialize<T>(cached)
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
    await distributedStore.put(cacheKey, superjson.serialize(result), ttl)

    // Add tags to the cache
    const dynamicTagsResult = dynamicTags?.(result)
    const allTags = [...tags, ...(dynamicTagsResult || [])]
    if (allTags.length > 0) {
      await Promise.all(
        allTags.map(async (tag) => {
          await distributedStore.sadd(`tags:${tag}`, cacheKey)
          await distributedStore.expire(`tags:${tag}`, ttl)
        }),
      )
    }
  } catch (err) {
    logger.debug({ err, key }, "Cache write failed, returning source result")
  }

  return result
}

/**
 * Invalidate withCache entries by their logical (unprefixed) key. Callers must
 * use this instead of `distributedStore.delete(key)` — withCache stores values
 * under a private namespace prefix, so a raw delete misses the real entry.
 * The legacy unprefixed key is deleted too, so invalidation stays correct
 * while pre-SuperJSON writers are still live during a rolling deploy.
 */
export const invalidateCacheKeys = async (
  keys: string | string[],
): Promise<void> => {
  const keysArray = Array.isArray(keys) ? keys : [keys]
  if (keysArray.length === 0) {
    return
  }
  await distributedStore.delete(
    keysArray.flatMap((key) => [`${CACHE_KEY_PREFIX}${key}`, key]),
  )
}

export const invalidateCacheByTags = async (tags: string[]) => {
  if (tags.length === 0) {
    return
  }
  await Promise.all(
    tags.map(async (tag) => {
      const keys = await distributedStore.smembers(`tags:${tag}`)
      await distributedStore.delete([...keys, `tags:${tag}`])
    }),
  )
}
