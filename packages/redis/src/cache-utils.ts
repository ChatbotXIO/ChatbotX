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
  const cached = await distributedStore.get<T>(key)
  if (cached) {
    return cached
  }

  // Skip cache if result is null or undefined
  const result = await fn()
  if (result === null || result === undefined) {
    return result
  }
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
