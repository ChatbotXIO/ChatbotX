import { db, sql } from "../../client"
import { errorLogModel } from "../../schema"
import { type ChunkedPurgeStopReason, chunkedPurge } from "../chunked-purge"

export type ErrorLogInsert = {
  id: string
  workspaceId: string
  contactId: string | null
  /**
   * The contact's channel-side id (`ContactInbox.sourceId`). Required rather
   * than optional so the writer's `toRow` cannot quietly omit it.
   */
  sourceId: string | null
  /**
   * Stack frames, or `null`. Required rather than optional so the writer's
   * `toRow` cannot quietly omit it — same reasoning as `sourceId` above.
   */
  stackTrace: string | null
  action: string
  detail: string
  httpCode: string | null
}

/** Resolves to `T` only when `T` is `never`, so a non-empty `T` is a type error. */
type AssertNever<T extends never> = T

/**
 * `ErrorLogInsert` is hand-written rather than `$inferInsert` — the id is
 * producer-minted and the shape is the event contract, not the table. This
 * fails to compile if the table gains a column the insert type does not carry;
 * without it the failure mode is silent, a column left NULL forever.
 *
 * The assertion has to be *used* to bite: a bare `X extends never ? true : …`
 * alias resolves to its false branch and never errors.
 */
type _ErrorLogInsertCoversTable = AssertNever<
  Exclude<
    keyof typeof errorLogModel.$inferInsert,
    keyof ErrorLogInsert | "createdAt" | "updatedAt"
  >
>

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
