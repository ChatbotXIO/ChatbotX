import { and, type DatabaseClient, db, eq, isNull, sql } from "../../client"
import type {
  SocialPostScheduleMode,
  SocialPostStatus,
  SocialPostTargetStatus,
} from "../../partials/social-post"
import {
  publishDestinationScheduleModel,
  socialPostModel,
  socialPostTargetModel,
  workspaceModel,
} from "../../schema"
import { publishDestinationRepository } from "../publish-destination/repository"

/** Why a target of a due list was given up instead of published. */
export type MissedTargetError = { code: string; message: string }

/** The schedule columns of one target. All of them are written in one statement. */
export type TargetScheduleValues = {
  queueSlotAt: Date | null
  scheduleMode: SocialPostScheduleMode
  scheduledAt: Date | null
  timezone: string | null
}

/**
 * A pending target a schedule operation may move: nothing ever tried it
 * (`attemptCount = 0`), and it is not due within the lead time. The same
 * predicate guards every UPDATE, so a target a worker is about to claim is
 * never rescheduled under it.
 */
export type ReschedulableTarget = {
  attemptCount: number
  id: string
  nextAttemptAt: Date | null
  queueSlotAt: Date | null
  scheduleMode: SocialPostScheduleMode
  scheduledAt: Date | null
  publishDestinationId: string
  status: SocialPostTargetStatus
  timezone: string | null
}

export type QueuedTarget = {
  id: string
  queueSlotAt: Date
  socialPostId: string
}

export type PostingScheduleRow = {
  id: string
  slots: (typeof publishDestinationScheduleModel.$inferSelect)["slots"]
  timezone: string
  updatedAt: Date
}

/** The post states a schedule operation leaves a post in. */
export type SchedulablePostStatus = Extract<
  SocialPostStatus,
  "draft" | "scheduled"
>

const lockKey = (destinationId: string) => `social-post-queue:${destinationId}`

