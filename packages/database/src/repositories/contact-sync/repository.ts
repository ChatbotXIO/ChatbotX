import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  sql,
} from "../../client"
import {
  CONTACT_SYNC_LIVE_STATUSES,
  type ContactSyncActorType,
  type ContactSyncHeldRunStatus,
  type ContactSyncProvider,
  type ContactSyncRunItemStatus,
  type ContactSyncSourceChannel,
  type ContactSyncTerminalItemStatus,
  type ContactSyncTerminalRunStatus,
  type ContactSyncTrigger,
  type ContactSyncTriggerSource,
} from "../../partials"
import { contactSyncRunItemModel, contactSyncRunModel } from "../../schema"
import type { ContactSyncRunItemModel, ContactSyncRunModel } from "../../types"
import { getPaginationWithDefaults } from "../../utils"
import { contactSyncFollowUpMethods } from "./follow-up-repository"
import { closeOpenItems, leaseStaleInterval, pauseElapsed } from "./lease-sql"
import { contactSyncSweeperMethods } from "./sweeper-repository"

export type { PickedContactSyncRun } from "./sweeper-repository"

/** A claim holder's proof of ownership; every guarded write carries it. */
export type ContactSyncRunGuard = { claimToken: string }

export type CreateContactSyncRunInput = {
  workspaceId: string
  provider: ContactSyncProvider
  triggerSource: ContactSyncTriggerSource
  trigger: ContactSyncTrigger
  /** Snapshot of who asked: the `actor` of every signed export request of the run. */
  requestedByType: ContactSyncActorType
  requestedById: string
  syncTags: boolean
  syncCustomFields: boolean
  overwriteExisting: boolean
  /** In processing order. */
  items: ContactSyncRunItemInput[]
}

export type ContactSyncRunItemInput = {
  inboxId: string
  sourceChannel: ContactSyncSourceChannel
  sourceAccountId: string
  sourceAccountName: string | null
  /** Connect import only: run the history sync (coexist) once the item ended. */
  followUpCoexist: boolean
  followUpAiReadsSyncedHistory: boolean
}

/**
 * Result of a write on one item under the run's guard. `claimLost` = the run
 * is no longer this worker's (stop the whole run); `itemInactive` = the item
 * was cancelled or finished meanwhile (skip it, the run goes on).
 */
export type ContactSyncItemWriteFailure = "claimLost" | "itemInactive"

export type StartItemResult =
  | { outcome: "started"; item: ContactSyncRunItemModel }
  | { outcome: ContactSyncItemWriteFailure }

export type RecordProgressResult =
  | { outcome: "recorded" }
  | { outcome: "runCancelling" }
  | { outcome: ContactSyncItemWriteFailure }

export type FinishItemResult =
  | { outcome: "finished" }
  | { outcome: ContactSyncItemWriteFailure }

export type ContactSyncItemCounters = {
  created: number
  updated: number
  skipped: number
  failed: number
  /** Custom-field values dropped (incompatible mapping, invalid value). */
  skippedValues: number
}

export type FinishContactSyncRunInput = {
  status: ContactSyncTerminalRunStatus
  currentError?: string | null
}

/**
 * How a terminal write ended: `finished`; `open` when an item was added after
 * the outcome was computed and the run must go on; `lost` when the claim is
 * gone.
 */
export type FinishContactSyncRunResult = "finished" | "open" | "lost"

export type ContactSyncRunWithItems = ContactSyncRunModel & {
  items: ContactSyncRunItemModel[]
}

/**
 * The cancel write. A run nobody holds ends `cancelled` on the spot; a claimed
 * one becomes `cancelling` for its worker to wind down. The enum casts matter:
 * a bare string literal in `CASE` is `text`, which Postgres will not assign to
 * the status enum.
 */
const cancelPatch = () => ({
  status: sql`CASE WHEN ${contactSyncRunModel.status} = 'pending'
      OR ${contactSyncRunModel.claimToken} IS NULL
    THEN 'cancelled'::"contactSyncRunStatus"
    ELSE 'cancelling'::"contactSyncRunStatus" END`,
  finishedAt: sql`CASE WHEN ${contactSyncRunModel.status} = 'pending'
      OR ${contactSyncRunModel.claimToken} IS NULL
    THEN NOW() ELSE ${contactSyncRunModel.finishedAt} END`,
  pausedUntil: null,
  updatedAt: new Date(),
})

