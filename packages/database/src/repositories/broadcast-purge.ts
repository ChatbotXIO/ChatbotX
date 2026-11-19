import {
  type DatabaseClient,
  db,
  isStatementTimeoutError,
  setLocalStatementTimeout,
  sql,
} from "../client"
import { contactInfoCaptureRepository } from "./contact-info-capture"

/**
 * Composite-key chunked purge for `ContactOnBroadcast` recipient rows, driven
 * by the `schedule:purge-broadcasts` handler.
 *
 * `chunkedPurge` (`./chunked-purge.ts`) is NOT reusable here: it deletes via
 * `WHERE id IN (SELECT id ...)`, but `ContactOnBroadcast` has a composite
 * primary key `(broadcastId, contactId)` and no single `id` column. This
 * module mirrors its SKIP LOCKED chunking idiom instead of sharing code with
 * it.
 */

export type PurgeStopReason = "drained" | "deadline" | "chunkCap"

type PurgeableBroadcastRow = { id: string; workspaceId: string }

/**
 * Default chunk-count safety backstop for `purgeBroadcastRecipients` when
 * the caller doesn't override `maxChunks` (mirrors `ChunkedPurgeOptions`'s
 * `maxChunks`). `maxRunDurationMs` — checked at the top of every loop
 * iteration — is the intended primary bound; this cap only guards against a
 * stuck loop, e.g. a frozen or misbehaving clock that defeats the deadline
 * check. Chosen to sit well above any real deadline: even a generous
 * 4-minute caller budget at a 100ms inter-chunk delay tops out around 2,400
 * iterations, comfortably under this default.
 */
export const DEFAULT_PURGE_MAX_CHUNKS = 5000

/**
 * Candidate listing, NOT a row-level claim: the purge handler runs under the
 * `schedule:purge-broadcasts` distributed lock, which serializes runs, so a
 * double-run after a lost lock only wastes work (chunk deletes use SKIP
 * LOCKED, `hardDeleteBroadcast` pins `deletedAt IS NOT NULL` so the loser
 * matches 0 rows). `status <> 'sending'` is defense-in-depth against the C1
 * promotion race.
 */
export async function listPurgeableBroadcasts(
  limit: number,
): Promise<PurgeableBroadcastRow[]> {
  const result = await db.execute<PurgeableBroadcastRow>(sql`
    SELECT "id", "workspaceId" FROM "Broadcast"
    WHERE "deletedAt" IS NOT NULL AND "status" <> 'sending'
    ORDER BY "deletedAt" ASC, "id" ASC
    LIMIT ${limit}
  `)

  return result.rows
}

type ChunkedPurgeOptions = {
  chunkSize: number
  interChunkDelayMs: number
  maxChunks: number
  maxRunDurationMs: number
}

/**
 * The shared chunk loop: the deadline is checked before every chunk, each
 * chunk runs in its own transaction capped at the time left (a statement
 * timeout ends the run as `deadline`), a short chunk means `drained`, and the
 * loop sleeps between chunks up to `maxChunks`. `deleteChunk` runs one bounded
 * delete and returns how many rows it removed.
 */
async function runChunkedPurge(
  options: ChunkedPurgeOptions,
  deleteChunk: (tx: DatabaseClient) => Promise<number>,
): Promise<{ deleted: number; stopReason: PurgeStopReason }> {
  const { chunkSize, interChunkDelayMs, maxChunks, maxRunDurationMs } = options
  const deadline = Date.now() + maxRunDurationMs
  let deleted = 0

  for (let chunk = 0; chunk < maxChunks; chunk++) {
    // Checked BEFORE starting the chunk: a spent budget must stop the run
    // here, not after one more DELETE has already run past it.
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      return { deleted, stopReason: "deadline" }
    }

    // SKIP LOCKED skips locked rows, not a table lock (e.g. a migration), so
    // the chunk is also capped at the time left: a DELETE blocked in Postgres
    // must not hold the caller's worker slot past its budget.
    let count: number
    try {
      count = await db.transaction(async (tx) => {
        await setLocalStatementTimeout(tx, `${remainingMs}ms`)
        return await deleteChunk(tx)
      })
    } catch (error) {
      if (isStatementTimeoutError(error)) {
        return { deleted, stopReason: "deadline" }
      }
      throw error
    }

    deleted += count

    // A short chunk means nothing claimable is left.
    if (count < chunkSize) {
      return { deleted, stopReason: "drained" }
    }

    await new Promise((resolve) => setTimeout(resolve, interChunkDelayMs))
  }

  return { deleted, stopReason: "chunkCap" }
}

