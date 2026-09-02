import { db, sql } from "../client"

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

type PurgeableBroadcastRow = { id: string }
type PurgedContactRow = { contactId: string }

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
    SELECT "id" FROM "Broadcast"
    WHERE "deletedAt" IS NOT NULL AND "status" <> 'sending'
    ORDER BY "deletedAt" ASC, "id" ASC
    LIMIT ${limit}
  `)

  return result.rows
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
}): Promise<{ deleted: number; stopReason: PurgeStopReason }> {
  const {
    broadcastId,
    chunkSize,
    interChunkDelayMs,
    maxRunDurationMs,
    maxChunks = DEFAULT_PURGE_MAX_CHUNKS,
  } = input
  const deadline = Date.now() + maxRunDurationMs
  let deleted = 0

  for (let chunk = 0; chunk < maxChunks; chunk++) {
    // Checked BEFORE starting the chunk: a spent budget must stop the run
    // here, not after one more DELETE has already run past it.
    if (Date.now() >= deadline) {
      return { deleted, stopReason: "deadline" }
    }

    const result = await db.execute<PurgedContactRow>(sql`
    DELETE FROM "ContactOnBroadcast"
    WHERE ("broadcastId", "contactId") IN (
      SELECT "broadcastId", "contactId" FROM "ContactOnBroadcast"
      WHERE "broadcastId" = ${broadcastId}
      ORDER BY "contactId" ASC
      LIMIT ${chunkSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "contactId"
  `)

    const count = result.rows.length
    deleted += count

    // A short chunk means nothing claimable is left for this broadcast.
    if (count < chunkSize) {
      return { deleted, stopReason: "drained" }
    }

    await new Promise((resolve) => setTimeout(resolve, interChunkDelayMs))
  }

  return { deleted, stopReason: "chunkCap" }
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
 * Hard-deletes a `Broadcast` row. The `deletedAt IS NOT NULL AND status <>
 * 'sending'` predicate is re-checked here (not only by the caller) so the
 * delete itself can never fire against a broadcast that was undeleted or
 * started sending between the caller's checks and this statement.
 */
export async function hardDeleteBroadcast(
  broadcastId: string,
): Promise<boolean> {
  const result = await db.execute<{ id: string }>(sql`
    DELETE FROM "Broadcast"
    WHERE "id" = ${broadcastId} AND "deletedAt" IS NOT NULL AND "status" <> 'sending'
    RETURNING "id"
  `)

  return result.rows.length > 0
}
