import type { CoexistChannel } from "@chatbotx.io/utils/channel"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  or,
  relationsFilterToSQL,
  sql,
} from "../../client"
import type { CoexistRunType } from "../../partials"
import { coexistSyncRunModel } from "../../schema"
import type { CoexistSyncRunModel } from "../../types"
import { getPaginationWithDefaults, parseOrderByAsObject } from "../../utils"
import {
  type CoexistIntegrationRow,
  integrationLookups,
  integrationUpdates,
} from "./integration-access"

// Re-exported from `@chatbotx.io/utils/channel` (the `coexistChannel` pgEnum
// itself is now derived from the same `COEXIST_CHANNELS` constant, so this
// stays structurally identical to `CoexistSyncRunModel["channel"]`).
export type { CoexistChannel } from "@chatbotx.io/utils/channel"
export type PullCoexistChannel = Extract<
  CoexistChannel,
  "messenger" | "instagram"
>
export type CoexistRunStatus = CoexistSyncRunModel["status"]
export type CoexistTriggerSource =
  | "popup-enable"
  | "buffer-chain"
  | "sweep-cron"
  | "manual"
  // Created by `scanCoexistRuns` for a coexist-enabled WhatsApp integration
  // that has unprocessed staging rows but no live run left to drain them.
  // `triggerSource` is a plain text column — no migration needed for this.
  | "scheduler-recovery"

/**
 * Statuses that mean "alive". `waiting` is WhatsApp-only: everything staged so
 * far is drained and Meta has not yet sent its terminal history chunk.
 */
export const LIVE_RUN_STATUSES: CoexistRunStatus[] = [
  "init",
  "running",
  "waiting",
]

/**
 * Statuses the pull channels (Messenger/Instagram) claim from. They never enter
 * `waiting`, so their claim window is narrower than `LIVE_RUN_STATUSES` — the
 * one difference between the two claim call sites, expressed as data rather
 * than as a second `claimRunWithNewToken` implementation.
 */
export const PULL_CLAIMABLE_STATUSES: CoexistRunStatus[] = ["init", "running"]

/**
 * `LIVE_RUN_STATUSES` as a bound SQL value list, for the recovery queries that
 * must stay raw. Never re-type the statuses as literals inside a query — the
 * list has already drifted once. Every element is a bound parameter.
 *
 * A function, not a constant, for the same reason as `pendingStagingPredicate`:
 * `sql` must not be evaluated at import time.
 */
const liveRunStatusList = () =>
  sql.join(
    LIVE_RUN_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  )

/**
 * Staging rows a flush would still pick up: neither imported nor parked as
 * unparseable. Shared by every "does this integration still owe work?" query so
 * a poison row can never keep a run alive forever.
 *
 * A function, not a module-level constant: `sql` must not be evaluated at
 * import time or every test that mocks `../../client` without a `sql` export
 * fails to load the module.
 */
const pendingStagingPredicate = () =>
  sql`s."processedAt" IS NULL AND s."parseFailedAt" IS NULL`

export type PickedCoexistRun = Pick<
  CoexistSyncRunModel,
  "id" | "attempts" | "channel" | "integrationId" | "workspaceId"
>

export type { CoexistIntegrationRow } from "./integration-access"

export type CoexistRunCreateInput = {
  workspaceId: string
  integrationId: string
  channel: CoexistChannel
  triggerSource: CoexistTriggerSource
  tx?: DatabaseClient
}

export type CoexistIntegrationLookupInput = {
  workspaceId: string
  integrationId: string
  channel: CoexistChannel
  tx?: DatabaseClient
}

export type CoexistRunProgressInput = {
  runId: string
  fields: Partial<
    Pick<
      CoexistSyncRunModel,
      | "status"
      | "currentStep"
      | "currentError"
      | "currentScan"
      | "totalScan"
      | "importedContactCount"
      | "importedMessageCount"
      | "skippedCount"
      | "failedCount"
      | "lastSyncedAt"
      | "lastHeartbeatAt"
      | "finishedAt"
      | "messengerSyncPhase"
      | "currentPageNumber"
      // WhatsApp history-lifecycle state. Present so the worker can persist a
      // run's progress through a service call instead of reaching for `db`.
      | "pendingPatches"
      | "lastPhase"
      | "lastChunkOrder"
      | "syncProgress"
      // Contact-scan-only: provider `after` cursor for continuation resume.
      | "resumeCursor"
    >
  >
  /**
   * Optimistic write guard; the returned count says whether the write landed.
   * Omitted by the Messenger/Instagram writers, which keep the id-only
   * predicate they have always used.
   */
  expect?: CoexistRunWriteGuard
  tx?: DatabaseClient
}

