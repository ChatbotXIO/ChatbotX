/**
 * Keeps the first item for each key: lists loaded in pages can show a row twice
 * when it moves between two fetches, and the earlier page holds the newer position.
 */
export const dedupeBy = <T>(
  items: readonly T[],
  getKey: (item: T) => string,
): T[] => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = getKey(item)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
