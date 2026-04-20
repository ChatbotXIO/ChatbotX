import { distributedStore } from "."
import type { DistributedStore } from "./distributed-store"

export const withCache = async <T>(
  key: string,
  fn: () => Promise<T>,
  options?: {
    ttl?: number
    tags?: string[]
    dynamicTags?: (
      distributedStore: DistributedStore,
      result: T,
    ) => Promise<void>
  },
): Promise<T> => {
  const { ttl = 24 * 60 * 60, tags = [], dynamicTags } = options || {}
  const cached = await distributedStore.get<T>(key)
  // console.log("cachedddd", cached)
  if (cached) {
    return cached
  }

  // Skip cache if result is null or undefined
  const result = await fn()
  if (result === null || result === undefined) {
    return result
  }
  console.log("result", result)
  await distributedStore.put(key, result, ttl)

  // Add tags to the cache
  if (tags.length > 0) {
    for (const tag of tags) {
      await distributedStore.sadd(`tags:${tag}`, key)
    }
  }

  await dynamicTags?.(distributedStore, result)

  return result
}

export const invalidateCacheByTags = async (tags: string[]) => {
  if (tags.length === 0) {
    return
  }
  for (const tag of tags) {
    const keys = await distributedStore.smembers(`tags:${tag}`)
    await distributedStore.delete(keys)
    await distributedStore.delete(`tags:${tag}`)
  }
}