/**
 * Guard carried by every write a claim holder makes.
 *
 * `status` alone cannot distinguish "I still own this run" from "another worker
 * reclaimed it after my heartbeat went stale" — both leave the run `running`.
 * `claimToken` is the ownership half: it is re-minted by every claim, so the
 * previous holder's writes match zero rows the moment someone else claims.
 *
 * The WhatsApp flush passes both on EVERY write after its claim, which is what
 * stops (a) a `disconnect`/`disable`/workspace teardown that flipped the run to
 * `failed` mid-import from being silently overwritten, and (b) a stale worker
 * from continuing to write after a reclaim.
 */
export type CoexistRunWriteGuard = {
  status: CoexistRunStatus
  /** Omitted by the Messenger/Instagram writers (status-only semantics). */
  claimToken?: string | null
}

export type PickDueRunsInput = {
  /**
   * No default: every call site must state which run kind it is scheduling,
   * so a scan-scheduler bug can never fall back to silently sweeping coexist
   * runs (or vice versa).
   */
  type: CoexistRunType
  batchSize: number
  maxAttempts: number
  tx?: DatabaseClient
}

export type FindResumeCeilingInput = {
  integrationId: string
  channel: PullCoexistChannel
  currentRunId: string
  tx?: DatabaseClient
}

export type IncrementProgressCounters = Partial<
  Record<
    | "currentScan"
    | "importedContactCount"
    | "importedMessageCount"
    | "skippedCount"
    | "failedCount",
    number
  >
>

export type CreateContactScanRunInput = {
  workspaceId: string
  integrationId: string
  channel: CoexistChannel
  requestedByUserId: string | null
  scanFromAt: Date
  triggerSource: string
  tx?: DatabaseClient
}

/**
 * Predicate every write on a run goes through: id-only when the caller holds no
 * claim (Messenger/Instagram), id + status (+ ownership token when the caller
 * has one) for a claim holder. One place, so the three `mark*` helpers and
 * `updateProgress` cannot drift apart.
 */
const runWriteFilter = (runId: string, guard?: CoexistRunWriteGuard) => {
  const filters = [eq(coexistSyncRunModel.id, runId)]
  if (!guard) {
    return filters
  }
  filters.push(eq(coexistSyncRunModel.status, guard.status))
  if (guard.claimToken) {
    filters.push(eq(coexistSyncRunModel.claimToken, guard.claimToken))
  }
  return filters
}

export class CoexistSyncRunRepository {
  async createRun(input: CoexistRunCreateInput): Promise<CoexistSyncRunModel> {
    const { tx = db } = input

    // `onConflictDoNothing` returns no row on conflict WITHOUT raising an error.
    // A raised unique-violation would abort the caller's transaction
    // (CoexistService.enable wraps this in db.transaction), which would then
    // break the idempotent re-select below. The partial unique index on
    // (integrationId, channel) WHERE status = 'init' dedups concurrent enables.
    const [run] = await tx
      .insert(coexistSyncRunModel)
      .values({
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        channel: input.channel,
        // Explicit even though it is the column default — the partial
        // unique index this insert dedups against is scoped to
        // `type = 'coexist'`, so the write must be unambiguous.
        type: "coexist",
        status: "init",
        triggerSource: input.triggerSource,
        // `pendingPatches` and `claimToken` have no database default (see
        // AGENTS.md invariant 11 on phantom defaults) — write them explicitly
        // on every insert. A fresh run is unowned until a worker claims it.
        pendingPatches: null,
        claimToken: null,
      })
      .onConflictDoNothing()
      .returning()

    if (run) {
      return run
    }

    const existing = await this.findActiveInitRun({
      integrationId: input.integrationId,
      channel: input.channel,
      tx,
    })
    if (existing) {
      return existing
    }
    throw new Error(
      "CoexistSyncRun insert conflicted but no active init run found",
    )
  }

