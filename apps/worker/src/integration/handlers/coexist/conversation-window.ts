/**
 * Generic within-run frontier + cross-run ceiling filter over one page of
 * items walked newest → oldest (Graph `updated_time` DESC). Shared by coexist
 * Messenger sync (`messenger-sync.ts`'s `filterConversations` wrapper) and the
 * Automatic Customer Scan engine (`contact-scan/engine.ts`) — both walk
 * `/conversations` DESC and track their own `lastSyncedAt`/`resumeCursor`
 * watermark against the same two boundaries.
 */
export type ConversationWindowResult<T> = {
  /** Items that fall strictly between `frontier` (exclusive, newer bound —
   *  already processed by a previous chunk this run) and `ceiling`
   *  (exclusive, older bound — processed by a previous successful run). */
  itemsToProcess: T[]
  /** True once an item at or before `ceiling` is reached — the walk should
   *  stop entirely (older items were already imported by a prior run). */
  stopAll: boolean
  /** The oldest item's timestamp processed so far (across this call and
   *  `currentOldest`), to persist as the new watermark. */
  oldestProcessed: Date | null
}

export type ConversationWindowInput<T> = {
  items: T[]
  getUpdatedAt: (item: T) => Date | null
  /** Within-run watermark (exclusive, newer bound). Items newer than this
   *  were already processed earlier in this run's walk. */
  frontier: Date | null
  /** Cross-run boundary (exclusive, older bound). Items at/older than this
   *  were imported by a previous successful/partial run. */
  ceiling: Date | null
  currentOldest: Date | null
}

/**
 * Apply the within-run frontier + cross-run ceiling filters to one page of
 * items. Items with no resolvable timestamp are skipped — they can't be
 * positioned against either boundary and can't advance the watermark, and
 * importing them unordered risks re-import on every run.
 */
export function filterConversationWindow<T>(
  input: ConversationWindowInput<T>,
): ConversationWindowResult<T> {
  const { items, getUpdatedAt, frontier, ceiling } = input
  let stopAll = false
  let oldestProcessed = input.currentOldest
  const itemsToProcess: T[] = []

  for (const item of items) {
    const updatedAt = getUpdatedAt(item)

    if (!updatedAt) {
      continue
    }

    if (ceiling && updatedAt <= ceiling) {
      stopAll = true
      break
    }

    if (frontier && updatedAt > frontier) {
      continue
    }

    itemsToProcess.push(item)

    if (oldestProcessed === null || updatedAt < oldestProcessed) {
      oldestProcessed = updatedAt
    }
  }

  return { itemsToProcess, stopAll, oldestProcessed }
}
