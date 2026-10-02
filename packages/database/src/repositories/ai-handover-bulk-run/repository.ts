import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  notExists,
  or,
  sql,
} from "../../client"
import {
  AI_HANDOVER_BULK_LIVE_STATUSES,
  type AiHandoverBulkAction,
  type AiHandoverBulkStatus,
  type AiHandoverChannel,
  inboxStatuses,
} from "../../partials"
import {
  aiHandoverBulkRunModel,
  aiHandoverSettingsModel,
  inboxModel,
} from "../../schema"
import type { AiHandoverBulkRunModel } from "../../types"
import { getPaginationWithDefaults } from "../../utils"

/** A claim holder's proof of ownership; every guarded write carries it. */
export type AiHandoverBulkRunGuard = { claimToken: string }

/** A Page, always scoped by its workspace so an id alone never crosses tenants. */
export type AiHandoverBulkRunInboxRef = {
  workspaceId: string
  inboxId: string
}

export type CreateAiHandoverBulkRunInput = AiHandoverBulkRunInboxRef & {
  channel: AiHandoverChannel
  /** The `AiHandoverSettings.applyToAllRevision` this run serves. */
  revision: number
  action: AiHandoverBulkAction
  message: string | null
  requestedByUserId: string | null
  requestedAt: Date
}

/** Cursor / marker patch; `undefined` leaves a column alone, `null` clears it. */
export type AiHandoverBulkRunProgressInput = {
  addProcessed?: number
  addSkipped?: number
  addFailed?: number
  cursorContactInboxId?: string | null
  inFlightFromId?: string | null
  inFlightToId?: string | null
  totalCount?: number
  /** A reason worth showing next to a run that is still going (e.g. a Page was skipped). */
  currentError?: string
}

export type FinishAiHandoverBulkRunInput = {
  status: Extract<AiHandoverBulkStatus, "completed" | "failed" | "cancelled">
  currentError?: string | null
  totalCount?: number
}

export type PickedAiHandoverBulkRun = Pick<
  AiHandoverBulkRunModel,
  "id" | "workspaceId" | "attempts" | "chunkSeq" | "status"
>

// Read lazily (never at module scope): a suite that mocks
// `@chatbotx.io/database/client` narrowly must still be able to import this file.

/** A released continuation nobody re-claimed within this is a lost enqueue. */
const releasedStaleInterval = () => sql`INTERVAL '1 minute'`
/** Above the integration queue's lock duration, so a live chunk is never stolen. */
const leaseStaleInterval = () => sql`INTERVAL '15 minutes'`

const liveStatusList = () =>
  sql.join(
    AI_HANDOVER_BULK_LIVE_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  )

/** The pause (if any) is over; a cancel never waits for it. */
const pauseElapsed = () =>
  sql`(${aiHandoverBulkRunModel.pausedUntil} IS NULL
    OR ${aiHandoverBulkRunModel.pausedUntil} <= NOW()
    OR ${aiHandoverBulkRunModel.status} = 'cancelling')`

/**
 * The cancel write. A run nobody holds ends `cancelled` on the spot; a claimed
 * one becomes `cancelling` for its worker to wind down. The enum casts matter:
 * a bare string literal in `CASE` is `text`, which Postgres will not assign to
 * the status enum.
 */
const cancelPatch = () => ({
  status: sql`CASE WHEN ${aiHandoverBulkRunModel.status} = 'pending'
      OR ${aiHandoverBulkRunModel.claimToken} IS NULL
    THEN 'cancelled'::"aiHandoverBulkStatus"
    ELSE 'cancelling'::"aiHandoverBulkStatus" END`,
  finishedAt: sql`CASE WHEN ${aiHandoverBulkRunModel.status} = 'pending'
      OR ${aiHandoverBulkRunModel.claimToken} IS NULL
    THEN NOW() ELSE ${aiHandoverBulkRunModel.finishedAt} END`,
  pausedUntil: null,
  updatedAt: new Date(),
})

const settledCount = (progress: AiHandoverBulkRunProgressInput): number =>
  (progress.addProcessed ?? 0) +
  (progress.addSkipped ?? 0) +
  (progress.addFailed ?? 0)

const guardedRun = (runId: string, guard: AiHandoverBulkRunGuard) =>
  and(
    eq(aiHandoverBulkRunModel.id, runId),
    inArray(aiHandoverBulkRunModel.status, ["running", "cancelling"]),
    eq(aiHandoverBulkRunModel.claimToken, guard.claimToken),
  )