  async findActiveInitRun(input: {
    integrationId: string
    channel: CoexistChannel
    tx?: DatabaseClient
  }): Promise<CoexistSyncRunModel | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: {
          integrationId: input.integrationId,
          channel: input.channel,
          status: "init",
          // MUST scope: without this, a contact-scan `init` row on the same
          // (integrationId, channel) would make `createRun`'s recovery
          // return a scan row as if it were the coexist run just inserted.
          type: "coexist",
        },
      })) ?? null
    )
  }

  /**
   * The newest run for this integration that is still alive
   * (`init | running | waiting`). Used by `enable` so re-confirming the popup
   * reuses a run parked in `waiting` rather than opening a second live one —
   * the partial unique index only dedups `init`.
   */
  async findLiveRun(input: {
    integrationId: string
    channel: CoexistChannel
    tx?: DatabaseClient
  }): Promise<CoexistSyncRunModel | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: {
          integrationId: input.integrationId,
          channel: input.channel,
          status: { in: LIVE_RUN_STATUSES },
          // MUST scope: without this, `enable` could reuse a live scan run
          // instead of opening/reusing a coexist run.
          type: "coexist",
        },
        orderBy: { createdAt: "desc" },
      })) ?? null
    )
  }

  async findRunById(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<CoexistSyncRunModel | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: { id: input.runId },
      })) ?? null
    )
  }

  async findWorkspaceOwnerId(input: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<string | null> {
    const { tx = db } = input
    const row = await tx.query.workspaceModel.findFirst({
      where: { id: input.workspaceId },
      columns: { ownerId: true },
    })
    return row?.ownerId ?? null
  }

  /**
   * Claims a run for THIS worker and mints a fresh ownership token.
   *
   * One implementation for every channel: `fromStatuses` is the
   * only thing that differed — the pull channels claim from
   * `PULL_CLAIMABLE_STATUSES`, the WhatsApp flush from `LIVE_RUN_STATUSES`
   * (a run parked in `waiting` is claimable). A terminal run is never
   * re-opened by a stale job payload, a run another worker is actively running
   * is refused unless its heartbeat is over 10 minutes stale, and `startedAt`
   * is COALESCEd so the FIRST chunk's start survives resume.
   *
   * The returned row carries the new `claimToken`; pass it back in the
   * `expect` guard of every later write so a reclaim by a second worker
   * immediately makes this worker's writes no-ops.
   *
   * @returns the claimed row, or null when this worker did not win it.
   */
  async claimRunWithNewToken(input: {
    runId: string
    fromStatuses?: CoexistRunStatus[]
    tx?: DatabaseClient
  }): Promise<CoexistSyncRunModel | null> {
    const { tx = db, fromStatuses = PULL_CLAIMABLE_STATUSES } = input
    const [run] = await tx
      .update(coexistSyncRunModel)
      .set({
        status: "running",
        // Web Crypto, not `node:crypto`: this repository is reachable from a
        // Next Server Component, and only the Web API exists in both runtimes.
        claimToken: crypto.randomUUID(),
        startedAt: sql`COALESCE(${coexistSyncRunModel.startedAt}, NOW())`,
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coexistSyncRunModel.id, input.runId),
          inArray(coexistSyncRunModel.status, fromStatuses),
          or(
            ne(coexistSyncRunModel.status, "running"),
            lt(
              coexistSyncRunModel.lastHeartbeatAt,
              sql`NOW() - INTERVAL '10 minutes'`,
            ),
          ),
        ),
      )
      .returning()

    return run ?? null
  }

  /**
   * Terminalizes runs the scheduler has retried to exhaustion.
   *
   * Gated on the same 10-minute staleness `claimRunWithNewToken` uses: a run being driven
   * right now heartbeats every batch, and a healthy multi-hour backfill that
   * happens to have burned its attempts must not be killed mid-import — that
   * would strand its `pendingPatches` along with it. Only a run nobody has
   * touched for 10 minutes (or one that never started, `lastHeartbeatAt IS
   * NULL`) is genuinely exhausted.
   */
  async markMaxAttemptsFailed(input: {
    /**
     * No default — see `PickDueRunsInput.type`: every call site must state
     * which run kind it is terminalizing.
     */
    type: CoexistRunType
    maxAttempts: number
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db } = input
    await tx
      .update(coexistSyncRunModel)
      .set({
        status: "failed",
        currentError: "Max scheduler retries exceeded",
        finishedAt: new Date(),
        // Terminal write clears the scan continuation cursor (no-op for
        // coexist rows, which never set it).
        resumeCursor: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coexistSyncRunModel.type, input.type),
          sql`${coexistSyncRunModel.attempts} >= ${input.maxAttempts}`,
          inArray(coexistSyncRunModel.status, ["init", "running"]),
          or(
            isNull(coexistSyncRunModel.lastHeartbeatAt),
            lt(
              coexistSyncRunModel.lastHeartbeatAt,
              sql`NOW() - INTERVAL '10 minutes'`,
            ),
          ),
        ),
      )
  }

  /**
   * Claims due runs for the scheduler and burns one attempt each.
   *
   * `init` rows are gated on `updatedAt`, not `createdAt`. A freshly created
   * row has `updatedAt = NOW()`, so the 10-second grace is unchanged for every
   * channel; but a WhatsApp run that the recovery pass just lifted out of
   * `waiting` (which stamps `updatedAt` and enqueues the run itself) is no
   * longer re-picked on the very same tick. Under `createdAt` it always was —
   * its `createdAt` is minutes-to-hours old — so every history burst burned an
   * attempt and five bursts terminalized a healthy run.
   */
  async pickDueRuns(input: PickDueRunsInput): Promise<PickedCoexistRun[]> {
    const { tx = db } = input
    const picked = await tx.execute<PickedCoexistRun>(sql`
      UPDATE "CoexistSyncRun"
      SET attempts = attempts + 1,
          status = 'init',
          "updatedAt" = NOW()
      WHERE id IN (
        SELECT id FROM "CoexistSyncRun"
        WHERE (
          (status = 'init' AND "updatedAt" < NOW() - INTERVAL '10 seconds')
          OR (status = 'running' AND "lastHeartbeatAt" < NOW() - INTERVAL '1 hour')
        )
        AND type = ${input.type}
        AND attempts < ${input.maxAttempts}
        ORDER BY "createdAt" ASC
        LIMIT ${input.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, attempts, channel, "integrationId", "workspaceId"
    `)

    return picked.rows
  }

  /**
   * Recovery pass 1 — a WhatsApp run parked in `waiting` for which Meta has
   * since staged more history. Flips it back to `init` so the normal
   * `pickDueRuns` path enqueues it. `attempts` is deliberately NOT incremented:
   * this is fresh work arriving, not a retry of failed work.
   */
  async reviveWaitingRunsWithPendingStaging(input: {
    batchSize: number
    tx?: DatabaseClient
  }): Promise<PickedCoexistRun[]> {
    const { tx = db } = input
    const revived = await tx.execute<PickedCoexistRun>(sql`
      UPDATE "CoexistSyncRun"
      SET status = 'init',
          "updatedAt" = NOW()
      WHERE id IN (
        SELECT r.id FROM "CoexistSyncRun" r
        WHERE r.channel = 'whatsapp'
          AND r.status = 'waiting'
          -- Belt: WhatsApp coexist is already isolated from scan (messenger-
          -- only), but scope explicitly like every other set-query.
          AND r.type = 'coexist'
          AND EXISTS (
            SELECT 1 FROM "WhatsappCoexistStaging" s
            JOIN "IntegrationWhatsapp" i
              ON i."phoneNumberId" = s."phoneNumberId"
            WHERE i.id = r."integrationId"
              AND ${pendingStagingPredicate()}
          )
        ORDER BY r."createdAt" ASC
        LIMIT ${input.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, attempts, channel, "integrationId", "workspaceId"
    `)

    return revived.rows
  }

  /**
   * Recovery pass 2 — a WhatsApp run that has sat in `waiting` past Meta's
   * history-delivery window with nothing left to drain. Finalized as `partial`
   * (honest: we imported what arrived, we do not know whether Meta had more)
   * with the `history_timeout` sentinel in `currentError`.
   *
   * `startedAt` is COALESCEd with `createdAt` so a row that somehow reached
   * `waiting` without a claim can still time out instead of living forever.
   */
  async finalizeTimedOutWaitingRuns(input: {
    windowMs: number
    currentError: string
    batchSize: number
    tx?: DatabaseClient
  }): Promise<{ id: string }[]> {
    const { tx = db } = input
    const windowSeconds = Math.floor(input.windowMs / 1000)
    const finalized = await tx.execute<{ id: string }>(sql`
      UPDATE "CoexistSyncRun"
      SET status = 'partial',
          "currentError" = ${input.currentError},
          "finishedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE id IN (
        SELECT r.id FROM "CoexistSyncRun" r
        WHERE r.channel = 'whatsapp'
          AND r.status = 'waiting'
          -- Belt: WhatsApp coexist is already isolated from scan (messenger-
          -- only), but scope explicitly like every other set-query.
          AND r.type = 'coexist'
          AND COALESCE(r."startedAt", r."createdAt")
              < NOW() - make_interval(secs => ${windowSeconds})
          AND NOT EXISTS (
            SELECT 1 FROM "WhatsappCoexistStaging" s
            JOIN "IntegrationWhatsapp" i
              ON i."phoneNumberId" = s."phoneNumberId"
            WHERE i.id = r."integrationId"
              AND ${pendingStagingPredicate()}
          )
        ORDER BY r."createdAt" ASC
        LIMIT ${input.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `)

    return finalized.rows
  }

  /**
   * Recovery pass 3 — a coexist-enabled WhatsApp integration holding staging
   * rows nobody will ever drain because its last run reached a terminal status.
   * This is the state every deployed instance is left in by the pre-`waiting`
   * lifecycle, so the scheduler creates a fresh run for it.
   *
   * Returns candidates only; the caller creates the run via `createRun`, whose
   * partial unique index on (integrationId, channel) WHERE status = 'init'
   * makes the whole pass idempotent — a second tick cannot open a second run.
   */
  async findStrandedCoexistWhatsappIntegrations(input: {
    limit: number
    tx?: DatabaseClient
  }): Promise<{ integrationId: string; workspaceId: string }[]> {
    const { tx = db } = input
    const stranded = await tx.execute<{
      integrationId: string
      workspaceId: string
    }>(sql`
      SELECT i.id AS "integrationId", i."workspaceId" AS "workspaceId"
      FROM "IntegrationWhatsapp" i
      WHERE i."coexistEnabled" = true
        AND EXISTS (
          SELECT 1 FROM "WhatsappCoexistStaging" s
          WHERE s."phoneNumberId" = i."phoneNumberId"
            AND ${pendingStagingPredicate()}
        )
        AND NOT EXISTS (
          SELECT 1 FROM "CoexistSyncRun" r
          WHERE r."integrationId" = i.id
            AND r.channel = 'whatsapp'
            -- Belt: WhatsApp coexist is already isolated from scan
            -- (messenger-only), but scope explicitly like every other
            -- set-query.
            AND r.type = 'coexist'
            AND r.status IN (${liveRunStatusList()})
        )
      ORDER BY i.id ASC
      LIMIT ${input.limit}
    `)

    return stranded.rows.map((row) => ({
      integrationId: String(row.integrationId),
      workspaceId: String(row.workspaceId),
    }))
  }

  /** @returns how many rows the write landed on — 0 means the guard failed. */
  async updateProgress(input: CoexistRunProgressInput): Promise<number> {
    const { tx = db } = input
    const rows = await tx
      .update(coexistSyncRunModel)
      .set({ ...input.fields, updatedAt: new Date() })
      .where(and(...runWriteFilter(input.runId, input.expect)))
      .returning({ id: coexistSyncRunModel.id })

    return rows.length
  }

  async markFailed(input: {
    runId: string
    currentError: string
    expect?: CoexistRunWriteGuard
    tx?: DatabaseClient
  }): Promise<number> {
    return await this.updateProgress({
      runId: input.runId,
      fields: {
        status: "failed",
        currentError: input.currentError,
        finishedAt: new Date(),
        resumeCursor: null,
      },
      expect: input.expect,
      tx: input.tx,
    })
  }

  async markPartial(input: {
    runId: string
    currentError?: string
    expect?: CoexistRunWriteGuard
    tx?: DatabaseClient
  }): Promise<number> {
    return await this.updateProgress({
      runId: input.runId,
      fields: {
        status: "partial",
        currentError: input.currentError,
        finishedAt: new Date(),
        resumeCursor: null,
      },
      expect: input.expect,
      tx: input.tx,
    })
  }

  async markSucceeded(input: {
    runId: string
    expect?: CoexistRunWriteGuard
    tx?: DatabaseClient
  }): Promise<number> {
    return await this.updateProgress({
      runId: input.runId,
      fields: {
        status: "succeeded",
        finishedAt: new Date(),
        resumeCursor: null,
      },
      expect: input.expect,
      tx: input.tx,
    })
  }

  async findResumeCeiling(input: FindResumeCeilingInput): Promise<Date | null> {
    const { tx = db } = input
    const priorRun = await tx.query.coexistSyncRunModel.findFirst({
      where: {
        integrationId: input.integrationId,
        channel: input.channel,
        status: { in: ["succeeded", "partial"] },
        id: { ne: input.currentRunId },
        // MUST scope — CRITICAL: a scan `succeeded` on this
        // (integrationId, channel) would otherwise become the next coexist
        // history run's ceiling, silently losing message history.
        type: "coexist",
      },
      orderBy: { startedAt: "desc" },
      columns: { startedAt: true, lastSyncedAt: true, status: true },
    })
    if (!priorRun) {
      return null
    }
    if (priorRun.status === "succeeded") {
      return priorRun.startedAt ?? null
    }
    return priorRun.lastSyncedAt ?? priorRun.startedAt ?? null
  }

  async tearDownActiveRunsForIntegration(input: {
    channel: CoexistChannel
    integrationId: string
    currentError: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db } = input
    await tx
      .update(coexistSyncRunModel)
      .set({
        status: "failed",
        currentError: input.currentError,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coexistSyncRunModel.channel, input.channel),
          eq(coexistSyncRunModel.integrationId, input.integrationId),
          // MUST scope: without this, disabling coexist would also tear
          // down a live contact-scan run on the same integration.
          eq(coexistSyncRunModel.type, "coexist"),
          // `waiting` included: disabling coexist must also tear down a
          // WhatsApp run parked waiting for more Meta history, otherwise the
          // run outlives the feature it belongs to.
          inArray(coexistSyncRunModel.status, LIVE_RUN_STATUSES),
        ),
      )
  }

  findIntegrationForCoexist(
    input: CoexistIntegrationLookupInput,
  ): Promise<CoexistIntegrationRow | null> {
    const { tx = db } = input
    const lookup = integrationLookups[input.channel]
    return lookup({
      tx,
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
    })
  }

  /**
   * `aiReadsSyncedHistory` is optional and only written when provided —
   * `undefined` leaves `coexistAiReadsSyncedHistory` untouched (e.g. `disable`
   * must never clear a previously-set value).
   */
  setIntegrationCoexistEnabled(input: {
    channel: CoexistChannel
    workspaceId: string
    integrationId: string
    enabled: boolean
    aiReadsSyncedHistory?: boolean
    tx?: DatabaseClient
  }): Promise<CoexistIntegrationRow | null> {
    const { tx = db } = input
    const update = integrationUpdates[input.channel]
    return update({
      tx,
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      enabled: input.enabled,
      aiReadsSyncedHistory: input.aiReadsSyncedHistory,
    })
  }

  /** Read `lastSyncedAt` for phase resume. */
  async findLastSyncedAt(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<{ lastSyncedAt: Date | null } | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: { id: input.runId },
        columns: { lastSyncedAt: true },
      })) ?? null
    )
  }

  /**
   * Atomically increments the given counters (`sql\`col + N\`` — NOT a
   * read-modify-write, which would reintroduce a lost-update race across the
   * two concurrent phase workers) while also setting the given plain-value
   * fields.
   *
   * `expect` is optional and additive: omitted, this behaves exactly as
   * before (id-only predicate, no return value the caller can inspect —
   * kept as `Promise<void>` so the Messenger/Instagram coexist callers are
   * unaffected). Passed, the write is fenced by `runWriteFilter` like every
   * other claim-holder write and the affected-row count is returned — the
   * contact-scan engine's per-page loop needs this to detect a claim
   * takeover (0 rows) after every write.
   */
  // No-expect overload keeps `Promise<undefined>` (not `Promise<void>`) so
  // the implementation signature below can declare a plain `number |
  // undefined` union — `void` inside a union trips the linter, and the
  // resolved value is `undefined` either way, so no coexist caller
  // (`messenger-sync.ts`, which only `await`s and never reads the result)
  // observes a behavior change.
  async incrementProgress(input: {
    runId: string
    increments: IncrementProgressCounters
    fields?: CoexistRunProgressInput["fields"]
    tx?: DatabaseClient
  }): Promise<undefined>
  async incrementProgress(input: {
    runId: string
    increments: IncrementProgressCounters
    fields?: CoexistRunProgressInput["fields"]
    expect: CoexistRunWriteGuard
    tx?: DatabaseClient
  }): Promise<number>
  async incrementProgress(input: {
    runId: string
    increments: IncrementProgressCounters
    fields?: CoexistRunProgressInput["fields"]
    expect?: CoexistRunWriteGuard
    tx?: DatabaseClient
  }): Promise<number | undefined> {
    const { tx = db, runId, increments, fields, expect } = input
    const incrementSet: Record<string, unknown> = {}
    for (const [key, amount] of Object.entries(increments)) {
      if (amount === undefined) {
        continue
      }
      const column =
        coexistSyncRunModel[key as keyof typeof coexistSyncRunModel]
      incrementSet[key] = sql`${column} + ${amount}`
    }

    const rows = await tx
      .update(coexistSyncRunModel)
      .set({ ...incrementSet, ...fields, updatedAt: new Date() })
      .where(and(...runWriteFilter(runId, expect)))
      .returning({ id: coexistSyncRunModel.id })

    if (expect) {
      return rows.length
    }
  }

  /** Init-row read (attempts/currentError/messengerSyncPhase) before claim. */
  async findInitState(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<Pick<
    CoexistSyncRunModel,
    "attempts" | "currentError" | "messengerSyncPhase"
  > | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: { id: input.runId },
        columns: {
          attempts: true,
          currentError: true,
          messengerSyncPhase: true,
        },
      })) ?? null
    )
  }

  /**
   * Optimistic claim with a stale-heartbeat fallback, used by
   * `messenger-sync.ts` and `whatsapp-flush.ts`. Deliberately does NOT
   * include `claimRunWithNewToken`'s `inArray(status, ["init","running"])` guard — both
   * callers reclaim `failed`/`partial` runs on retry, so adding that guard
   * would silently break retry recovery. `touchUpdatedAt` distinguishes the
   * two callers' SET clauses (messenger-sync also bumps `updatedAt`;
   * whatsapp-flush does not) — do not unify beyond this flag.
   */
  async reclaimRunForRetry(input: {
    runId: string
    touchUpdatedAt: boolean
    tx?: DatabaseClient
  }): Promise<CoexistSyncRunModel | null> {
    const { tx = db, runId, touchUpdatedAt } = input
    const [run] = await tx
      .update(coexistSyncRunModel)
      .set({
        status: "running",
        startedAt: sql`COALESCE(${coexistSyncRunModel.startedAt}, NOW())`,
        lastHeartbeatAt: new Date(),
        ...(touchUpdatedAt ? { updatedAt: new Date() } : {}),
      })
      .where(
        and(
          eq(coexistSyncRunModel.id, runId),
          or(
            ne(coexistSyncRunModel.status, "running"),
            lt(
              coexistSyncRunModel.lastHeartbeatAt,
              sql`NOW() - INTERVAL '10 minutes'`,
            ),
          ),
        ),
      )
      .returning()

    return run ?? null
  }

  /** Terminal-status derivation counters (importedMessages/skipped/failed). */
  async findTerminalCounters(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<Pick<
    CoexistSyncRunModel,
    "importedMessageCount" | "skippedCount" | "failedCount"
  > | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: { id: input.runId },
        columns: {
          importedMessageCount: true,
          skippedCount: true,
          failedCount: true,
        },
      })) ?? null
    )
  }

  // ---------------------------------------------------------------------
  // Contact scan (`type = 'contact_scan'`) — dedicated lifecycle methods.
  // Every method below ANDs `type = 'contact_scan'` into its WHERE, so it
  // only ever touches scan rows; a coexist row is untouched even if a
  // misrouted job passes its id. `claimRunWithNewToken` is intentionally
  // NOT reused here (see its own doc comment / plan §3(b)) — the scan gets
  // its own type-scoped claim instead.
  // ---------------------------------------------------------------------

  /**
   * Claims a scan run for THIS worker and mints a fresh ownership token.
   * Mirrors `claimRunWithNewToken`, type-scoped, with one addition: the
   * `claimToken IS NULL` arm lets a **continuation** re-claim the
   * fresh-heartbeat `running` row a previous chunk released via
   * `yieldForContinuation` — coexist's claim has no such arm because it has
   * no lease-release protocol.
   *
   * @returns the claimed row, or null when this worker did not win it.
   */
  async claimContactScanRun(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<CoexistSyncRunModel | null> {
    const { tx = db, runId } = input
    const [run] = await tx
      .update(coexistSyncRunModel)
      .set({
        status: "running",
        claimToken: crypto.randomUUID(),
        startedAt: sql`COALESCE(${coexistSyncRunModel.startedAt}, NOW())`,
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coexistSyncRunModel.id, runId),
          eq(coexistSyncRunModel.type, "contact_scan"),
          inArray(coexistSyncRunModel.status, PULL_CLAIMABLE_STATUSES),
          or(
            ne(coexistSyncRunModel.status, "running"),
            isNull(coexistSyncRunModel.claimToken),
            lt(
              coexistSyncRunModel.lastHeartbeatAt,
              sql`NOW() - INTERVAL '10 minutes'`,
            ),
          ),
        ),
      )
      .returning()

    return run ?? null
  }

  /**
   * Releases the claim token while the run STAYS `running` (never flips to
   * `init`) — flipping to `init` would let the sweeper double-dispatch a
   * healthy scan every minute. This keeps one live dispatcher (the enqueued
   * continuation job, which wins `claimContactScanRun`'s null-token arm
   * immediately) with the sweeper only as crash fallback via
   * `reopenReleased`.
   *
   * @returns how many rows the write landed on — 0 means the guard failed
   * (claim taken over), so the caller must not enqueue a continuation.
   */
  async yieldForContinuation(input: {
    runId: string
    expect: CoexistRunWriteGuard
    tx?: DatabaseClient
  }): Promise<number> {
    const { tx = db, runId, expect } = input
    const rows = await tx
      .update(coexistSyncRunModel)
      .set({
        claimToken: null,
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coexistSyncRunModel.type, "contact_scan"),
          ...runWriteFilter(runId, expect),
        ),
      )
      .returning({ id: coexistSyncRunModel.id })

    return rows.length
  }

  /**
   * Sweeper fallback for a run `yieldForContinuation` released but whose
   * continuation job could never be enqueued — reopens it to `init` so the
   * normal `pickDueRuns({ type: "contact_scan" })` path picks it back up.
   * Only matches a row still exactly in that released state (`running` +
   * no token), so it cannot clobber a run a continuation already re-claimed.
   */
  async reopenReleased(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<number> {
    const { tx = db, runId } = input
    const rows = await tx
      .update(coexistSyncRunModel)
      .set({ status: "init", updatedAt: new Date() })
      .where(
        and(
          eq(coexistSyncRunModel.id, runId),
          eq(coexistSyncRunModel.type, "contact_scan"),
          eq(coexistSyncRunModel.status, "running"),
          isNull(coexistSyncRunModel.claimToken),
        ),
      )
      .returning({ id: coexistSyncRunModel.id })

    return rows.length
  }

  /**
   * Creates a fresh scan run, targetless `onConflictDoNothing()` — a
   * `target` cannot match a partial unique index without repeating its
   * predicate (see `createRun`'s comment / `ads-conversion-event/repository.ts`),
   * and the `CoexistSyncRun_contact_scan_active_uq` partial index already
   * dedups concurrent submits for the same integration.
   *
   * @returns the created row, or null when a live scan already exists for
   * this integration (the caller should treat this as a race loss and
   * surface "already running").
   */
  async createContactScanRun(
    input: CreateContactScanRunInput,
  ): Promise<CoexistSyncRunModel | null> {
    const { tx = db } = input
    const [run] = await tx
      .insert(coexistSyncRunModel)
      .values({
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        channel: input.channel,
        type: "contact_scan",
        status: "init",
        triggerSource: input.triggerSource,
        scanFromAt: input.scanFromAt,
        requestedByUserId: input.requestedByUserId,
        // Same phantom-default discipline as `createRun` — no `.default()`
        // on these, so every insert path writes them explicitly. A fresh
        // scan is unowned and has not walked any page yet.
        pendingPatches: null,
        claimToken: null,
        resumeCursor: null,
      })
      .onConflictDoNothing()
      .returning()

    return run ?? null
  }

  /** Newest scan run for this integration, workspace-scoped. */
  async findLatestContactScanRun(input: {
    workspaceId: string
    integrationId: string
    tx?: DatabaseClient
  }): Promise<CoexistSyncRunModel | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: {
          workspaceId: input.workspaceId,
          integrationId: input.integrationId,
          type: "contact_scan",
        },
        orderBy: { createdAt: "desc" },
      })) ?? null
    )
  }

  /**
   * Paginated scan-run history for the Automatic Customer Scan history page
   * — the `type='contact_scan'` mirror of `ImportService.list`. Workspace-
   * scoped AND type-scoped (both ANDed into the same `where`), so it can
   * never surface a `type='coexist'` row even when the workspace also has
   * coexist history. Channel-agnostic: returns every column the caller may
   * need (`channel` included) with no per-channel branching here.
   */
  async listContactScanRuns(input: {
    workspaceId: string
    page?: number
    perPage?: number
    sort?: { id: string; desc: boolean }[]
    tx?: DatabaseClient
  }): Promise<{ data: CoexistSyncRunModel[]; pageCount: number }> {
    const { tx = db, workspaceId } = input
    const where = {
      workspaceId,
      type: "contact_scan" as const,
    }
    const pagination = getPaginationWithDefaults(input)
    const sortObject = parseOrderByAsObject(coexistSyncRunModel, input)
    const orderBy =
      Object.keys(sortObject).length > 0
        ? sortObject
        : { createdAt: "desc" as const }

    const [data, total] = await Promise.all([
      tx.query.coexistSyncRunModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      tx.$count(
        coexistSyncRunModel,
        relationsFilterToSQL(coexistSyncRunModel, where),
      ),
    ])

    return {
      data,
      pageCount: Math.ceil(total / pagination.limit),
    }
  }
}

export const coexistSyncRunRepository = new CoexistSyncRunRepository()
