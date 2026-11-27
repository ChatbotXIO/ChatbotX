/**
 * Whether `a` and `b` hold the same ids, each exactly once (order ignored).
 * Duplicates on either side make the lists differ.
 */
export const sameIdSet = (
  a: readonly string[],
  b: readonly string[],
): boolean => {
  if (a.length !== b.length) {
    return false
  }
  const members = new Set(b)
  return members.size === b.length && a.every((id) => members.has(id))
}

/** Whether two string maps hold the same keys with the same values. */
export const sameStringRecord = (
  a: Record<string, string>,
  b: Record<string, string>,
): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (a[key] !== b[key]) {
      return false
    }
  }
  return true
}
