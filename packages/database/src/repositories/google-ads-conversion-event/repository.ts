import type { PgColumn } from "drizzle-orm/pg-core"
import {
  and,
  asc,
  type DatabaseClient,
  db,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  type SQL,
  sql,
} from "../../client"
import {
  GOOGLE_ADS_EVENTS_MAX_PER_PAGE,
  type GoogleAdsChannel,
  type GoogleAdsEventOptions,
  type GoogleAdsEventStatus,
  type GoogleAdsFailureStage,
  type GoogleAdsProcessingDetail,
  type GoogleAdsProcessingStatus,
} from "../../partials/google-ads"
import { zonedDateKey } from "../../queries/date-bucket"
import { googleAdsConversionEventModel } from "../../schema"
import type { GoogleAdsConversionEventModel } from "../../types"

/** Every insert writes the immutable `options` snapshot; the column is nullable only for older rows. */
export type GoogleAdsConversionEventCreateValues = Omit<
  typeof googleAdsConversionEventModel.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "options"
> & { options: GoogleAdsEventOptions }

type EventRef = { id: string; workspaceId: string }
type ClaimedEventRef = EventRef & { claimToken: string }

/** Statuses a claimed (`sending`) event can be finished into. */
type FinishStatus = Extract<
  GoogleAdsEventStatus,
  "sent" | "failed" | "skipped_no_account" | "skipped_expired"
>

export type FinishSendingInput = ClaimedEventRef & {
  to: FinishStatus
  requestId?: string | null
  sentAt?: Date | null
  error?: string | null
  failureStage?: GoogleAdsFailureStage | null
  processingStatus?: GoogleAdsProcessingStatus | null
  nextProcessingCheckAt?: Date | null
}

export type FinishSendingProcessedInput = ClaimedEventRef & {
  /** The generation the lease was claimed for. */
  attempt: number
  requestId: string
  sentAt: Date
  processingDetail: GoogleAdsProcessingDetail
}

export type ListGoogleAdsEventsInput = {
  workspaceId: string
  status?: GoogleAdsEventStatus
  channel?: GoogleAdsChannel
  conversionActionId?: string
  since?: Date
  until?: Date
  page: number
  /** Clamped to `GOOGLE_ADS_EVENTS_MAX_PER_PAGE`. */
  perPage: number
}

/** The shared event window: always one workspace; the instants are inclusive. */
type WindowFilterInput = {
  workspaceId: string
  channel?: GoogleAdsChannel
  conversionActionId?: string
  since?: Date
  until?: Date
}

/** The filters every stats read shares (`since`/`until` are required, so a stats query is always bounded). */
export type GoogleAdsStatsFilters = WindowFilterInput & {
  since: Date
  until: Date
}

export type GoogleAdsDayChannelStatsRow = {
  date: string
  channel: string
  pending: number
  sending: number
  sent: number
  processed: number
  failed: number
  skipped_no_account: number
  skipped_expired: number
  failedDelivery: number
  failedProcessing: number
  failedTimeout: number
  failedUnknown: number
}

export type GoogleAdsActionStatsRow = {
  conversionActionId: string
  name: string | null
  category: string | null
  pending: number
  sending: number
  sent: number
  processed: number
  failed: number
  skipped_no_account: number
  skipped_expired: number
}

export type GoogleAdsConfirmedValueRow = {
  currency: string | null
  /** Exact decimal text (`numeric` summed in PostgreSQL), never a float. */
  value: string
  count: number
}

export type ApplyProcessingResultInput = EventRef & {
  to: Extract<GoogleAdsEventStatus, "sent" | "processed" | "failed">
  processingStatus: GoogleAdsProcessingStatus
  processingDetail?: GoogleAdsProcessingDetail | null
  failureStage?: GoogleAdsFailureStage | null
  error?: string | null
  nextProcessingCheckAt: Date | null
  processingAttempts: number
  /** Fence: the poll only applies to the generation and request it read. */
  expectedRequestId: string | null
  expectedAttempt: number
}

/** The one where-builder for event reads; `workspaceId` is unconditional. */
const windowFilters = (input: WindowFilterInput): SQL | undefined =>
  and(
    eq(googleAdsConversionEventModel.workspaceId, input.workspaceId),
    input.channel
      ? eq(googleAdsConversionEventModel.channel, input.channel)
      : undefined,
    input.conversionActionId
      ? eq(
          googleAdsConversionEventModel.conversionActionId,
          input.conversionActionId,
        )
      : undefined,
    input.since
      ? gte(googleAdsConversionEventModel.occurredAt, input.since)
      : undefined,
    input.until
      ? lte(googleAdsConversionEventModel.occurredAt, input.until)
      : undefined,
  )

