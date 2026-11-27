import type { ChannelPostSyncStatus } from "@chatbotx.io/database/partials"

/** How often the sync status is re-read while a sync is queued or running. */
export const SYNC_POLL_INTERVAL_MS = 5000

type SyncStatusRow = {
  inboxId?: string
  lastSyncedAt?: Date | null
  status: ChannelPostSyncStatus
}

/** Each inbox's last completed sync (ms; null = never), to spot a sync that finished unseen. */
export type SyncMarkers = ReadonlyMap<string, number | null>

export const syncMarkersOf = (items: readonly SyncStatusRow[]): SyncMarkers =>
  new Map(
    items.flatMap((item): [string, number | null][] =>
      item.inboxId
        ? [[item.inboxId, item.lastSyncedAt?.getTime() ?? null]]
        : [],
    ),
  )

/**
 * True when an inbox's last completed sync moved since `previous`: a fast sync
 * can finish between two reads without ever being seen queued or running, so
 * the list read before it would stay stale. No previous read means nothing to compare.
 */
export const syncCompletedSince = (
  previous: SyncMarkers | null,
  items: readonly SyncStatusRow[],
): boolean => {
  if (!previous) {
    return false
  }
  for (const [inboxId, marker] of syncMarkersOf(items)) {
    if (previous.has(inboxId) && previous.get(inboxId) !== marker) {
      return true
    }
  }
  return false
}

/** Whether any inbox still has a sync queued or running. */
export const hasActiveSync = (
  items: readonly SyncStatusRow[] | undefined,
): boolean =>
  items?.some(
    (item) => item.status === "queued" || item.status === "running",
  ) ?? false

/** The status query's `refetchInterval`: poll while a sync is active, else stop. */
export const syncRefetchInterval = (
  items: readonly SyncStatusRow[] | undefined,
): number | false => (hasActiveSync(items) ? SYNC_POLL_INTERVAL_MS : false)

/** True on the read where a sync that was active is no longer (finished or failed). */
export const syncJustSettled = (
  wasActive: boolean,
  items: readonly SyncStatusRow[] | undefined,
): boolean => wasActive && items !== undefined && !hasActiveSync(items)
