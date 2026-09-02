import { db, type SQL, sql } from "../client"

/**
 * Shared by the retention repositories (`purgeErrorLogs`,
 * `purgeProcessedCoexistStaging`) — not exported to the app layer, which owns
 * the schedule but not the SQL.
 *
 * Why every retention cron deletes in chunks rather than one statement: a single
 * `DELETE` over a large backlog holds row locks for its whole duration and
 * blocks the producers still inserting into the same table. `FOR UPDATE SKIP
 * LOCKED` on the inner select lets a chunk step over rows another transaction
 * already holds instead of waiting on them, and the pause between chunks gives
 * those producers a window to commit.
 */
type PurgedId = { id: string }

export type ChunkedPurgeStopReason = "drained" | "deadline" | "chunkCap"

export type ChunkedPurgeOptions = {
  /** Quoted table name, e.g. `"ErrorLog"`. */
  table: string
  /** Rows to consider, without the `WHERE` keyword. */
  where: SQL
  /** Column the oldest-first delete order is taken from. */
  orderBy: string
  chunkSize: number
  interChunkDelayMs: number
  /**
   * Hard stop on the number of chunks. On its own this bounds a run by
   * `chunkSize * maxChunks` rows; pair it with `maxRunDurationMs` when that
   * ceiling is high enough to be a runaway backstop rather than the real limit.
   */
  maxChunks: number
  /**
   * Wall-clock budget. Preferred over a low `maxChunks` for tables whose insert
   * rate can outrun a fixed per-run row cap — without it the cron falls behind
   * and the table never drains.
   */
  maxRunDurationMs?: number
}

/**
 * Deletes rows matching `where` in chunks, oldest first, until the backlog is
 * drained or a bound is hit.
 *
 * Returns `stopReason` so the caller can decide what a non-`drained` outcome
 * means for its table — repeated across runs it signals the table is growing
 * faster than retention can clear it.
 */
export async function chunkedPurge(
  options: ChunkedPurgeOptions,
): Promise<{ deleted: number; stopReason: ChunkedPurgeStopReason }> {
  const {
    table,
    where,
    orderBy,
    chunkSize,
    interChunkDelayMs,
    maxChunks,
    maxRunDurationMs,
  } = options

  const deadline =
    maxRunDurationMs === undefined ? undefined : Date.now() + maxRunDurationMs
  let deleted = 0

  for (let chunk = 0; ; chunk++) {
    if (chunk >= maxChunks) {
      return { deleted, stopReason: "chunkCap" }
    }

    const result = await db.execute<PurgedId>(sql`
      DELETE FROM ${sql.raw(`"${table}"`)}
      WHERE id IN (
        SELECT id FROM ${sql.raw(`"${table}"`)}
        WHERE ${where}
        ORDER BY ${sql.raw(`"${orderBy}"`)} ASC
        LIMIT ${chunkSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `)

    const count = result.rows.length
    deleted += count

    // A short chunk means nothing older is left to take.
    if (count < chunkSize) {
      return { deleted, stopReason: "drained" }
    }

    if (deadline !== undefined && Date.now() >= deadline) {
      return { deleted, stopReason: "deadline" }
    }

    await new Promise((resolve) => setTimeout(resolve, interChunkDelayMs))
  }
}
