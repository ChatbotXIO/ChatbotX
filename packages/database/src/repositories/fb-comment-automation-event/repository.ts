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
 * Deletes `FBCommentAutomationEvent` rows older than the retention window,
 * oldest first, in chunks so a long delete never blocks the comment-automation
 * loop writing a new event.
 *
 * `stopReason` tells the caller whether the backlog drained — repeated
 * non-`drained` runs mean the table grows faster than retention clears it.
 */
export function purgeCommentAutomationEvents(
  options: PurgeCommentAutomationEventsOptions,
): Promise<{ deleted: number; stopReason: ChunkedPurgeStopReason }> {
  const { retentionDays, ...bounds } = options
  return chunkedPurge({
    table: "FBCommentAutomationEvent",
    where: sql`"createdAt" < NOW() - make_interval(days => ${retentionDays})`,
    orderBy: "createdAt",
    ...bounds,
  })
}