/**
 * Deletes `ContactOnBroadcast` rows for one broadcast in chunks, oldest
 * `contactId` first, until drained, the wall-clock deadline is hit, or the
 * chunk cap is hit.
 *
 * The deadline is checked at the TOP of every iteration — before a chunk's
 * `DELETE` starts, not only after one finishes — so `maxRunDurationMs` is a
 * hard ceiling on when the last chunk may START, not a soft target a chunk
 * can run past. `maxChunks` (default `DEFAULT_PURGE_MAX_CHUNKS`) is a
 * secondary, caller-tunable safety backstop for a stuck loop (e.g. a frozen
 * clock defeating the deadline check) — the deadline remains the intended
 * primary bound.
 *
 * `drained` from a short final chunk is NOT proof the table is empty for
 * this broadcast: `FOR UPDATE SKIP LOCKED` steps over rows another
 * transaction currently holds, so a short/empty chunk can mean "nothing
 * claimable right now", not "nothing left". Callers must confirm with
 * `hasBroadcastRecipients` before treating `drained` as empty (and only on
 * the drained path — never on `deadline`/`chunkCap` exits). A cascade-vs-
 * chunk deadlock with a concurrent FK cascade is theoretically possible;
 * Postgres resolves it and the loser retries next tick.
 */
export async function purgeBroadcastRecipients(input: {
  broadcastId: string
  chunkSize: number
  interChunkDelayMs: number
  maxRunDurationMs: number
  maxChunks?: number
  /**
   * Delete only while the broadcast is still a draft, checked inside every
   * chunk's statement: a background cleanup of a draft's leftover recipients
   * must never touch the fresh audience of a broadcast re-scheduled meanwhile.
   */
  onlyWhileDraft?: boolean
}): Promise<{ deleted: number; stopReason: PurgeStopReason }> {
  const {
    broadcastId,
    chunkSize,
    interChunkDelayMs,
    maxRunDurationMs,
    maxChunks = DEFAULT_PURGE_MAX_CHUNKS,
    onlyWhileDraft = false,
  } = input
  const draftGuard = onlyWhileDraft
    ? sql` AND EXISTS (
      SELECT 1 FROM "Broadcast" WHERE "id" = ${broadcastId} AND "status" = 'draft'
    )`
    : sql``

  return await runChunkedPurge(
    { chunkSize, interChunkDelayMs, maxChunks, maxRunDurationMs },
    async (tx) => {
      const result = await tx.execute(sql`
    DELETE FROM "ContactOnBroadcast"
    WHERE ("broadcastId", "contactId") IN (
      SELECT "broadcastId", "contactId" FROM "ContactOnBroadcast"
      WHERE "broadcastId" = ${broadcastId}${draftGuard}
      ORDER BY "contactId" ASC
      LIMIT ${chunkSize}
      FOR UPDATE SKIP LOCKED
    )
  `)
      return result.rowCount ?? 0
    },
  )
}

/**
 * EXISTS-style probe for whether any recipient rows remain for a broadcast.
 * O(1), deliberately not a `COUNT` — that would full-scan a million-row
 * undrained broadcast every 5-minute tick. A plain `SELECT` (no locking
 * hint) sees locked-but-live rows, so a chunk currently held by another
 * transaction correctly blocks the hard delete.
 */
