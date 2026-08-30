import { db, sql } from "../../client"
import { errorLogModel } from "../../schema"
import { type ChunkedPurgeStopReason, chunkedPurge } from "../chunked-purge"

export type ErrorLogInsert = {
  id: string
  workspaceId: string
  contactId: string | null
  action: string
  detail: string
  httpCode: string | null
}

/**
 * Inserts `ErrorLog` rows, ignoring ids that are already present.
 *
 * The id is minted by the producer (`packages/business/src/error-log`), not
 * here, so a redelivered event re-inserts the same primary key and
 * `onConflictDoNothing` absorbs it — a crash between the insert and the stream
 * ack cannot duplicate a row.
 *
 * Constraint violations are deliberately not swallowed: the caller narrows them
 * (a deleted contact is recoverable by dropping the attribution, a deleted
 * workspace is not) and decides what to retry.
 */
export function insertErrorLogs(rows: ErrorLogInsert[]) {
  return db.insert(errorLogModel).values(rows).onConflictDoNothing()
}

export type PurgeErrorLogsOptions = {
  retentionDays: number
  chunkSize: number
  interChunkDelayMs: number
  maxChunks: number
  maxRunDurationMs?: number
}

/**
 * Deletes `ErrorLog` rows older than the retention window, oldest first, in
 * chunks so a long delete never blocks a concurrent insert from a producer.
 *
 * `stopReason` tells the caller whether the backlog drained — repeated
 * non-`drained` runs mean the table is growing faster than retention clears it.
 */
export function purgeErrorLogs(
  options: PurgeErrorLogsOptions,
): Promise<{ deleted: number; stopReason: ChunkedPurgeStopReason }> {
  const { retentionDays, ...bounds } = options
  return chunkedPurge({
    table: "ErrorLog",
    where: sql`"createdAt" < NOW() - make_interval(days => ${retentionDays})`,
    orderBy: "createdAt",
    ...bounds,
  })
}