/** An item a write may still change: not yet finished or cancelled. */
const openItem = (runId: string, itemId: string) =>
  and(
    eq(contactSyncRunItemModel.id, itemId),
    eq(contactSyncRunItemModel.runId, runId),
    inArray(contactSyncRunItemModel.status, ["pending", "running"]),
  )

/** A new `pending` item row; every column is written (no database defaults). */
const toItemRow = (
  runId: string,
  workspaceId: string,
  item: ContactSyncRunItemInput,
  position: number,
) => ({
  runId,
  workspaceId,
  inboxId: item.inboxId,
  sourceChannel: item.sourceChannel,
  sourceAccountId: item.sourceAccountId,
  sourceAccountName: item.sourceAccountName,
  position,
  status: "pending" as const,
  cursor: null,
  upperBoundId: null,
  boundReadAt: null,
  createdCount: 0,
  updatedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  skippedValueCount: 0,
  currentError: null,
  startedAt: null,
  finishedAt: null,
  followUpCoexist: item.followUpCoexist,
  followUpAiReadsSyncedHistory: item.followUpAiReadsSyncedHistory,
  followUpRunId: null,
  followUpError: null,
  followUpRequestedAt: item.followUpCoexist ? new Date() : null,
})

const guardedRun = (runId: string, guard: ContactSyncRunGuard) =>
  and(
    eq(contactSyncRunModel.id, runId),
    inArray(contactSyncRunModel.status, ["running", "cancelling"]),
    eq(contactSyncRunModel.claimToken, guard.claimToken),
  )

/** Bumps the heartbeat of a run this claim still holds; `null` = claim lost. */
const touchGuardedRun = async (
  runId: string,
  guard: ContactSyncRunGuard,
  tx: DatabaseClient,
  patch: { resetAttempts?: boolean } = {},
): Promise<ContactSyncHeldRunStatus | null> => {
  const [row] = await tx
    .update(contactSyncRunModel)
    .set({
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
      ...(patch.resetAttempts && { attempts: 0 }),
    })
    .where(guardedRun(runId, guard))
    .returning({ status: contactSyncRunModel.status })
  // `guardedRun` only matches a held run, so the status is one of these.
  return row ? (row.status as ContactSyncHeldRunStatus) : null
}

/**
 * The attempts a yield leaves: a retry costs one, a rate-limit pause is a
 * deliberate wait (back to zero), a plain chunk boundary keeps them.
 */
const retryAttempts = (input: {
  pausedUntil?: Date
  countAttempt?: boolean
}) => {
  if (input.countAttempt) {
    return { attempts: sql`${contactSyncRunModel.attempts} + 1` }
  }
  if (input.pausedUntil) {
    return { attempts: 0 }
  }
  return {}
}