export async function hasBroadcastRecipients(
  broadcastId: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM "ContactOnBroadcast" WHERE "broadcastId" = ${broadcastId} LIMIT 1
  `)

  return result.rows.length > 0
}

/**
 * Deletes a broadcast's `ContactInfoCapture` rows in primary-key chunks until
 * drained, the wall-clock deadline is hit, or the chunk cap is hit — the same
 * deadline/chunk-cap contract as `purgeBroadcastRecipients`, so a caller can
 * share one budget between the two. The table has no FK to `Broadcast`, so it
 * is drained here rather than by a cascade. `onlyWhileDraft` is checked inside
 * every chunk's statement.
 *
 * `drained` is not proof the source is empty (a capture may commit later);
 * `hardDeleteBroadcast` re-checks under the Broadcast row lock.
 */
export async function purgeBroadcastCaptures(input: {
  broadcastId: string
  chunkSize: number
  interChunkDelayMs: number
  maxRunDurationMs: number
  workspaceId: string
  maxChunks?: number
  onlyWhileDraft?: boolean
}): Promise<{ deleted: number; stopReason: PurgeStopReason }> {
  const {
    broadcastId,
    chunkSize,
    interChunkDelayMs,
    maxRunDurationMs,
    workspaceId,
    maxChunks = DEFAULT_PURGE_MAX_CHUNKS,
    onlyWhileDraft = false,
  } = input

  // Same guard as the recipients' purge: captures go only while the broadcast
  // is still a draft, so a re-scheduled broadcast's new captures are never hit.
  const draftGuard = onlyWhileDraft
    ? sql`EXISTS (
        SELECT 1 FROM "Broadcast" WHERE "id" = ${broadcastId} AND "status" = 'draft'
      )`
    : undefined

  return await runChunkedPurge(
    { chunkSize, interChunkDelayMs, maxChunks, maxRunDurationMs },
    (tx) =>
      contactInfoCaptureRepository.deleteSourceBatch(
        {
          workspaceId,
          sourceType: "broadcast",
          sourceId: broadcastId,
          limit: chunkSize,
          extraWhere: draftGuard,
        },
        tx,
      ),
  )
}

/**
 * Hard-deletes a `Broadcast` row. The `deletedAt IS NOT NULL AND status <>
 * 'sending'` predicate is re-checked here (not only by the caller) so the
 * delete itself can never fire against a broadcast that was undeleted or
 * started sending between the caller's checks and this statement.
 *
 * `ContactInfoCapture` has no FK, so the row is first locked `FOR UPDATE` —
 * a capture write holds it `FOR SHARE`, so it either committed before this
 * lock (and is seen by the re-check below, which keeps the broadcast for the
 * next tick) or waits and then finds the broadcast deleted. All in one
 * transaction.
 */
export async function hardDeleteBroadcast(input: {
  broadcastId: string
  workspaceId: string
}): Promise<boolean> {
  const { broadcastId, workspaceId } = input

  return await db.transaction(async (tx) => {
    const locked = await tx.execute<{ id: string }>(sql`
      SELECT "id" FROM "Broadcast"
      WHERE "id" = ${broadcastId} AND "workspaceId" = ${workspaceId}::bigint
        AND "deletedAt" IS NOT NULL AND "status" <> 'sending'
      FOR UPDATE
    `)
    if (locked.rows.length === 0) {
      return false
    }

    const hasCaptures = await contactInfoCaptureRepository.existsForSource(
      { workspaceId, sourceType: "broadcast", sourceId: broadcastId },
      tx,
    )
    if (hasCaptures) {
      return false
    }

    const result = await tx.execute<{ id: string }>(sql`
      DELETE FROM "Broadcast"
      WHERE "id" = ${broadcastId} AND "workspaceId" = ${workspaceId}::bigint
        AND "deletedAt" IS NOT NULL AND "status" <> 'sending'
      RETURNING "id"
    `)

    return result.rows.length > 0
  })
}
