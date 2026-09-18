/**
 * Insertion-ordered "have I seen this before" set, bounded to `capacity`
 * entries: once full, the OLDEST entry is evicted to make room for a new
 * one. Exists for long-lived client-side dedupe trackers (e.g. "which
 * whatsappCallIds has this inbox already bubbled to the top") that would
 * otherwise grow for the entire lifetime of a mounted component/tab,
 * unbounded, as more calls ring over a long session.
 *
 * Re-adding a value that was evicted is treated as new again — this is a
 * bounded LRU-by-insertion-order cache, not a permanent record, so the
 * (accepted) tradeoff is that a value could in principle be "forgotten"
 * and re-processed once `capacity` other distinct values have been seen
 * since. For its actual use (deduping a bubble-to-top action per ringing
 * call, capacity in the hundreds) this is far larger than any realistic
 * number of calls ringing within one tab's session.
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