const countWhere = (condition: SQL | undefined) =>
  sql`count(*) FILTER (WHERE ${condition})`.mapWith(Number)

const countStatus = (status: GoogleAdsEventStatus) =>
  countWhere(eq(googleAdsConversionEventModel.status, status))

const countFailedAt = (stage: GoogleAdsFailureStage | null) =>
  countWhere(
    and(
      eq(googleAdsConversionEventModel.status, "failed"),
      stage === null
        ? isNull(googleAdsConversionEventModel.failureStage)
        : eq(googleAdsConversionEventModel.failureStage, stage),
    ),
  )

/** One count per status, so a grouped row carries all seven. */
const statusCountColumns = () => ({
  pending: countStatus("pending"),
  sending: countStatus("sending"),
  sent: countStatus("sent"),
  processed: countStatus("processed"),
  failed: countStatus("failed"),
  skipped_no_account: countStatus("skipped_no_account"),
  skipped_expired: countStatus("skipped_expired"),
})

/** The most recent snapshot of a column across the group (a rename shows the new value). */
const latestOf = <T>(column: PgColumn) =>
  sql<T | null>`(array_agg(${column} ORDER BY ${googleAdsConversionEventModel.occurredAt} DESC, ${googleAdsConversionEventModel.id} DESC))[1]`

/** `undefined` = no fence, `null` = the event must be unleased. */
const claimTokenFence = (token: string | null | undefined) => {
  if (token === undefined) {
    return
  }
  return token === null
    ? isNull(googleAdsConversionEventModel.claimToken)
    : eq(googleAdsConversionEventModel.claimToken, token)
}