export const socialPostSchedulingRepository = {
  /**
   * Takes the destinations' queue locks for the rest of the transaction, in id
   * order so two callers that share several destinations cannot deadlock. Every
   * operation that reads or writes a destination's slots calls this first.
   */
  async lockDestinations(
    destinationIds: readonly string[],
    tx: DatabaseClient,
  ): Promise<void> {
    for (const id of [...new Set(destinationIds)].sort((a, b) =>
      a.length === b.length ? a.localeCompare(b) : a.length - b.length,
    )) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(id)}, 0))`,
      )
    }
  },

  /**
   * Locks every destination a post has a target on (see `lockDestinations`),
   * together with `alsoDestinationIds` (destinations an edit is about to add) in
   * ONE sorted pass, so a caller that holds both sets cannot invert the order
   * another caller takes them in.
   */
  async lockPostDestinations(
    input: {
      alsoDestinationIds?: readonly string[]
      socialPostId: string
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<void> {
    const rows = await tx
      .selectDistinct({
        destinationId: socialPostTargetModel.publishDestinationId,
      })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.socialPostId, input.socialPostId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
        ),
      )
    await socialPostSchedulingRepository.lockDestinations(
      [
        ...rows.map((row) => row.destinationId),
        ...(input.alsoDestinationIds ?? []),
      ],
      tx,
    )
  },

  async findWorkspaceTimezone(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ timezone: workspaceModel.timezone })
      .from(workspaceModel)
      .where(eq(workspaceModel.id, workspaceId))
      .limit(1)
    return row?.timezone ?? null
  },

  async findPostingSchedule(
    input: { destinationId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<PostingScheduleRow | null> {
    const [row] = await tx
      .select({
        id: publishDestinationScheduleModel.id,
        slots: publishDestinationScheduleModel.slots,
        timezone: publishDestinationScheduleModel.timezone,
        updatedAt: publishDestinationScheduleModel.updatedAt,
      })
      .from(publishDestinationScheduleModel)
      .where(
        and(
          eq(
            publishDestinationScheduleModel.publishDestinationId,
            input.destinationId,
          ),
          eq(publishDestinationScheduleModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  async upsertPostingSchedule(
    input: {
      destinationId: string
      id: string
      slots: PostingScheduleRow["slots"]
      timezone: string
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<void> {
    await publishDestinationRepository.assertInWorkspace(
      { ids: [input.destinationId], workspaceId: input.workspaceId },
      tx,
    )
    await tx
      .insert(publishDestinationScheduleModel)
      .values({
        id: input.id,
        slots: input.slots,
        publishDestinationId: input.destinationId,
        timezone: input.timezone,
        workspaceId: input.workspaceId,
      })
      .onConflictDoUpdate({
        set: {
          slots: input.slots,
          timezone: input.timezone,
          updatedAt: new Date(),
        },
        target: publishDestinationScheduleModel.publishDestinationId,
      })
  },

  /**
   * The targets of a destination that hold a future queue slot: queue mode,
   * still pending, with a slot after `after`. Oldest slot first.
   */
  async listQueued(
    input: { after: Date; destinationId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<QueuedTarget[]> {
    const rows = await tx
      .select({
        id: socialPostTargetModel.id,
        queueSlotAt: socialPostTargetModel.queueSlotAt,
        socialPostId: socialPostTargetModel.socialPostId,
      })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.publishDestinationId, input.destinationId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.scheduleMode, "queue"),
          eq(socialPostTargetModel.status, "pending"),
          sql`${socialPostTargetModel.queueSlotAt} > ${input.after.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(socialPostTargetModel.queueSlotAt, socialPostTargetModel.id)
    return rows.flatMap((row) =>
      row.queueSlotAt ? [{ ...row, queueSlotAt: row.queueSlotAt }] : [],
    )
  },

  /**
   * Every slot a destination holds after `after`, whoever holds it: the unique
   * index covers any target with a slot, so a free slot must avoid all of them.
   */
  async listOccupiedSlots(
    input: { after: Date; destinationId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<Date[]> {
    const rows = await tx
      .select({ queueSlotAt: socialPostTargetModel.queueSlotAt })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.publishDestinationId, input.destinationId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          sql`${socialPostTargetModel.queueSlotAt} > ${input.after.toISOString()}::timestamptz`,
        ),
      )
    return rows.flatMap((row) => (row.queueSlotAt ? [row.queueSlotAt] : []))
  },

  /** The targets of a post with what a schedule operation needs to decide. */
  async listForSchedule(
    input: { socialPostId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<ReschedulableTarget[]> {
    return await tx
      .select({
        attemptCount: socialPostTargetModel.attemptCount,
        id: socialPostTargetModel.id,
        nextAttemptAt: socialPostTargetModel.nextAttemptAt,
        queueSlotAt: socialPostTargetModel.queueSlotAt,
        scheduleMode: socialPostTargetModel.scheduleMode,
        scheduledAt: socialPostTargetModel.scheduledAt,
        publishDestinationId: socialPostTargetModel.publishDestinationId,
        status: socialPostTargetModel.status,
        timezone: socialPostTargetModel.timezone,
      })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.socialPostId, input.socialPostId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
        ),
      )
      .orderBy(socialPostTargetModel.createdAt, socialPostTargetModel.id)
      .for("update")
  },

  /**
   * Writes the schedule of one target that is still movable. `scheduledAt` and
   * `nextAttemptAt` are written in the same statement (the pipeline's clock
   * follows the time the person asked for); an unscheduled target has neither.
   * `false` means a worker took it, or it is due within `dueAfter`.
   */
  async setTargetSchedule(
    input: {
      dueAfter: Date
      id: string
      values: TargetScheduleValues
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialPostTargetModel)
      .set({
        nextAttemptAt: input.values.scheduledAt,
        queueSlotAt: input.values.queueSlotAt,
        scheduleMode: input.values.scheduleMode,
        scheduledAt: input.values.scheduledAt,
        timezone: input.values.timezone,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "pending"),
          eq(socialPostTargetModel.attemptCount, 0),
          sql`(${socialPostTargetModel.nextAttemptAt} IS NULL OR ${socialPostTargetModel.nextAttemptAt} > ${input.dueAfter.toISOString()}::timestamptz)`,
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    return rows.length > 0
  },

  /**
   * Remembers the time a draft is planned for on its untouched targets, so the
   * calendar can show the draft on its day. It writes `scheduledAt` (the time
   * the person asked for) and NEVER `nextAttemptAt` (the pipeline's clock): the
   * publish scan, the claim and the missed-schedule sweep all read
   * `nextAttemptAt`, so a target written here cannot be published. Only targets
   * that have no clock (`nextAttemptAt IS NULL`) are touched, so a scheduled
   * target is never changed. `null` forgets the planned time.
   */
  async setPlannedTime(
    input: {
      plannedAt: Date | null
      socialPostId: string
      timezone: string | null
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<number> {
    const rows = await tx
      .update(socialPostTargetModel)
      .set({
        queueSlotAt: null,
        scheduleMode: "custom",
        scheduledAt: input.plannedAt,
        timezone: input.plannedAt ? input.timezone : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(socialPostTargetModel.socialPostId, input.socialPostId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "pending"),
          eq(socialPostTargetModel.attemptCount, 0),
          isNull(socialPostTargetModel.nextAttemptAt),
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    return rows.length
  },

  /**
   * Frees the queue slots of these targets before they are given new ones, so a
   * swap never meets the unique index half way.
   */
  async releaseQueueSlots(
    input: { ids: readonly string[]; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await tx
      .update(socialPostTargetModel)
      .set({ queueSlotAt: null })
      .where(
        and(
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          sql`${socialPostTargetModel.id} = ANY(${sql.param([...input.ids])}::bigint[])`,
        ),
      )
  },

  /** Takes a target out of the queue without touching its time: it keeps `scheduledAt`, as a custom time. */
  async detachFromQueue(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx
      .update(socialPostTargetModel)
      .set({ queueSlotAt: null, scheduleMode: "custom", updatedAt: new Date() })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "pending"),
        ),
      )
  },

  /** Cancels the post's pending targets that nothing tried yet; returns how many. */
  async cancelPending(
    input: { socialPostId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<number> {
    const rows = await tx
      .update(socialPostTargetModel)
      .set({
        nextAttemptAt: null,
        queueSlotAt: null,
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(socialPostTargetModel.socialPostId, input.socialPostId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "pending"),
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    return rows.length
  },

  /** Pending targets that wait for a future time nobody tried yet: they keep a post `scheduled`. */
  async countWaiting(
    input: { now: Date; socialPostId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.socialPostId, input.socialPostId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "pending"),
          eq(socialPostTargetModel.attemptCount, 0),
          sql`${socialPostTargetModel.nextAttemptAt} > ${input.now.toISOString()}::timestamptz`,
        ),
      )
    return row?.count ?? 0
  },

  /** Pending targets whose time passed by more than the late-publish window: given up, not published. */
  async listMissed(
    input: { cutoff: Date; limit: number },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; socialPostId: string; workspaceId: string }[]> {
    return await tx
      .select({
        id: socialPostTargetModel.id,
        socialPostId: socialPostTargetModel.socialPostId,
        workspaceId: socialPostTargetModel.workspaceId,
      })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.status, "pending"),
          sql`${socialPostTargetModel.nextAttemptAt} < ${input.cutoff.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(socialPostTargetModel.nextAttemptAt, socialPostTargetModel.id)
      .limit(input.limit)
  },

  /** Gives up one missed target, only while it is still pending and still late. */
  async failMissed(
    input: {
      cutoff: Date
      error: MissedTargetError
      id: string
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialPostTargetModel)
      .set({
        errorCategory: "missedSchedule",
        errorCode: input.error.code,
        errorMessage: input.error.message,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        queueSlotAt: null,
        status: "failed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "pending"),
          sql`${socialPostTargetModel.nextAttemptAt} < ${input.cutoff.toISOString()}::timestamptz`,
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    return rows.length > 0
  },

  async setPostScheduleStatus(
    input: {
      id: string
      status: SchedulablePostStatus
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx
      .update(socialPostModel)
      .set({ completedAt: null, status: input.status, updatedAt: new Date() })
      .where(
        and(
          eq(socialPostModel.id, input.id),
          eq(socialPostModel.workspaceId, input.workspaceId),
        ),
      )
  },
}