export const contactSyncRunRepository = {
  ...contactSyncFollowUpMethods,
  ...contactSyncSweeperMethods,
  /**
   * Inserts a `pending` run and its items, or returns `null` when the
   * workspace already has a live run (the partial unique index decides, so
   * two concurrent requests cannot both win). Every column is written.
   */
  async createWithItems(
    input: CreateContactSyncRunInput,
    tx: DatabaseClient = db,
  ): Promise<ContactSyncRunWithItems | null> {
    const [run] = await tx
      .insert(contactSyncRunModel)
      .values({
        workspaceId: input.workspaceId,
        provider: input.provider,
        status: "pending",
        triggerSource: input.triggerSource,
        trigger: input.trigger,
        requestedByType: input.requestedByType,
        requestedById: input.requestedById,
        syncTags: input.syncTags,
        syncCustomFields: input.syncCustomFields,
        overwriteExisting: input.overwriteExisting,
        startedAt: null,
        finishedAt: null,
        lastHeartbeatAt: null,
        pausedUntil: null,
        claimToken: null,
        attempts: 0,
        chunkSeq: 0,
        currentError: null,
      })
      // Targetless: a partial unique index cannot be a `target` without
      // repeating its predicate.
      .onConflictDoNothing()
      .returning()
    if (!run) {
      return null
    }
    const items = await tx
      .insert(contactSyncRunItemModel)
      .values(
        input.items.map((item, position) =>
          toItemRow(run.id, input.workspaceId, item, position),
        ),
      )
      .returning()
    return { ...run, items }
  },

  /**
   * Adds items to a live run that has not been cancelled, at the end of its
   * order and up to `maxItems` in all; returns the inserted ones (fewer than
   * asked when the run is full) or `null` when the run is no longer
   * `pending`/`running`. The run row is locked, so two appends cannot pick the
   * same position and a finishing run waits for the insert, sees the item and does not end
   * over it.
   */
  async appendItems(
    input: {
      runId: string
      workspaceId: string
      maxItems: number
      items: ContactSyncRunItemInput[]
    },
    tx: DatabaseClient = db,
  ): Promise<ContactSyncRunItemModel[] | null> {
    const [run] = await tx
      .select({ id: contactSyncRunModel.id })
      .from(contactSyncRunModel)
      .where(
        and(
          eq(contactSyncRunModel.id, input.runId),
          eq(contactSyncRunModel.workspaceId, input.workspaceId),
          inArray(contactSyncRunModel.status, ["pending", "running"]),
        ),
      )
      .for("update")
    if (!run) {
      return null
    }
    const [stats] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        last: sql<number>`coalesce(max(${contactSyncRunItemModel.position}), -1)::int`,
      })
      .from(contactSyncRunItemModel)
      .where(eq(contactSyncRunItemModel.runId, input.runId))
    const accepted = input.items.slice(
      0,
      Math.max(0, input.maxItems - (stats?.count ?? 0)),
    )
    if (accepted.length === 0) {
      return []
    }
    return await tx
      .insert(contactSyncRunItemModel)
      .values(
        accepted.map((item, index) =>
          toItemRow(
            input.runId,
            input.workspaceId,
            item,
            (stats?.last ?? -1) + 1 + index,
          ),
        ),
      )
      .returning()
  },

  /**
   * The workspace's live run with its row locked (`FOR UPDATE`), the lock a
   * worker's run write takes before it touches an item: a caller that goes on
   * to lock items takes this one first, so the two never wait on each other.
   */
  async lockLiveRun(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<ContactSyncRunModel | null> {
    const [row] = await tx
      .select()
      .from(contactSyncRunModel)
      .where(
        and(
          eq(contactSyncRunModel.workspaceId, workspaceId),
          inArray(contactSyncRunModel.status, CONTACT_SYNC_LIVE_STATUSES),
        ),
      )
      .limit(1)
      .for("update")
    return row ?? null
  },

  /** The workspace's live run, if any. */
  async findLive(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<ContactSyncRunModel | null> {
    const [row] = await tx
      .select()
      .from(contactSyncRunModel)
      .where(
        and(
          eq(contactSyncRunModel.workspaceId, workspaceId),
          inArray(contactSyncRunModel.status, CONTACT_SYNC_LIVE_STATUSES),
        ),
      )
      .limit(1)
    return row ?? null
  },

  /**
   * The latest run that actually reached its source (at least one item
   * started fetching): the cooldown is measured from it. A run that failed
   * before contacting the source does not count.
   */
  async findLatestFetchedRun(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<Pick<ContactSyncRunModel, "id" | "createdAt"> | null> {
    const [row] = await tx
      .select({
        id: contactSyncRunModel.id,
        createdAt: contactSyncRunModel.createdAt,
      })
      .from(contactSyncRunModel)
      .where(
        and(
          eq(contactSyncRunModel.workspaceId, workspaceId),
          // A connect import never starts the Contacts-menu cooldown.
          eq(contactSyncRunModel.trigger, "menu"),
          exists(
            tx
              .select({ one: sql`1` })
              .from(contactSyncRunItemModel)
              .where(
                and(
                  eq(contactSyncRunItemModel.runId, contactSyncRunModel.id),
                  isNotNull(contactSyncRunItemModel.startedAt),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(contactSyncRunModel.createdAt))
      .limit(1)
    return row ?? null
  },

  async findForWorkspace(
    input: { runId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ContactSyncRunWithItems | null> {
    const row = await tx.query.contactSyncRunModel.findFirst({
      where: { id: input.runId, workspaceId: input.workspaceId },
      with: { items: { orderBy: { position: "asc" } } },
    })
    return row ?? null
  },

  async listHistory(
    input: { workspaceId: string; page?: number; perPage?: number },
    tx: DatabaseClient = db,
  ) {
    const pagination = getPaginationWithDefaults(input)
    const [data, total] = await Promise.all([
      tx.query.contactSyncRunModel.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
        with: { items: { orderBy: { position: "asc" } } },
        ...pagination,
      }),
      tx.$count(
        contactSyncRunModel,
        eq(contactSyncRunModel.workspaceId, input.workspaceId),
      ),
    ])
    return { data, total, pageCount: Math.ceil(total / pagination.limit) }
  },

  /**
   * Claims a run for THIS worker and mints a fresh token. Only a `pending`
   * run, or a `running` / `cancelling` one that is released (no token) or
   * whose lease is stale, can be claimed: a terminal run is never reopened by
   * a stale job. A paused run cannot be claimed before its pause ends, except
   * a `cancelling` one. `startedAt` is COALESCEd so resumes keep the first start.
   */
  async claim(
    input: { runId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ContactSyncRunModel | null> {
    const [row] = await tx
      .update(contactSyncRunModel)
      .set({
        status: sql`CASE WHEN ${contactSyncRunModel.status} = 'pending' THEN 'running'::"contactSyncRunStatus" ELSE ${contactSyncRunModel.status} END`,
        // Web Crypto: reachable from a Next Server Component too.
        claimToken: crypto.randomUUID(),
        pausedUntil: null,
        startedAt: sql`COALESCE(${contactSyncRunModel.startedAt}, NOW())`,
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactSyncRunModel.id, input.runId),
          // A job for another workspace must not take (and strand) the lease.
          eq(contactSyncRunModel.workspaceId, input.workspaceId),
          inArray(contactSyncRunModel.status, CONTACT_SYNC_LIVE_STATUSES),
          pauseElapsed(),
          sql`(
            ${contactSyncRunModel.status} = 'pending'
            OR ${contactSyncRunModel.claimToken} IS NULL
            OR ${contactSyncRunModel.lastHeartbeatAt} < NOW() - ${leaseStaleInterval()}
          )`,
        ),
      )
      .returning()
    return row ?? null
  },

  /**
   * Fenced heartbeat taken before every source call: `null` means the claim
   * was lost or the run is no longer live, so the caller stops at once.
   */
  renewLease(
    input: { runId: string; expect: ContactSyncRunGuard },
    tx: DatabaseClient = db,
  ) {
    return touchGuardedRun(input.runId, input.expect, tx)
  },

  /** The first item still to process, in `position` order. */
  async findNextItem(
    runId: string,
    tx: DatabaseClient = db,
  ): Promise<ContactSyncRunItemModel | null> {
    const [row] = await tx
      .select()
      .from(contactSyncRunItemModel)
      .where(
        and(
          eq(contactSyncRunItemModel.runId, runId),
          inArray(contactSyncRunItemModel.status, ["pending", "running"]),
        ),
      )
      .orderBy(contactSyncRunItemModel.position)
      .limit(1)
    return row ?? null
  },

  /**
   * Marks an item `running` with its snapshot bound, under the run's guard.
   * Keeps an existing bound so a resumed item never widens its snapshot;
   * `boundReadAt` records that the bound was read (an empty source has none).
   * An item cancelled or finished meanwhile is `itemInactive`, not a lost claim.
   */
  async startItem(
    input: {
      runId: string
      itemId: string
      expect: ContactSyncRunGuard
      upperBoundId: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<StartItemResult> {
    return await tx.transaction(async (trx) => {
      if (!(await touchGuardedRun(input.runId, input.expect, trx))) {
        return { outcome: "claimLost" }
      }
      const [row] = await trx
        .update(contactSyncRunItemModel)
        .set({
          status: "running",
          // The bound is read once: an empty first read (NULL bound) stays empty.
          upperBoundId: sql`CASE WHEN ${contactSyncRunItemModel.boundReadAt} IS NULL THEN ${input.upperBoundId} ELSE ${contactSyncRunItemModel.upperBoundId} END`,
          boundReadAt: sql`COALESCE(${contactSyncRunItemModel.boundReadAt}, NOW())`,
          startedAt: sql`COALESCE(${contactSyncRunItemModel.startedAt}, NOW())`,
          updatedAt: new Date(),
        })
        .where(openItem(input.runId, input.itemId))
        .returning()
      return row
        ? { outcome: "started", item: row }
        : { outcome: "itemInactive" }
    })
  },

  /**
   * The one fenced write after a page: cursor and counters of the item plus
   * the run heartbeat, together. Counters are incremented in SQL. A run being
   * cancelling keeps the page that was in flight but not its counters or
   * cursor (`runCancelling`); a lost claim adds nothing; an item cancelled
   * meanwhile is `itemInactive` and keeps its state. Real progress resets
   * the retry budget.
   */
  async recordItemProgress(
    input: {
      runId: string
      itemId: string
      expect: ContactSyncRunGuard
      cursor: string | null
      counters: ContactSyncItemCounters
    },
    tx: DatabaseClient = db,
  ): Promise<RecordProgressResult> {
    const { counters } = input
    return await tx.transaction(async (trx) => {
      const status = await touchGuardedRun(input.runId, input.expect, trx, {
        resetAttempts: true,
      })
      if (status === null) {
        return { outcome: "claimLost" }
      }
      if (status !== "running") {
        return { outcome: "runCancelling" }
      }
      const rows = await trx
        .update(contactSyncRunItemModel)
        .set({
          cursor: input.cursor,
          createdCount: sql`${contactSyncRunItemModel.createdCount} + ${counters.created}`,
          updatedCount: sql`${contactSyncRunItemModel.updatedCount} + ${counters.updated}`,
          skippedCount: sql`${contactSyncRunItemModel.skippedCount} + ${counters.skipped}`,
          failedCount: sql`${contactSyncRunItemModel.failedCount} + ${counters.failed}`,
          skippedValueCount: sql`${contactSyncRunItemModel.skippedValueCount} + ${counters.skippedValues}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(contactSyncRunItemModel.id, input.itemId),
            eq(contactSyncRunItemModel.runId, input.runId),
            eq(contactSyncRunItemModel.status, "running"),
          ),
        )
        .returning({ id: contactSyncRunItemModel.id })
      return rows.length > 0
        ? { outcome: "recorded" }
        : { outcome: "itemInactive" }
    })
  },

  /**
   * Terminal write of one item under the run's guard. It matches a `pending`
   * item too (the engine ends an item before starting it when its inbox is
   * gone or the bound read fails). An item already cancelled or finished is
   * `itemInactive`: the run goes on with the next item.
   */
  async finishItem(
    input: {
      runId: string
      itemId: string
      expect: ContactSyncRunGuard
      status: ContactSyncTerminalItemStatus
      currentError?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<FinishItemResult> {
    return await tx.transaction(async (trx) => {
      // An ended item gives the next one a fresh retry budget.
      if (
        !(await touchGuardedRun(input.runId, input.expect, trx, {
          resetAttempts: true,
        }))
      ) {
        return { outcome: "claimLost" }
      }
      const rows = await trx
        .update(contactSyncRunItemModel)
        .set({
          status: input.status,
          currentError: input.currentError ?? null,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(openItem(input.runId, input.itemId))
        .returning({ id: contactSyncRunItemModel.id })
      return rows.length > 0
        ? { outcome: "finished" }
        : { outcome: "itemInactive" }
    })
  },

  /** Statuses of a run's items, to settle the run's own outcome. */
  async listItemStatuses(
    runId: string,
    tx: DatabaseClient = db,
  ): Promise<ContactSyncRunItemStatus[]> {
    const rows = await tx
      .select({ status: contactSyncRunItemModel.status })
      .from(contactSyncRunItemModel)
      .where(eq(contactSyncRunItemModel.runId, runId))
    return rows.map((row) => row.status)
  },

  /**
   * Releases the lease while the run stays live and advances the
   * continuation revision (makes the next chunk's job id unique). Returns the
   * new revision, or `null` when the guard failed. `pausedUntil` parks the
   * run (the source asked to wait): nothing claims it before then.
   */
  async yieldForContinuation(
    input: {
      runId: string
      expect: ContactSyncRunGuard
      pausedUntil?: Date
      /** A retry after a transient failure: costs one attempt. */
      countAttempt?: boolean
    },
    tx: DatabaseClient = db,
  ): Promise<number | null> {
    const [row] = await tx
      .update(contactSyncRunModel)
      .set({
        claimToken: null,
        chunkSeq: sql`${contactSyncRunModel.chunkSeq} + 1`,
        pausedUntil: input.pausedUntil ?? null,
        ...retryAttempts(input),
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(guardedRun(input.runId, input.expect))
      .returning({ chunkSeq: contactSyncRunModel.chunkSeq })
    return row?.chunkSeq ?? null
  },

  /**
   * Terminal write by the claim holder. A cancel accepted after the worker
   * computed its outcome still wins: the row's own `cancelling` status is
   * read under the run lock. A run that is not cancelling does not end
   * while an item is still open (one appended after the outcome was computed
   * would be closed unread): the caller gets `open` and goes on, even when
   * the outcome it computed was `cancelled`. Only `closeOpen` (the caller
   * winds the run down: cancelled, or the workspace is gone) ends it at once
   * whatever is open. Items still
   * open on a cancelling run end `cancelled` so the history never shows a
   * source as running forever.
   */
  async finish(
    input: {
      runId: string
      expect: ContactSyncRunGuard
      outcome: FinishContactSyncRunInput
      /** Wind the run down now, closing its open items (cancel, workspace gone). */
      closeOpen: boolean
    },
    tx: DatabaseClient = db,
  ): Promise<FinishContactSyncRunResult> {
    return await tx.transaction(async (trx) => {
      // The run row first: an append holds it, so what follows sees the item
      // it added (one statement could not: its snapshot predates the wait).
      const [held] = await trx
        .select({ status: contactSyncRunModel.status })
        .from(contactSyncRunModel)
        .where(guardedRun(input.runId, input.expect))
        .for("update")
      if (!held) {
        return "lost"
      }
      // Winding down closes what is open; anything else waits for it.
      if (held.status !== "cancelling" && !input.closeOpen) {
        const [open] = await trx
          .select({ id: contactSyncRunItemModel.id })
          .from(contactSyncRunItemModel)
          .where(
            and(
              eq(contactSyncRunItemModel.runId, input.runId),
              inArray(contactSyncRunItemModel.status, ["pending", "running"]),
            ),
          )
          .limit(1)
        if (open) {
          return "open"
        }
      }
      await trx
        .update(contactSyncRunModel)
        .set({
          status:
            held.status === "cancelling" ? "cancelled" : input.outcome.status,
          ...(input.outcome.currentError !== undefined && {
            currentError: input.outcome.currentError,
          }),
          claimToken: null,
          pausedUntil: null,
          finishedAt: new Date(),
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contactSyncRunModel.id, input.runId))
      await closeOpenItems([input.runId], trx)
      return "finished"
    })
  },

  /**
   * Cancels a workspace's live run (optionally only `runId`). A run nobody
   * holds is cancelled outright; a claimed one becomes `cancelling` and its
   * claim holder winds it down at the next guarded write. Returns the row, or
   * `null` when nothing live matched.
   */
  async cancelLive(
    input: { workspaceId: string; runId?: string },
    tx: DatabaseClient = db,
  ): Promise<ContactSyncRunModel | null> {
    return await tx.transaction(async (trx) => {
      const [row] = await trx
        .update(contactSyncRunModel)
        .set(cancelPatch())
        .where(
          and(
            eq(contactSyncRunModel.workspaceId, input.workspaceId),
            input.runId ? eq(contactSyncRunModel.id, input.runId) : undefined,
            inArray(contactSyncRunModel.status, ["pending", "running"]),
          ),
        )
        .returning()
      if (row?.status === "cancelled") {
        await closeOpenItems([row.id], trx)
      }
      return row ?? null
    })
  },
}
