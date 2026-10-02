/** Increments a `Map<string, number>` counter, defaulting an absent key to 0
 * first. Used for every per-key (workspace, guest conversation) connection
 * and pending-upgrade tally the gateway tracks. */
export const incrementKeyedCount = (
  counts: Map<string, number>,
  key: string,
): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

/** Decrements a `Map<string, number>` counter, deleting the key entirely
 * once it reaches zero (or below) rather than leaving a stale `0` entry
 * behind — keeps these maps from growing forever across a long-running
 * gateway process as workspaces/guest conversations churn. */
export const decrementKeyedCount = (
  counts: Map<string, number>,
  key: string,
): void => {
  const next = (counts.get(key) ?? 0) - 1
  if (next > 0) {
    counts.set(key, next)
  } else {
    counts.delete(key)
  }
}
