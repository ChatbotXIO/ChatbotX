import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  lte,
  sql,
} from "../../client"
import type { ConnectSessionOutcome } from "../../partials/connect-session"
import type { ConnectSessionStatus } from "../../partials/connection"
import { connectSessionModel } from "../../schema"
import type { ConnectSessionModel } from "../../types"
import { type ChunkedPurgeStopReason, chunkedPurge } from "../chunked-purge"

/**
 * `sql` tagged-template interpolation of a bare JS array splats it into N
 * comma-separated placeholders (drizzle's `IN (...)` convenience) — not a
 * single `text[]`-typed parameter. Encoding it as a Postgres array literal
 * string first (`{"a","b"}`) lets `::text[]` bind it as one parameter, the
 * shape `array_cat`/`array_append` below actually need.
 */
const toPgTextArrayLiteral = (values: string[]): string =>
  `{${values.map((value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`

export const connectSessionRepository = {
  async findByIdForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    return await tx.query.connectSessionModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  },

  /**
   * Unscoped lookup by primary key — for internal service methods
   * (`attachAuthorization`, `claimTarget`, `recordResults`, …) operating on
   * a session already resolved via `findByNonce` earlier in the same flow,
   * where the caller has no independently-verified `workspaceId` to scope
   * by (the session row itself IS the source of truth for which workspace
   * it belongs to).
   */
  async findById(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    return await tx.query.connectSessionModel.findFirst({
      where: { id: input.id },
    })
  },

  /** `stateNonceHash` is globally unique — the OAuth callback resolves a session by it alone, before it knows the workspace. */
  async findByStateNonceHash(
    input: { stateNonceHash: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    return await tx.query.connectSessionModel.findFirst({
      where: { stateNonceHash: input.stateNonceHash },
    })
  },

  /**
   * Enforces the per-workspace pending-session cap
   * (`ConnectSessionService.create`) — counts sessions still in an active
   * (non-terminal) status AND not yet past `expiresAt`. Without the
   * `expiresAt` filter, sessions abandoned mid-flow would count against the
   * cap until the `purgeExpired` cron catches up to them, even though every
   * reader already treats a past-`expiresAt` row as expired regardless of
   * its stored status.
   */
  async countActiveByWorkspaceId(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      connectSessionModel,
      and(
        eq(connectSessionModel.workspaceId, input.workspaceId),
        sql`${connectSessionModel.status} IN ('pending', 'authorized', 'awaiting_selection')`,
        sql`${connectSessionModel.expiresAt} > now()`,
      ),
    )
  },

  async insert(
    values: typeof connectSessionModel.$inferInsert,
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel> {
    const [row] = await tx
      .insert(connectSessionModel)
      .values(values)
      .returning()
    return row
  },

  async update(
    input: {
      id: string
      values: Partial<typeof connectSessionModel.$inferInsert>
    },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const [row] = await tx
      .update(connectSessionModel)
      .set(input.values)
      .where(eq(connectSessionModel.id, input.id))
      .returning()
    return row
  },

  /**
   * Same as `update`, additionally guarded to only affect a session whose
   * CURRENT `status` is in `input.statuses` — `fail`/`cancel` pass the
   * active (non-terminal) statuses so a replayed/duplicate terminal call
   * (e.g. an OAuth callback's `?error=` replayed after the session already
   * completed) can never flip an already-terminal session. Returns
   * `undefined`, never throws, when the guard doesn't match — the caller
   * decides whether that means "not found" or "already terminal, no-op".
   */
  async updateWhereStatusIn(
    input: {
      id: string
      values: Partial<typeof connectSessionModel.$inferInsert>
      statuses: ConnectSessionStatus[]
    },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const [row] = await tx
      .update(connectSessionModel)
      .set(input.values)
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          inArray(connectSessionModel.status, input.statuses),
        ),
      )
      .returning()
    return row
  },

  /**
   * Same as `updateWhereStatusIn`, additionally guarded on `expiresAt >
   * now()` — for a write that must never land on a session that is
   * ALREADY past its TTL but hasn't been lazily flipped to `expired` yet
   * (the lazy-expiry read path, `ConnectSessionService.applyExpiryRule`,
   * only runs on a read; nothing guarantees a read has happened between a
   * session going stale and this write). Without the extra guard,
   * `attachAuthorization` could "revive" a session a concurrent
   * cancel/expire raced past its TTL back into `awaiting_selection`, since
   * its stored `status` would still read as one of the active statuses.
   */
  async updateWhereActive(
    input: {
      id: string
      values: Partial<typeof connectSessionModel.$inferInsert>
      statuses: ConnectSessionStatus[]
    },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const [row] = await tx
      .update(connectSessionModel)
      .set(input.values)
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          inArray(connectSessionModel.status, input.statuses),
          gt(connectSessionModel.expiresAt, sql`now()`),
        ),
      )
      .returning()
    return row
  },

  /**
   * Bulk-flips every active session past `expiresAt` to `expired` in ONE
   * statement — not the per-row loop this replaced, which issued one
   * `UPDATE` per expired session (N+1) — and clears `encryptedAuth`: the
   * decrypted-candidate ciphertext has no further use once the session can
   * no longer be acted on and must not linger indefinitely. Returns the
   * number of rows flipped.
   */
  async expireDue(
    input: { before: Date; statuses: ConnectSessionStatus[] },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(connectSessionModel)
      .set({
        status: "expired",
        consumedAt: sql`now()`,
        encryptedAuth: null,
      })
      .where(
        and(
          inArray(connectSessionModel.status, input.statuses),
          lte(connectSessionModel.expiresAt, input.before),
        ),
      )
      .returning({ id: connectSessionModel.id })
    return rows.length
  },

  /**
   * Deletes terminal `ConnectSession` rows (`completed`/`failed`/
   * `expired`/`cancelled`, via `consumedAt` being set at all) past
   * `retentionDays` — the row otherwise never leaves the table once
   * terminal, unlike every other retention-swept table in this codebase.
   * Chunked, oldest first, via the shared `chunkedPurge` (see its
   * docstring for why: a single large `DELETE` would hold row locks for
   * its whole duration and block a concurrent `ConnectSession` insert).
   */
  purgeOldTerminal(options: {
    retentionDays: number
    chunkSize: number
    interChunkDelayMs: number
    maxChunks: number
    maxRunDurationMs?: number
  }): Promise<{ deleted: number; stopReason: ChunkedPurgeStopReason }> {
    const { retentionDays, ...bounds } = options
    return chunkedPurge({
      table: "ConnectSession",
      where: sql`"consumedAt" IS NOT NULL AND "consumedAt" < NOW() - make_interval(days => ${retentionDays})`,
      orderBy: "consumedAt",
      ...bounds,
    })
  },

  /**
   * Atomic claim of one target id into `claimedTargetIds` — the `WHERE NOT
   * (targetId = ANY(...))` clause makes this a compare-and-set at the DB
   * level, so two concurrent `connectTargets` calls racing on the same
   * target can never both win (the loser sees `claimTarget` return `false`
   * and maps that to a `duplicated` outcome instead of double-connecting).
   */
  async claimTarget(
    input: { id: string; targetId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const [row] = await tx
      .update(connectSessionModel)
      .set({
        claimedTargetIds: sql`array_append(${connectSessionModel.claimedTargetIds}, ${input.targetId})`,
      })
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          sql`NOT (${input.targetId} = ANY(${connectSessionModel.claimedTargetIds}))`,
        ),
      )
      .returning({ id: connectSessionModel.id })
    return Boolean(row)
  },

  /** Releases a target `claimTarget` claimed whose connect attempt did not end in `connected` — `array_remove` so a retry can claim (and actually connect) it again instead of permanently seeing `duplicated`. No-ops (never throws) when the target isn't currently claimed. */
  async releaseTarget(
    input: { id: string; targetId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(connectSessionModel)
      .set({
        claimedTargetIds: sql`array_remove(${connectSessionModel.claimedTargetIds}, ${input.targetId})`,
      })
      .where(eq(connectSessionModel.id, input.id))
  },

  /**
   * Atomic, guarded merge of a `connectTargets` batch's outcomes — the
   * single-statement replacement for a read-then-write `recordResults`
   * (which lost updates under concurrent batches and could mark a session
   * `completed` from an unrelated reader's stale snapshot). Every
   * expression below reads the PRE-update row consistently (standard SQL
   * `UPDATE` semantics), so this is correct without a surrounding
   * transaction or row lock of its own:
   * - `results`/`resultConnectionIds` accumulate via `||`/`array_cat`.
   * - Completion counts DISTINCT `targetId`s across the merged results,
   *   restricted to ids the session's `targets` still mark `selectable`
   *   (`selectableTargetIds`) — against the session's own count of
   *   selectable targets. Without that restriction an outcome for an
   *   unknown id or one already `selectable: false` (never offered to
   *   connect) would inflate the numerator just like a real target,
   *   completing the session before every real target had a result and
   *   clearing `encryptedAuth` out from under the ones never attempted.
   * - The terminal status is `completed` only if at least one *selectable*
   *   outcome is NOT `failed`/`limitReached`; a non-selectable id's
   *   `duplicated` outcome does not count as that success, and an
   *   all-failed/all-limitReached batch terminates `failed` instead, with
   *   a generic `errorCode` set.
   * - Guarded by `status = 'awaiting_selection'` in the `WHERE`: a session
   *   already terminal (completed by a concurrent call, or replayed after
   *   `fail`/`cancel`) updates 0 rows — the caller sees `undefined` rather
   *   than a second, inconsistent terminal transition.
   */
  async appendResults(
    input: {
      id: string
      results: ConnectSessionOutcome[]
      resultConnectionIds: string[]
    },
    tx: DatabaseClient = db,
  ): Promise<ConnectSessionModel | undefined> {
    const newResults = sql`${JSON.stringify(input.results)}::jsonb`
    const mergedResults = sql`(${connectSessionModel.results} || ${newResults})`
    const selectableTargetCount = sql`(SELECT count(*) FROM jsonb_array_elements(${connectSessionModel.targets}) AS t WHERE (t->>'selectable')::boolean)`
    // Restricted to ids the session actually offered as `selectable` — an
    // unknown id (not in `targets` at all) or one already marked
    // `selectable: false` was never real progress toward
    // `selectableTargetCount`, so it must not advance `distinctResultCount`
    // (regression: submitting one real id alongside one non-selectable/
    // unknown id used to complete the session before every real target had
    // an outcome, nulling `encryptedAuth` out from under the targets that
    // were never attempted). The same filter applies to `hasSuccess` — a
    // `duplicated` outcome for a non-selectable id must not count as the
    // "at least one success" that flips the batch to `completed`.
    const selectableTargetIds = sql`(SELECT t->>'id' FROM jsonb_array_elements(${connectSessionModel.targets}) AS t WHERE (t->>'selectable')::boolean)`
    const distinctResultCount = sql`(SELECT count(DISTINCT elem->>'targetId') FROM jsonb_array_elements(${mergedResults}) AS elem WHERE elem->>'targetId' IN ${selectableTargetIds})`
    const hasSuccess = sql`(SELECT bool_or(elem2->>'status' NOT IN ('failed', 'limitReached')) FROM jsonb_array_elements(${mergedResults}) AS elem2 WHERE elem2->>'targetId' IN ${selectableTargetIds})`
    const isComplete = sql`(${distinctResultCount} >= ${selectableTargetCount})`

    const [row] = await tx
      .update(connectSessionModel)
      .set({
        results: mergedResults,
        resultConnectionIds: sql`array_cat(${connectSessionModel.resultConnectionIds}, ${toPgTextArrayLiteral(input.resultConnectionIds)}::text[])`,
        status: sql`CASE WHEN NOT ${isComplete} THEN ${connectSessionModel.status} WHEN ${hasSuccess} THEN 'completed' ELSE 'failed' END`,
        step: sql`CASE WHEN ${isComplete} THEN 'done' ELSE ${connectSessionModel.step} END`,
        consumedAt: sql`CASE WHEN ${isComplete} THEN now() ELSE ${connectSessionModel.consumedAt} END`,
        errorCode: sql`CASE WHEN ${isComplete} AND NOT ${hasSuccess} THEN 'provider_error' ELSE ${connectSessionModel.errorCode} END`,
        // The decrypted-candidate ciphertext has no further use once the
        // session reaches a terminal status — see `expireDue`/`fail`/
        // `cancel` for the other three terminal paths that also clear it.
        encryptedAuth: sql`CASE WHEN ${isComplete} THEN NULL ELSE ${connectSessionModel.encryptedAuth} END`,
      })
      .where(
        and(
          eq(connectSessionModel.id, input.id),
          eq(connectSessionModel.status, "awaiting_selection"),
        ),
      )
      .returning()
    return row
  },
}
