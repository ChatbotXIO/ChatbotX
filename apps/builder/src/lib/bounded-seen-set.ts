/**
 * Insertion-ordered "have I seen this before" set, bounded to `capacity`
 * entries: once full, the oldest entry is evicted. For long-lived client-side
 * dedupe trackers that would otherwise grow unbounded for a tab's lifetime.
 * Not a permanent record — a re-added evicted value counts as new again.
 */
export type BoundedSeenSet<T> = {
  has: (value: T) => boolean
  add: (value: T) => void
  size: () => number
}

export function createBoundedSeenSet<T>(capacity: number): BoundedSeenSet<T> {
  const seen = new Set<T>()
  const insertionOrder: T[] = []

  return {
    has: (value: T) => seen.has(value),
    add: (value: T) => {
      if (seen.has(value)) {
        return
      }
      seen.add(value)
      insertionOrder.push(value)
      if (insertionOrder.length > capacity) {
        const oldest = insertionOrder.shift()
        if (oldest !== undefined) {
          seen.delete(oldest)
        }
      }
    },
    size: () => seen.size,
  }
}