export const aiHandoverBulkRunRepository = {
  /**
   * Inserts a `pending` run for a revision, or returns `null` when the Page
   * already has a live run or already ran this revision (the two unique
   * indexes decide, so concurrent reconcilers cannot both win). Every column is
   * written explicitly.
   */
  async createForRevision(
    input: CreateAiHandoverBulkRunInput,
    tx: DatabaseClient = db,
  ): Promise<AiHandoverBulkRunModel | null> {
    const [row] = await tx
      .insert(aiHandoverBulkRunModel)
      .values({
        workspaceId: input.workspaceId,
        inboxId: input.inboxId,
        channel: input.channel,
        revision: input.revision,
        action: input.action,
        status: "pending",
        message: input.message,
        requestedByUserId: input.requestedByUserId,
        requestedAt: input.requestedAt,
        startedAt: null,
        finishedAt: null,
        lastHeartbeatAt: null,
        pausedUntil: null,
        claimToken: null,
        attempts: 0,
        chunkSeq: 0,
        totalCount: null,
        processedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        cursorContactInboxId: null,
        inFlightFromId: null,
        inFlightToId: null,
        currentError: null,
      })
      // Targetless: a partial unique index cannot be a `target` without
      // repeating its predicate.
      .onConflictDoNothing()
      .returning()
    return row ?? null
  },

  /**
   * Pages a run is DUE for: their latest desired-state revision has no run yet,
   * the Page is connected, no run holds it, and an ON has a switched-on
   * automation behind it. Pages that must wait (disconnected, still winding
   * down, automation off) are left out. The sweeper hands these to `reconcile`
   * (the authority, which re-checks under the row lock).
   *
   * Keyset-paginated by Page id (`afterInboxId`): the SQL cannot see a schedule
   * window, so some listed Pages are still not due, and a fixed order would let
   * them head the list for hours. The sweeper walks the pages in turn and wraps
   * around, so every Page is reached.
   */
  async listInboxesAwaitingRun(
    input: { limit: number; afterInboxId?: string | null },
    tx: DatabaseClient = db,
  ): Promise<AiHandoverBulkRunInboxRef[]> {
    return await tx
      .select({
        workspaceId: aiHandoverSettingsModel.workspaceId,
        inboxId: aiHandoverSettingsModel.inboxId,
      })
      .from(aiHandoverSettingsModel)
      .innerJoin(inboxModel, eq(inboxModel.id, aiHandoverSettingsModel.inboxId))
      .where(
        and(
          gt(aiHandoverSettingsModel.applyToAllRevision, 0),
          eq(inboxModel.status, inboxStatuses.enum.connected),
          input.afterInboxId
            ? gt(aiHandoverSettingsModel.inboxId, input.afterInboxId)
            : undefined,
          or(
            eq(aiHandoverSettingsModel.applyToAllCustomers, false),
            eq(aiHandoverSettingsModel.enabled, true),
          ),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(aiHandoverBulkRunModel)
              .where(
                and(
                  eq(
                    aiHandoverBulkRunModel.inboxId,
                    aiHandoverSettingsModel.inboxId,
                  ),
                  or(
                    eq(
                      aiHandoverBulkRunModel.revision,
                      aiHandoverSettingsModel.applyToAllRevision,
                    ),
                    inArray(
                      aiHandoverBulkRunModel.status,
                      AI_HANDOVER_BULK_LIVE_STATUSES,
                    ),
                  ),
                ),
              ),
          ),
        ),
      )
      .orderBy(aiHandoverSettingsModel.inboxId)
      .limit(input.limit)
  },

  /** The run that served a desired-state revision, if one was ever created. */
  async findByRevision(
    input: AiHandoverBulkRunInboxRef & { revision: number },
    tx: DatabaseClient = db,
  ): Promise<AiHandoverBulkRunModel | null> {
    const row = await tx.query.aiHandoverBulkRunModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        inboxId: input.inboxId,
        revision: input.revision,
      },
    })
    return row ?? null
  },

  async listHistory(
    input: AiHandoverBulkRunInboxRef & { page?: number; perPage?: number },
    tx: DatabaseClient = db,
  ) {
    const where = { workspaceId: input.workspaceId, inboxId: input.inboxId }
    const pagination = getPaginationWithDefaults(input)
    const [data, total] = await Promise.all([
      tx.query.aiHandoverBulkRunModel.findMany({
        where,
        orderBy: { createdAt: "desc" },
        with: {
          requestedBy: { columns: { id: true, name: true, email: true } },
        },
        ...pagination,
      }),
      tx.$count(
        aiHandoverBulkRunModel,
        and(
          eq(aiHandoverBulkRunModel.workspaceId, input.workspaceId),
          eq(aiHandoverBulkRunModel.inboxId, input.inboxId),
        ),
      ),
    ])
    return { data, pageCount: Math.ceil(total / pagination.limit) }
  },

  /**
   * Claims a run for THIS worker and mints a fresh token. Only a `pending` run,
   * or a `running` / `cancelling` one that is released (no token) or whose
   * lease is stale, can be claimed: a terminal run is never reopened by a stale
   * job. A paused run (`pausedUntil` in the future) cannot be claimed until the
   * pause ends, except a `cancelling` one, which must be wound down at once. A
   * `cancelling` run keeps its status so the engine can wind it down.
   * `startedAt` is COALESCEd so the first chunk's start survives resumes.
   */
  async claim(
    input: { runId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<AiHandoverBulkRunModel | null> {
    const [row] = await tx
      .update(aiHandoverBulkRunModel)
      .set({
        status: sql`CASE WHEN ${aiHandoverBulkRunModel.status} = 'pending' THEN 'running'::"aiHandoverBulkStatus" ELSE ${aiHandoverBulkRunModel.status} END`,
        // Web Crypto: reachable from a Next Server Component too.
        claimToken: crypto.randomUUID(),
        pausedUntil: null,
        startedAt: sql`COALESCE(${aiHandoverBulkRunModel.startedAt}, NOW())`,
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiHandoverBulkRunModel.id, input.runId),
          // A job for another workspace must not take (and strand) the lease.
          eq(aiHandoverBulkRunModel.workspaceId, input.workspaceId),
          inArray(
            aiHandoverBulkRunModel.status,
            AI_HANDOVER_BULK_LIVE_STATUSES,
          ),
          pauseElapsed(),
          sql`(
            ${aiHandoverBulkRunModel.status} = 'pending'
            OR ${aiHandoverBulkRunModel.claimToken} IS NULL
            OR ${aiHandoverBulkRunModel.lastHeartbeatAt} < NOW() - ${leaseStaleInterval()}
          )`,
        ),
      )
      .returning()
    return row ?? null
  },

  /**
   * Guarded progress write: counters are incremented in SQL (never
   * read-modify-write), cursors and in-flight markers are replaced, and the
   * heartbeat is bumped. Returns the run's status after the write, or `null`
   * when it landed on no row: the claim was lost or the run is no longer live,
   * so the caller must abandon. A `cancelling` status tells the claim holder to
   * wind the run down.
   */
  async recordProgress(
    input: {
      runId: string
      expect: AiHandoverBulkRunGuard
      progress: AiHandoverBulkRunProgressInput
    },
    tx: DatabaseClient = db,
  ): Promise<Extract<AiHandoverBulkStatus, "running" | "cancelling"> | null> {
    const { progress } = input
    const [row] = await tx
      .update(aiHandoverBulkRunModel)
      .set({
        processedCount: sql`${aiHandoverBulkRunModel.processedCount} + ${progress.addProcessed ?? 0}`,
        skippedCount: sql`${aiHandoverBulkRunModel.skippedCount} + ${progress.addSkipped ?? 0}`,
        failedCount: sql`${aiHandoverBulkRunModel.failedCount} + ${progress.addFailed ?? 0}`,
        ...(progress.cursorContactInboxId !== undefined && {
          cursorContactInboxId: progress.cursorContactInboxId,
        }),
        ...(progress.inFlightFromId !== undefined && {
          inFlightFromId: progress.inFlightFromId,
        }),
        ...(progress.inFlightToId !== undefined && {
          inFlightToId: progress.inFlightToId,
        }),
        ...(progress.totalCount !== undefined && {
          totalCount: progress.totalCount,
        }),
        ...(progress.currentError !== undefined && {
          currentError: progress.currentError,
        }),
        // Real progress (threads settled) resets the sweeper's retry budget: it
        // counts consecutive dispatches WITHOUT progress, not the lifetime of a
        // long run. A marker or cursor write alone is not progress, or a run
        // whose every call fails would never run out of attempts.
        ...(settledCount(progress) > 0 && { attempts: 0 }),
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(guardedRun(input.runId, input.expect))
      .returning({ status: aiHandoverBulkRunModel.status })
    return row ? (row.status as "running" | "cancelling") : null
  },

  /**
   * Releases the lease while the run stays live, and advances the continuation
   * revision (it makes the next chunk's job id unique). Returns the new
   * revision, or `null` when the guard failed (claim taken over): the caller
   * must not enqueue a continuation then.
   *
   * `pausedUntil` parks the run (the channel asked to wait out its quota):
   * `claim`, `reopenReleased` and the sweeper all leave it alone until then,
   * while the delayed continuation job resumes it.
   */
  async yieldForContinuation(
    input: {
      runId: string
      expect: AiHandoverBulkRunGuard
      pausedUntil?: Date
    },
    tx: DatabaseClient = db,
  ): Promise<number | null> {
    const [row] = await tx
      .update(aiHandoverBulkRunModel)
      .set({
        claimToken: null,
        chunkSeq: sql`${aiHandoverBulkRunModel.chunkSeq} + 1`,
        pausedUntil: input.pausedUntil ?? null,
        // A quota pause is a deliberate wait, not a failed dispatch: it never
        // burns the sweeper's retry budget, or a Page that keeps hitting its
        // quota (nothing settles in between) would eventually be failed for it.
        ...(input.pausedUntil && { attempts: 0 }),
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(guardedRun(input.runId, input.expect))
      .returning({ chunkSeq: aiHandoverBulkRunModel.chunkSeq })
    return row?.chunkSeq ?? null
  },

  /**
   * Terminal write by the claim holder. Clears the lease and the in-flight
   * markers; a `cancelling` run ends `cancelled` through here too.
   */
  async finish(
    input: {
      runId: string
      expect: AiHandoverBulkRunGuard
      outcome: FinishAiHandoverBulkRunInput
    },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const { outcome } = input
    const rows = await tx
      .update(aiHandoverBulkRunModel)
      .set({
        status: outcome.status,
        // Keeps a reason recorded while the run was going (a skipped Page).
        ...(outcome.currentError !== undefined && {
          currentError: outcome.currentError,
        }),
        ...(outcome.totalCount !== undefined && {
          totalCount: outcome.totalCount,
        }),
        claimToken: null,
        pausedUntil: null,
        inFlightFromId: null,
        inFlightToId: null,
        finishedAt: new Date(),
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(guardedRun(input.runId, input.expect))
      .returning({ id: aiHandoverBulkRunModel.id })
    return rows.length
  },

  /**
   * Cancels the Page's live run: used when the Page is disconnected, the
   * automation is switched off or the desired state changes. A run nobody holds
   * (`pending`, or released `running`, e.g. parked for a quota pause) is
   * cancelled outright: there is no worker to wind it down. A claimed one
   * becomes `cancelling` (still live, so no new run can start) and its claim
   * holder winds it down at the next guarded write, or the sweeper does once its
   * lease is stale. `action` limits it to runs of that action (switching the automation off
   * must stop an enable but let a disable finish). Returns the cancelled row,
   * `null` when none was live.
   */
  async cancelLive(
    input: AiHandoverBulkRunInboxRef & { action?: AiHandoverBulkAction },
    tx: DatabaseClient = db,
  ): Promise<AiHandoverBulkRunModel | null> {
    const [row] = await tx
      .update(aiHandoverBulkRunModel)
      .set(cancelPatch())
      .where(
        and(
          eq(aiHandoverBulkRunModel.workspaceId, input.workspaceId),
          eq(aiHandoverBulkRunModel.inboxId, input.inboxId),
          inArray(aiHandoverBulkRunModel.status, ["pending", "running"]),
          input.action
            ? eq(aiHandoverBulkRunModel.action, input.action)
            : undefined,
        ),
      )
      .returning()
    return row ?? null
  },

  /**
   * Sweeper fallback for a released continuation whose job could not be
   * enqueued: puts a `running` + no-token row back to `pending` so
   * `pickDue` re-dispatches it. Matches only that exact released state.
   */
  async reopenReleased(
    input: { runId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(aiHandoverBulkRunModel)
      .set({ status: "pending", updatedAt: new Date() })
      .where(
        and(
          eq(aiHandoverBulkRunModel.id, input.runId),
          eq(aiHandoverBulkRunModel.status, "running"),
          sql`${aiHandoverBulkRunModel.claimToken} IS NULL`,
          pauseElapsed(),
        ),
      )
      .returning({ id: aiHandoverBulkRunModel.id })
    return rows.length
  },

  /**
   * Terminalizes runs the sweeper retried to exhaustion and nobody has touched
   * for a full lease (a run driven right now heartbeats every batch).
   * `cancelling` ends as `cancelled`, everything else as `failed`.
   */
  async markMaxAttemptsFailed(
    input: { maxAttempts: number },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(aiHandoverBulkRunModel)
      .set({
        status: sql`CASE WHEN ${aiHandoverBulkRunModel.status} = 'cancelling' THEN 'cancelled'::"aiHandoverBulkStatus" ELSE 'failed'::"aiHandoverBulkStatus" END`,
        // Localized by the builder (`aiHandover.bulk.runErrors.maxAttempts`).
        currentError: "maxAttempts",
        claimToken: null,
        pausedUntil: null,
        inFlightFromId: null,
        inFlightToId: null,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          sql`${aiHandoverBulkRunModel.attempts} >= ${input.maxAttempts}`,
          inArray(
            aiHandoverBulkRunModel.status,
            AI_HANDOVER_BULK_LIVE_STATUSES,
          ),
          // A run parked for a quota pause is waiting on purpose, not stuck.
          pauseElapsed(),
          sql`(${aiHandoverBulkRunModel.lastHeartbeatAt} IS NULL
            OR ${aiHandoverBulkRunModel.lastHeartbeatAt} < NOW() - ${leaseStaleInterval()})`,
          // The last dispatch gets a full lease to start: its job may be
          // waiting in a backed-up queue, and the run's heartbeat is as old as
          // the failure that made the sweeper dispatch it.
          sql`${aiHandoverBulkRunModel.updatedAt} < NOW() - ${leaseStaleInterval()}`,
        ),
      )
  },

  /**
   * Undoes what `pickDue` just did to a run: the dispatch before it is still
   * queued (a backed-up queue), so nothing was lost and the run must not be
   * failed for waiting. Both counters go back, so the next sweep finds that same
   * queued job again instead of a job that never existed. Only while the row
   * still holds exactly the picked values: a run claimed or moved on meanwhile
   * is left as it is.
   */
  async refundDispatch(
    input: { runId: string; attempts: number; chunkSeq: number },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(aiHandoverBulkRunModel)
      .set({
        attempts: sql`${aiHandoverBulkRunModel.attempts} - 1`,
        chunkSeq: sql`${aiHandoverBulkRunModel.chunkSeq} - 1`,
      })
      .where(
        and(
          eq(aiHandoverBulkRunModel.id, input.runId),
          eq(aiHandoverBulkRunModel.attempts, input.attempts),
          eq(aiHandoverBulkRunModel.chunkSeq, input.chunkSeq),
          gt(aiHandoverBulkRunModel.attempts, 0),
          gt(aiHandoverBulkRunModel.chunkSeq, 0),
        ),
      )
      .returning({ id: aiHandoverBulkRunModel.id })
    return rows.length > 0
  },

  /**
   * Claims due runs for the sweeper and burns one attempt each: a `pending`
   * run past the grace period, a run whose lease went stale (worker died), or
   * a released continuation that was never re-claimed. A `cancelling` run keeps
   * its status so the engine still winds it down.
   */
  async pickDue(
    input: { maxAttempts: number; batchSize: number },
    tx: DatabaseClient = db,
  ): Promise<PickedAiHandoverBulkRun[]> {
    const picked = await tx.execute<PickedAiHandoverBulkRun>(sql`
      UPDATE "AIHandoverBulkRun"
      SET attempts = attempts + 1,
          -- Every dispatch gets its own revision, so its job id can never
          -- collide with a retained failed job of an earlier dispatch.
          "chunkSeq" = "chunkSeq" + 1,
          status = CASE WHEN status = 'cancelling' THEN status ELSE 'pending' END,
          "updatedAt" = NOW()
      WHERE id IN (
        SELECT id FROM "AIHandoverBulkRun"
        WHERE status IN (${liveStatusList()})
          AND attempts < ${input.maxAttempts}
          AND ("pausedUntil" IS NULL OR "pausedUntil" <= NOW() OR status = 'cancelling')
          AND (
            (status = 'pending' AND "updatedAt" < NOW() - INTERVAL '2 minutes')
            OR (status IN ('running', 'cancelling')
                AND "claimToken" IS NOT NULL
                AND "lastHeartbeatAt" < NOW() - ${leaseStaleInterval()})
            OR (status IN ('running', 'cancelling')
                AND "claimToken" IS NULL
                AND "lastHeartbeatAt" < NOW() - ${releasedStaleInterval()})
          )
        ORDER BY "createdAt" ASC
        LIMIT ${input.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "workspaceId", attempts, "chunkSeq", status
    `)
    return picked.rows
  },
}
