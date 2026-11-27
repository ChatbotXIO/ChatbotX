import { postManagementChannels } from "@chatbotx.io/utils/channel"
import { alias } from "drizzle-orm/pg-core"
import {
  type AnyColumn,
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "../../client"
import { CHANNEL_POST_SYNC_NOT_CONNECTED, inboxStatuses } from "../../partials"
import {
  channelPostModel,
  channelPostSyncModel,
  inboxModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationThreadsModel,
  integrationTiktokModel,
} from "../../schema"

/**
 * `ChannelErrorCategory` values of a failure only a person can fix by
 * re-authorising the channel (`auth_failed`, `permission_denied`), and the
 * marker of a row parked because its inbox cannot sync (`notConnected`).
 */
const REAUTH_ERROR_CATEGORIES = ["auth_failed", "permission_denied"]
const NOT_CONNECTED_CATEGORY = CHANNEL_POST_SYNC_NOT_CONNECTED

type EligibilityColumns = {
  channel: SQL | SQL.Aliased | AnyColumn
  inboxId: SQL | SQL.Aliased | AnyColumn
  workspaceId: SQL | SQL.Aliased | AnyColumn
}

/**
 * The inbox's own integration row exists (a channel-discriminated `EXISTS` on
 * the table the channel keeps its auth in, scoped by inbox AND workspace).
 * `extra` adds a condition on that integration row (`updatedAt` comparisons).
 */
const integrationExists = (
  cols: EligibilityColumns,
  extra?: (integrationUpdatedAt: AnyColumn) => SQL,
) => {
  const exists = (
    channel: string,
    model: {
      inboxId: AnyColumn
      updatedAt: AnyColumn
      workspaceId: AnyColumn
    },
  ) =>
    sql`(${cols.channel} = ${channel} AND EXISTS (SELECT 1 FROM ${model} WHERE ${model.inboxId} = ${cols.inboxId} AND ${model.workspaceId} = ${cols.workspaceId}${extra ? sql` AND ${extra(model.updatedAt)}` : sql``}))`
  return sql`(${sql.join(
    [
      exists(postManagementChannels.enum.messenger, integrationMessengerModel),
      exists(postManagementChannels.enum.instagram, integrationInstagramModel),
      exists(postManagementChannels.enum.threads, integrationThreadsModel),
      exists(postManagementChannels.enum.tiktok, integrationTiktokModel),
    ],
    sql` OR `,
  )})`
}

/**
 * The inbox table as the eligibility subquery sees it. Aliased because
 * `findEligibleInboxes` passes the outer `Inbox` columns: an unaliased inner
 * `FROM "Inbox"` would capture them and compare the inbox with itself.
 */
const connectedInbox = alias(inboxModel, "eligibleInbox")

/**
 * THE eligibility predicate: the inbox is in the workspace, is connected, and
 * its integration row (with auth) exists. Only such an inbox can be synced.
 * `extra` narrows the integration row (see {@link integrationExists}).
 */
const postSyncEligible = (
  cols: EligibilityColumns,
  extra?: (integrationUpdatedAt: AnyColumn) => SQL,
) =>
  sql`(EXISTS (SELECT 1 FROM ${inboxModel} AS ${connectedInbox} WHERE ${connectedInbox.id} = ${cols.inboxId} AND ${connectedInbox.workspaceId} = ${cols.workspaceId} AND ${connectedInbox.status} = ${inboxStatuses.enum.connected}) AND ${integrationExists(cols, extra)})`

/** {@link postSyncEligible} for a `ChannelPostSync` row. */
const rowSyncEligible = (extra?: (integrationUpdatedAt: AnyColumn) => SQL) =>
  postSyncEligible(
    {
      channel: channelPostSyncModel.channel,
      inboxId: channelPostSyncModel.inboxId,
      workspaceId: channelPostSyncModel.workspaceId,
    },
    extra,
  )

/** A sync a worker owns: its token is on the row and the row is `running`. */
const ownedBy = (input: { claimToken: string; id: string }) =>
  and(
    eq(channelPostSyncModel.id, input.id),
    eq(channelPostSyncModel.claimToken, input.claimToken),
    eq(channelPostSyncModel.status, "running"),
  )

/** A waiting row, error and lease cleared, due now. */
const idleDueNow = (now: Date) => ({
  attempts: 0,
  claimToken: null,
  lastError: null,
  lastErrorCategory: null,
  lastHeartbeatAt: null,
  nextSyncAt: now,
  status: "idle" as const,
  updatedAt: now,
})

export type ChannelPostSyncOutcomeFields = {
  attempts: number
  lastError: string | null
  lastErrorCategory: string | null
  nextSyncAt: Date | null
  resumeCursor: string | null
  syncedCount: number
}

export const channelPostSyncRepository = {
  /**
   * Inboxes of the workspace whose channel is in `channels`, optionally limited
   * to `inboxIds`, with their connection `status` and whether each is
   * `syncable` (connected with its integration row; the caller syncs only
   * those).
   */
  async findEligibleInboxes(
    input: { channels: string[]; inboxIds?: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        channel: inboxModel.channel,
        id: inboxModel.id,
        name: inboxModel.name,
        status: inboxModel.status,
        // Connected AND has its integration row: only such an inbox can sync.
        syncable: sql<boolean>`${postSyncEligible({
          channel: inboxModel.channel,
          inboxId: inboxModel.id,
          workspaceId: inboxModel.workspaceId,
        })}`,
      })
      .from(inboxModel)
      .where(
        and(
          eq(inboxModel.workspaceId, input.workspaceId),
          inArray(inboxModel.channel, input.channels),
          input.inboxIds?.length
            ? inArray(inboxModel.id, input.inboxIds)
            : undefined,
        ),
      )
      .orderBy(asc(inboxModel.id))
  },

  /** Creates the missing sync rows (idle, due now); existing rows are left as they are. */
  async ensureRows(
    input: {
      inboxes: { channel: string; id: string }[]
      now: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.inboxes.length === 0) {
      return
    }
    await tx
      .insert(channelPostSyncModel)
      .values(
        input.inboxes.map((inbox) => ({
          channel: inbox.channel,
          inboxId: inbox.id,
          nextSyncAt: input.now,
          status: "idle" as const,
          workspaceId: input.workspaceId,
        })),
      )
      .onConflictDoNothing({ target: [channelPostSyncModel.inboxId] })
  },

  async listForWorkspace(
    input: { inboxIds?: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        attempts: channelPostSyncModel.attempts,
        backfillCompletedAt: channelPostSyncModel.backfillCompletedAt,
        channel: channelPostSyncModel.channel,
        inboxId: channelPostSyncModel.inboxId,
        inboxName: inboxModel.name,
        lastError: channelPostSyncModel.lastError,
        lastErrorCategory: channelPostSyncModel.lastErrorCategory,
        lastRequestedAt: channelPostSyncModel.lastRequestedAt,
        lastSyncedAt: channelPostSyncModel.lastSyncedAt,
        nextSyncAt: channelPostSyncModel.nextSyncAt,
        status: channelPostSyncModel.status,
        syncedCount: channelPostSyncModel.syncedCount,
      })
      .from(channelPostSyncModel)
      .innerJoin(inboxModel, eq(inboxModel.id, channelPostSyncModel.inboxId))
      .where(
        and(
          eq(channelPostSyncModel.workspaceId, input.workspaceId),
          eq(inboxModel.workspaceId, input.workspaceId),
          input.inboxIds?.length
            ? inArray(channelPostSyncModel.inboxId, input.inboxIds)
            : undefined,
          rowSyncEligible(),
        ),
      )
      .orderBy(asc(channelPostSyncModel.inboxId))
  },

  /**
   * Asks for a sync now. Takes the row only when it is waiting (`idle` or
   * `failed`) and its last request is older than the cooldown; a queued or
   * running sync, or a request inside the cooldown, answers `null`.
   * `queuedUntil` is when the row is looked at again if its job is lost.
   */
  async requestRefresh(
    input: {
      cooldownMs: number
      inboxId: string
      now: Date
      queuedUntil: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(channelPostSyncModel)
      .set({
        attempts: 0,
        lastError: null,
        lastErrorCategory: null,
        lastRequestedAt: input.now,
        nextSyncAt: input.queuedUntil,
        // A refresh while the first listing is still being walked must not
        // restart it, or pressing refresh could keep it from ever finishing.
        resumeCursor: sql`CASE WHEN ${channelPostSyncModel.backfillCompletedAt} IS NULL THEN ${channelPostSyncModel.resumeCursor} END`,
        status: "queued",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(channelPostSyncModel.inboxId, input.inboxId),
          eq(channelPostSyncModel.workspaceId, input.workspaceId),
          inArray(channelPostSyncModel.status, ["idle", "failed"]),
          rowSyncEligible(),
          or(
            isNull(channelPostSyncModel.lastRequestedAt),
            lte(
              channelPostSyncModel.lastRequestedAt,
              new Date(input.now.getTime() - input.cooldownMs),
            ),
          ),
        ),
      )
      .returning({
        id: channelPostSyncModel.id,
        inboxId: channelPostSyncModel.inboxId,
      })

    return row ?? null
  },

  /**
   * Queues the rows that are due: waiting rows past `nextSyncAt`, queued rows
   * whose job was lost, and running rows whose owner stopped heartbeating
   * (their token is cleared, so the stalled owner can no longer write). Rows
   * are locked with `SKIP LOCKED`, so two scanners never take the same row.
   */
  async queueDue(
    input: {
      batchSize: number
      now: Date
      queuedUntil: Date
      stalledBefore: Date
    },
    tx: DatabaseClient = db,
  ) {
    return await tx.transaction(async (client) => {
      const due = await client
        .select({ id: channelPostSyncModel.id })
        .from(channelPostSyncModel)
        .where(
          and(
            or(
              and(
                inArray(channelPostSyncModel.status, ["idle", "queued"]),
                lte(channelPostSyncModel.nextSyncAt, input.now),
              ),
              and(
                eq(channelPostSyncModel.status, "running"),
                lt(channelPostSyncModel.lastHeartbeatAt, input.stalledBefore),
              ),
            ),
            rowSyncEligible(),
          ),
        )
        .orderBy(
          asc(channelPostSyncModel.nextSyncAt),
          asc(channelPostSyncModel.id),
        )
        .limit(input.batchSize)
        .for("update", { skipLocked: true })
      if (due.length === 0) {
        return []
      }
      return await client
        .update(channelPostSyncModel)
        .set({
          claimToken: null,
          nextSyncAt: input.queuedUntil,
          status: "queued",
          updatedAt: input.now,
        })
        .where(
          inArray(
            channelPostSyncModel.id,
            due.map((row) => row.id),
          ),
        )
        .returning({
          channel: channelPostSyncModel.channel,
          id: channelPostSyncModel.id,
          inboxId: channelPostSyncModel.inboxId,
          workspaceId: channelPostSyncModel.workspaceId,
        })
    })
  },

  /** Takes a queued row for one worker; `null` when it is no longer queued or its inbox can no longer sync. */
  async claim(
    input: { claimToken: string; inboxId: string; now: Date },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(channelPostSyncModel)
      .set({
        claimToken: input.claimToken,
        lastHeartbeatAt: input.now,
        status: "running",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(channelPostSyncModel.inboxId, input.inboxId),
          eq(channelPostSyncModel.status, "queued"),
          rowSyncEligible(),
        ),
      )
      .returning({
        attempts: channelPostSyncModel.attempts,
        backfillCompletedAt: channelPostSyncModel.backfillCompletedAt,
        channel: channelPostSyncModel.channel,
        id: channelPostSyncModel.id,
        inboxId: channelPostSyncModel.inboxId,
        resumeCursor: channelPostSyncModel.resumeCursor,
        syncedCount: channelPostSyncModel.syncedCount,
        workspaceId: channelPostSyncModel.workspaceId,
      })

    return row ?? null
  },

  /** Heartbeat plus the listing position; `false` means the worker lost the row. */
  async saveProgress(
    input: {
      claimToken: string
      id: string
      now: Date
      resumeCursor: string | null
      syncedCount: number
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(channelPostSyncModel)
      .set({
        lastHeartbeatAt: input.now,
        resumeCursor: input.resumeCursor,
        syncedCount: input.syncedCount,
        updatedAt: input.now,
      })
      .where(ownedBy(input))
      .returning({ id: channelPostSyncModel.id })

    return rows.length > 0
  },

  /** Hands the row back to the scanner: waiting until `nextSyncAt`, ownership released. */
  async release(
    input: {
      claimToken: string
      id: string
      markBackfillComplete: boolean
      markSynced: boolean
      now: Date
      outcome: ChannelPostSyncOutcomeFields
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(channelPostSyncModel)
      .set({
        attempts: input.outcome.attempts,
        backfillCompletedAt: input.markBackfillComplete
          ? sql`COALESCE(${channelPostSyncModel.backfillCompletedAt}, ${input.now}::timestamptz)`
          : channelPostSyncModel.backfillCompletedAt,
        claimToken: null,
        lastError: input.outcome.lastError,
        lastErrorCategory: input.outcome.lastErrorCategory,
        lastHeartbeatAt: null,
        lastSyncedAt: input.markSynced
          ? input.now
          : channelPostSyncModel.lastSyncedAt,
        nextSyncAt: input.outcome.nextSyncAt,
        resumeCursor: input.outcome.resumeCursor,
        status: "idle",
        syncedCount: input.outcome.syncedCount,
        updatedAt: input.now,
      })
      .where(ownedBy(input))
      .returning({ id: channelPostSyncModel.id })

    return rows.length > 0
  },

  /** Stops the sync until a person acts (re-authorise or refresh). */
  async markFailed(
    input: {
      claimToken: string
      id: string
      lastError: string
      lastErrorCategory: string | null
      now: Date
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(channelPostSyncModel)
      .set({
        claimToken: null,
        lastError: input.lastError,
        lastErrorCategory: input.lastErrorCategory,
        lastHeartbeatAt: null,
        nextSyncAt: null,
        status: "failed",
        updatedAt: input.now,
      })
      .where(ownedBy(input))
      .returning({ id: channelPostSyncModel.id })

    return rows.length > 0
  },

  /**
   * Parks the rows (`failed`, `idle`, `queued`) whose inbox cannot sync any
   * more (disconnected, or connected without its integration row): `idle`, no
   * next time, no error, category `notConnected`. Repairs rows written before
   * that state existed. Bounded; already parked rows are skipped. Returns how
   * many it parked.
   */
  async parkIneligible(
    input: { batchSize: number; now: Date },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.transaction(async (client) => {
      const rows = await client
        .select({ id: channelPostSyncModel.id })
        .from(channelPostSyncModel)
        .where(
          and(
            inArray(channelPostSyncModel.status, ["failed", "idle", "queued"]),
            sql`NOT ${rowSyncEligible()}`,
            sql`NOT (${channelPostSyncModel.status} = 'idle' AND ${channelPostSyncModel.nextSyncAt} IS NULL AND ${channelPostSyncModel.lastError} IS NULL AND ${channelPostSyncModel.attempts} = 0 AND ${channelPostSyncModel.lastErrorCategory} = ${NOT_CONNECTED_CATEGORY})`,
          ),
        )
        .orderBy(asc(channelPostSyncModel.id))
        .limit(input.batchSize)
        .for("update", { skipLocked: true })
      if (rows.length === 0) {
        return 0
      }
      const parked = await client
        .update(channelPostSyncModel)
        .set({
          attempts: 0,
          claimToken: null,
          lastError: null,
          lastErrorCategory: NOT_CONNECTED_CATEGORY,
          nextSyncAt: null,
          status: "idle",
          updatedAt: input.now,
        })
        .where(
          inArray(
            channelPostSyncModel.id,
            rows.map((row) => row.id),
          ),
        )
        .returning({ id: channelPostSyncModel.id })
      return parked.length
    })
  },

  /**
   * An inbox came back without new credentials (tenant resume): only a row
   * parked as `notConnected` becomes due again. A `failed` auth row is left to
   * `releaseRecoveredAuthFailures`, which needs the integration to have changed.
   */
  async releaseParkedForInbox(
    input: { inboxId: string; now: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(channelPostSyncModel)
      .set(idleDueNow(input.now))
      .where(
        and(
          eq(channelPostSyncModel.inboxId, input.inboxId),
          eq(channelPostSyncModel.workspaceId, input.workspaceId),
          eq(channelPostSyncModel.status, "idle"),
          eq(channelPostSyncModel.lastErrorCategory, NOT_CONNECTED_CATEGORY),
        ),
      )
      .returning({ id: channelPostSyncModel.id })
    return rows.length > 0
  },

  /**
   * Safety net for any path that turned an inbox back on without resetting its
   * sync: makes due again the rows parked as `notConnected` whose inbox and
   * integration are now syncable. Bounded; returns how many it released.
   */
  async releaseReconnectedParked(
    input: { batchSize: number; now: Date },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.transaction(async (client) => {
      const rows = await client
        .select({ id: channelPostSyncModel.id })
        .from(channelPostSyncModel)
        .where(
          and(
            eq(channelPostSyncModel.status, "idle"),
            eq(channelPostSyncModel.lastErrorCategory, NOT_CONNECTED_CATEGORY),
            rowSyncEligible(),
          ),
        )
        .orderBy(asc(channelPostSyncModel.id))
        .limit(input.batchSize)
        .for("update", { skipLocked: true })
      if (rows.length === 0) {
        return 0
      }
      const released = await client
        .update(channelPostSyncModel)
        .set(idleDueNow(input.now))
        .where(
          inArray(
            channelPostSyncModel.id,
            rows.map((row) => row.id),
          ),
        )
        .returning({ id: channelPostSyncModel.id })
      return released.length
    })
  },

  /**
   * Makes due again the `auth_failed` / `permission_denied` rows of syncable
   * inboxes whose integration row changed after the failure (`updatedAt`
   * newer than the row's: a re-authorisation or a token refresh). Without such
   * a change a permanent auth failure is never retried. Bounded; returns how
   * many it released.
   */
  async releaseRecoveredAuthFailures(
    input: { batchSize: number; now: Date },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.transaction(async (client) => {
      const rows = await client
        .select({ id: channelPostSyncModel.id })
        .from(channelPostSyncModel)
        .where(
          and(
            eq(channelPostSyncModel.status, "failed"),
            inArray(
              channelPostSyncModel.lastErrorCategory,
              REAUTH_ERROR_CATEGORIES,
            ),
            rowSyncEligible(
              (integrationUpdatedAt) =>
                sql`${integrationUpdatedAt} > ${channelPostSyncModel.updatedAt}`,
            ),
          ),
        )
        .orderBy(asc(channelPostSyncModel.id))
        .limit(input.batchSize)
        .for("update", { skipLocked: true })
      if (rows.length === 0) {
        return 0
      }
      const released = await client
        .update(channelPostSyncModel)
        .set(idleDueNow(input.now))
        .where(
          inArray(
            channelPostSyncModel.id,
            rows.map((row) => row.id),
          ),
        )
        .returning({ id: channelPostSyncModel.id })
      return released.length
    })
  },

  /**
   * The inbox's authorisation changed (reconnect): a `failed` row, or one
   * parked as `notConnected`, goes back to `idle`, due now, with its error,
   * attempts and lease cleared. A queued or running sync is left alone.
   */
  async resetAfterAuthChange(
    input: { inboxId: string; now: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(channelPostSyncModel)
      .set(idleDueNow(input.now))
      .where(
        and(
          eq(channelPostSyncModel.inboxId, input.inboxId),
          eq(channelPostSyncModel.workspaceId, input.workspaceId),
          or(
            eq(channelPostSyncModel.status, "failed"),
            and(
              eq(channelPostSyncModel.status, "idle"),
              eq(
                channelPostSyncModel.lastErrorCategory,
                NOT_CONNECTED_CATEGORY,
              ),
            ),
          ),
        ),
      )
      .returning({ id: channelPostSyncModel.id })
    return rows.length > 0
  },
  /**
   * The workspace's posts among `ids` (removed ones are not returned), each
   * flagged with whether its inbox can be read ({@link postSyncEligible}).
   * Scoped by `workspaceId`; an id of another workspace is never returned.
   */
  async findMetricsRefreshCandidates(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    if (input.ids.length === 0) {
      return []
    }
    return await tx
      .select({
        channel: channelPostModel.channel,
        eligible: sql<boolean>`${postSyncEligible({
          channel: channelPostModel.channel,
          inboxId: channelPostModel.inboxId,
          workspaceId: channelPostModel.workspaceId,
        })}`,
        externalPostId: channelPostModel.externalPostId,
        id: channelPostModel.id,
        inboxId: channelPostModel.inboxId,
        metricsFetchedAt: channelPostModel.metricsFetchedAt,
      })
      .from(channelPostModel)
      .where(
        and(
          eq(channelPostModel.workspaceId, input.workspaceId),
          isNull(channelPostModel.removedAt),
          inArray(channelPostModel.id, input.ids),
        ),
      )
  },
}