export const googleAdsConversionEventRepository = {
  async insertIgnoreDuplicate(
    values: GoogleAdsConversionEventCreateValues,
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel | null> {
    const [row] = await tx
      .insert(googleAdsConversionEventModel)
      .values(values)
      .onConflictDoNothing({
        target: [
          googleAdsConversionEventModel.workspaceId,
          googleAdsConversionEventModel.transactionId,
        ],
      })
      .returning()

    return row ?? null
  },

  async findByTransactionId(
    input: { workspaceId: string; transactionId: string },
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel | null> {
    const [row] = await tx
      .select()
      .from(googleAdsConversionEventModel)
      .where(
        and(
          eq(googleAdsConversionEventModel.workspaceId, input.workspaceId),
          eq(googleAdsConversionEventModel.transactionId, input.transactionId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  async findWorkspaceEvent(
    input: EventRef,
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel | null> {
    const [row] = await tx
      .select()
      .from(googleAdsConversionEventModel)
      .where(
        and(
          eq(googleAdsConversionEventModel.id, input.id),
          eq(googleAdsConversionEventModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  /**
   * Takes the delivery lease: only a `pending` row whose generation equals the
   * job's. A stale job (older generation) or a concurrent worker claims nothing.
   */
  async claimForSending(
    input: ClaimedEventRef & { attempt: number },
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel | null> {
    const [row] = await tx
      .update(googleAdsConversionEventModel)
      .set({
        status: "sending",
        claimToken: input.claimToken,
        claimedAt: new Date(),
      })
      .where(
        and(
          eq(googleAdsConversionEventModel.id, input.id),
          eq(googleAdsConversionEventModel.workspaceId, input.workspaceId),
          eq(googleAdsConversionEventModel.status, "pending"),
          eq(googleAdsConversionEventModel.attempt, input.attempt),
        ),
      )
      .returning()

    return row ?? null
  },

  /** Ends a lease; a rotated token (sweeper redrive) makes this a no-op. */
  async finishSending(
    input: FinishSendingInput,
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel | null> {
    const [row] = await tx
      .update(googleAdsConversionEventModel)
      .set({
        status: input.to,
        claimToken: null,
        claimedAt: null,
        requestId: input.requestId ?? null,
        sentAt: input.sentAt ?? null,
        error: input.error ?? null,
        failureStage: input.failureStage ?? null,
        processingStatus: input.processingStatus ?? null,
        nextProcessingCheckAt: input.nextProcessingCheckAt ?? null,
      })
      .where(
        and(
          eq(googleAdsConversionEventModel.id, input.id),
          eq(googleAdsConversionEventModel.workspaceId, input.workspaceId),
          eq(googleAdsConversionEventModel.status, "sending"),
          eq(googleAdsConversionEventModel.claimToken, input.claimToken),
        ),
      )
      .returning()

    return row ?? null
  },

  /**
   * Stamps `processingDetail.sendAttemptedAt` (first stamp wins) under the
   * lease, BEFORE a legacy upload leaves the process. Returns the row only
   * while the lease is still ours, so a worker that lost it never sends.
   */
  async markSendAttempted(
    input: ClaimedEventRef & { attempt: number; at: Date },
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel | null> {
    const [row] = await tx
      .update(googleAdsConversionEventModel)
      .set({
        processingDetail: sql`jsonb_build_object('sendAttemptedAt', ${input.at.toISOString()}::text) || coalesce(${googleAdsConversionEventModel.processingDetail}, '{}'::jsonb)`,
      })
      .where(
        and(
          eq(googleAdsConversionEventModel.id, input.id),
          eq(googleAdsConversionEventModel.workspaceId, input.workspaceId),
          eq(googleAdsConversionEventModel.status, "sending"),
          eq(googleAdsConversionEventModel.claimToken, input.claimToken),
          eq(googleAdsConversionEventModel.attempt, input.attempt),
        ),
      )
      .returning()

    return row ?? null
  },

  /**
   * Direct completion of a transport that answers synchronously (legacy
   * upload): `sending` -> `processed` in ONE statement, fenced by claim token
   * AND generation. The caller must check the returned row; a `null` means
   * the lease was lost and nothing was written.
   */
  async finishSendingProcessed(
    input: FinishSendingProcessedInput,
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel | null> {
    const [row] = await tx
      .update(googleAdsConversionEventModel)
      .set({
        status: "processed",
        processingStatus: "success",
        requestId: input.requestId,
        sentAt: input.sentAt,
        processingCheckedAt: new Date(),
        processingAttempts: 1,
        processingDetail: input.processingDetail,
        claimToken: null,
        claimedAt: null,
        error: null,
        failureStage: null,
        nextProcessingCheckAt: null,
      })
      .where(
        and(
          eq(googleAdsConversionEventModel.id, input.id),
          eq(googleAdsConversionEventModel.workspaceId, input.workspaceId),
          eq(googleAdsConversionEventModel.status, "sending"),
          eq(googleAdsConversionEventModel.claimToken, input.claimToken),
          eq(googleAdsConversionEventModel.attempt, input.attempt),
        ),
      )
      .returning()

    return row ?? null
  },

  /** Gives the lease back and moves to the next generation (deferral). */
  async releaseClaim(
    input: ClaimedEventRef & { nextAttempt: number },
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel | null> {
    const [row] = await tx
      .update(googleAdsConversionEventModel)
      .set({
        status: "pending",
        attempt: input.nextAttempt,
        claimToken: null,
        claimedAt: null,
      })
      .where(
        and(
          eq(googleAdsConversionEventModel.id, input.id),
          eq(googleAdsConversionEventModel.workspaceId, input.workspaceId),
          eq(googleAdsConversionEventModel.status, "sending"),
          eq(googleAdsConversionEventModel.claimToken, input.claimToken),
        ),
      )
      .returning()

    return row ?? null
  },

  /**
   * Moves a stuck/failed event to the next generation. `expectedAttempt` makes
   * two concurrent redrives (sweeper + retry button) collapse to one.
   */
  async redrive(
    input: EventRef & {
      fromStatuses: GoogleAdsEventStatus[]
      expectedAttempt: number
      /** Also fence on the Data Manager request the caller observed. */
      expectedRequestId?: string
      /**
       * Also fence on the lease the caller observed (`null` = unleased): a
       * claim released and re-acquired on the same generation has a new token,
       * so a stale sweeper cannot revoke the fresh lease.
       */
      expectedClaimToken?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel | null> {
    const [row] = await tx
      .update(googleAdsConversionEventModel)
      .set({
        status: "pending",
        attempt: input.expectedAttempt + 1,
        claimToken: null,
        claimedAt: null,
        failureStage: null,
        error: null,
        requestId: null,
        sentAt: null,
        processingStatus: null,
        // Only the "an upload may already have left" stamp outlives a redrive.
        processingDetail: sql`CASE WHEN ${googleAdsConversionEventModel.processingDetail}->>'sendAttemptedAt' IS NOT NULL THEN jsonb_build_object('sendAttemptedAt', ${googleAdsConversionEventModel.processingDetail}->>'sendAttemptedAt') ELSE NULL END`,
        processingCheckedAt: null,
        processingAttempts: 0,
        nextProcessingCheckAt: null,
      })
      .where(
        and(
          eq(googleAdsConversionEventModel.id, input.id),
          eq(googleAdsConversionEventModel.workspaceId, input.workspaceId),
          inArray(googleAdsConversionEventModel.status, input.fromStatuses),
          eq(googleAdsConversionEventModel.attempt, input.expectedAttempt),
          input.expectedRequestId === undefined
            ? undefined
            : eq(
                googleAdsConversionEventModel.requestId,
                input.expectedRequestId,
              ),
          claimTokenFence(input.expectedClaimToken),
        ),
      )
      .returning()

    return row ?? null
  },

  /** Records a request-status poll outcome for a `sent` event. */
  async applyProcessingResult(
    input: ApplyProcessingResultInput,
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel | null> {
    const [row] = await tx
      .update(googleAdsConversionEventModel)
      .set({
        status: input.to,
        processingStatus: input.processingStatus,
        processingDetail: input.processingDetail ?? null,
        processingCheckedAt: new Date(),
        processingAttempts: input.processingAttempts,
        nextProcessingCheckAt: input.nextProcessingCheckAt,
        failureStage: input.failureStage ?? null,
        error: input.error ?? null,
      })
      .where(
        and(
          eq(googleAdsConversionEventModel.id, input.id),
          eq(googleAdsConversionEventModel.workspaceId, input.workspaceId),
          eq(googleAdsConversionEventModel.status, "sent"),
          eq(googleAdsConversionEventModel.attempt, input.expectedAttempt),
          input.expectedRequestId === null
            ? isNull(googleAdsConversionEventModel.requestId)
            : eq(
                googleAdsConversionEventModel.requestId,
                input.expectedRequestId,
              ),
        ),
      )
      .returning()

    return row ?? null
  },

  async listByWorkspace(
    input: ListGoogleAdsEventsInput,
    tx: DatabaseClient = db,
  ): Promise<{ rows: GoogleAdsConversionEventModel[]; total: number }> {
    const perPage = Math.min(input.perPage, GOOGLE_ADS_EVENTS_MAX_PER_PAGE)
    const where = and(
      windowFilters(input),
      input.status
        ? eq(googleAdsConversionEventModel.status, input.status)
        : undefined,
    )
    const [rows, total] = await Promise.all([
      tx
        .select()
        .from(googleAdsConversionEventModel)
        .where(where)
        .orderBy(
          desc(googleAdsConversionEventModel.occurredAt),
          desc(googleAdsConversionEventModel.id),
        )
        .limit(perPage)
        .offset((input.page - 1) * perPage),
      tx.$count(googleAdsConversionEventModel, where),
    ])

    return { rows, total }
  },

  /**
   * Status and failure-stage counts per local day and channel. The date is the
   * FIRST select key and grouped by ordinal: a bound timezone parameter renders
   * as a different placeholder in SELECT and GROUP BY, which PostgreSQL rejects
   * as two different expressions.
   */
  async statsByDayAndChannel(
    filters: GoogleAdsStatsFilters,
    timezone: string,
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsDayChannelStatsRow[]> {
    return await tx
      .select({
        date: zonedDateKey(googleAdsConversionEventModel.occurredAt, timezone),
        channel: googleAdsConversionEventModel.channel,
        ...statusCountColumns(),
        failedDelivery: countFailedAt("delivery"),
        failedProcessing: countFailedAt("processing"),
        failedTimeout: countFailedAt("timeout"),
        // A failed row without a stage; counted directly, never by subtraction.
        failedUnknown: countFailedAt(null),
      })
      .from(googleAdsConversionEventModel)
      .where(windowFilters(filters))
      .groupBy(sql`1`, googleAdsConversionEventModel.channel)
  },

  /**
   * Status counts per conversion action, busiest first (id breaks ties so the
   * cut is deterministic). Asks for `limit + 1` rows so the caller can tell
   * whether it was truncated.
   */
  async statsByAction(
    filters: GoogleAdsStatsFilters,
    limit: number,
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsActionStatsRow[]> {
    return await tx
      .select({
        conversionActionId: googleAdsConversionEventModel.conversionActionId,
        name: latestOf<string>(
          googleAdsConversionEventModel.conversionActionName,
        ),
        category: latestOf<string>(
          googleAdsConversionEventModel.conversionActionCategory,
        ),
        ...statusCountColumns(),
      })
      .from(googleAdsConversionEventModel)
      .where(windowFilters(filters))
      .groupBy(googleAdsConversionEventModel.conversionActionId)
      .orderBy(
        sql`count(*) DESC`,
        asc(googleAdsConversionEventModel.conversionActionId),
      )
      .limit(limit + 1)
  },

  /** Confirmed (`processed`) value per currency; events without a value add nothing. */
  async confirmedValueByCurrency(
    filters: GoogleAdsStatsFilters,
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConfirmedValueRow[]> {
    return await tx
      .select({
        currency: googleAdsConversionEventModel.currency,
        value: sql<string>`sum(${googleAdsConversionEventModel.value})::text`,
        count: sql`count(*)`.mapWith(Number),
      })
      .from(googleAdsConversionEventModel)
      .where(
        and(
          windowFilters(filters),
          eq(googleAdsConversionEventModel.status, "processed"),
          isNotNull(googleAdsConversionEventModel.value),
        ),
      )
      .groupBy(googleAdsConversionEventModel.currency)
      .orderBy(asc(googleAdsConversionEventModel.currency))
  },

  /** Whether the workspace has ever recorded an event (any date). */
  async existsForWorkspace(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .select({ one: sql`1` })
      .from(googleAdsConversionEventModel)
      .where(eq(googleAdsConversionEventModel.workspaceId, workspaceId))
      .limit(1)

    return rows.length > 0
  },

  /** `sent` events whose Data Manager request is due for a status poll (oldest due first). */
  async listDueForProcessingCheck(
    input: { now: Date; limit: number },
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel[]> {
    return await tx
      .select()
      .from(googleAdsConversionEventModel)
      .where(
        and(
          eq(googleAdsConversionEventModel.status, "sent"),
          // A legacy upload is complete when sent: there is nothing to poll.
          eq(googleAdsConversionEventModel.uploadMethod, "dataManager"),
          isNotNull(googleAdsConversionEventModel.nextProcessingCheckAt),
          lte(googleAdsConversionEventModel.nextProcessingCheckAt, input.now),
        ),
      )
      .orderBy(
        asc(googleAdsConversionEventModel.nextProcessingCheckAt),
        asc(googleAdsConversionEventModel.id),
      )
      .limit(input.limit)
  },

  /**
   * Moves a row the sweeper deliberately skipped (blocked workspace, live job) to the back
   * of `listStranded`'s `updatedAt` order, so it cannot starve the rows behind it.
   */
  async touchStranded(
    input: EventRef & { status: GoogleAdsEventStatus; attempt: number },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(googleAdsConversionEventModel)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(googleAdsConversionEventModel.id, input.id),
          eq(googleAdsConversionEventModel.workspaceId, input.workspaceId),
          eq(googleAdsConversionEventModel.status, input.status),
          eq(googleAdsConversionEventModel.attempt, input.attempt),
        ),
      )
  },

  /**
   * Candidates for the stranded-work sweeper, as two independent windows so a
   * wall of live pending rows can never push stale leases out of the batch:
   * stale `sending` rows (ordered by `claimedAt`, served by the
   * `(status, claimedAt)` index) and stale `pending` rows past the 6 h click
   * gate (ordered by `updatedAt`). `limit` applies to each window. The caller
   * still checks the BullMQ job state before redriving a pending row.
   */
  async listStranded(
    input: {
      pendingOlderThan: Date
      sixHourGateBefore: Date
      sendingOlderThan: Date
      limit: number
    },
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsConversionEventModel[]> {
    const [sending, pending] = await Promise.all([
      tx
        .select()
        .from(googleAdsConversionEventModel)
        .where(
          and(
            eq(googleAdsConversionEventModel.status, "sending"),
            lt(googleAdsConversionEventModel.claimedAt, input.sendingOlderThan),
          ),
        )
        .orderBy(asc(googleAdsConversionEventModel.claimedAt))
        .limit(input.limit),
      tx
        .select()
        .from(googleAdsConversionEventModel)
        .where(
          and(
            eq(googleAdsConversionEventModel.status, "pending"),
            lt(googleAdsConversionEventModel.updatedAt, input.pendingOlderThan),
            lt(
              googleAdsConversionEventModel.googleClickReceivedAt,
              input.sixHourGateBefore,
            ),
          ),
        )
        .orderBy(asc(googleAdsConversionEventModel.updatedAt))
        .limit(input.limit),
    ])

    return [...sending, ...pending]
  },
}
