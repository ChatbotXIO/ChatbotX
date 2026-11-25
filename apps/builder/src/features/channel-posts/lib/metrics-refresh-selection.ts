import {
  CHANNEL_POST_METRICS_BATCH_MAX,
  CHANNEL_POST_METRICS_STALE_MS,
} from "@chatbotx.io/utils/channel-post"

/** Post id -> when this tab last asked for its fresh counts (ms). */
export type MetricsAskedAt = ReadonlyMap<string, number>

export type MetricsRefreshSelection = {
  /** The ids to ask for now (at most 50, none asked in the last 5 minutes). */
  ids: string[]
  /** The record to keep: only the visible ids, with the asked ones stamped `nowMs`. */
  next: MetricsAskedAt
}

/**
 * Picks which of the visible posts to ask fresh counts for: a post this tab
 * asked for less than 5 minutes ago is left out, and at most 50 go in one
 * request. The returned record holds only the visible ids, so it never grows
 * past the page that is shown.
 */
export const selectMetricsRefreshIds = (input: {
  askedAt: MetricsAskedAt
  nowMs: number
  visibleIds: readonly string[]
}): MetricsRefreshSelection => {
  const { askedAt, nowMs, visibleIds } = input
  const ids = visibleIds
    .filter((id) => {
      const asked = askedAt.get(id)
      return (
        asked === undefined || nowMs - asked >= CHANNEL_POST_METRICS_STALE_MS
      )
    })
    .slice(0, CHANNEL_POST_METRICS_BATCH_MAX)
  const asking = new Set(ids)
  const next = new Map<string, number>()
  for (const id of visibleIds) {
    const stamp = asking.has(id) ? nowMs : askedAt.get(id)
    if (stamp !== undefined) {
      next.set(id, stamp)
    }
  }
  return { ids, next }
}
