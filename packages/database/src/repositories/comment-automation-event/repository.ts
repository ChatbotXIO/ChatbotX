import { sql } from "../../client"
import { type ChunkedPurgeStopReason, chunkedPurge } from "../chunked-purge"

export type PurgeCommentAutomationEventsOptions = {
  retentionDays: number
  chunkSize: number
  interChunkDelayMs: number
  maxChunks: number
  maxRunDurationMs?: number
}

/**
 * Deletes FAILED `CommentAutomationEvent` rows older than the retention
 * window, oldest first, in chunks so a long delete never blocks the
 * comment-automation loop writing a new event.
 *
 * `status = 'failed'` is part of the where-clause, not an implementation
 * detail: successful rows are the analytics page's whole history and are kept
 * forever, while a failure is only ever read by the Error Logs panel, which
 * mirrors `ErrorLog`'s 30-day window. Deleting a failed row does NOT disturb
 * the lifetime counters on `CommentAutomation` — they are stored columns, not
 * an aggregate over this table.
 *
 * `CommentAutomationEvent_failed_createdAt_idx` is the partial index this
 * scan rides; without it the oldest-first select would walk an ever-growing
 * prefix of kept successful rows on every run.
 *
 * `stopReason` tells the caller whether the backlog drained — repeated
 * non-`drained` runs mean failures accumulate faster than retention clears them.
 */
export function purgeFailedCommentAutomationEvents(
  options: PurgeCommentAutomationEventsOptions,
): Promise<{ deleted: number; stopReason: ChunkedPurgeStopReason }> {
  const { retentionDays, ...bounds } = options
  return chunkedPurge({
    table: "CommentAutomationEvent",
    where: sql`"status" = 'failed' AND "createdAt" < NOW() - make_interval(days => ${retentionDays})`,
    orderBy: "createdAt",
    ...bounds,
  })
}
