import { distributedStore } from "."

export const withCache = async <T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> => {
  const cached = await distributedStore.get<T>(key)
  if (cached) {
    return cached
  }
  const result = await fn()
  await distributedStore.put(key, result, ttl)
  return result
}
