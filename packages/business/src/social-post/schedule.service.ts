import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type {
  SocialPostStatus,
  SocialProvider,
} from "@chatbotx.io/database/partials"
import {
  type ReschedulableTarget,
  socialPostPaceRepository,
  socialPostPublishRepository,
  socialPostRepository,
  socialPostSchedulingRepository,
  type TargetScheduleValues,
} from "@chatbotx.io/database/repositories"
import {
  listFreeSlots,
  moveWallClockToZone,
} from "@chatbotx.io/utils/posting-slots"
import {
  listAutoSpacedSlots,
  PROVIDER_PUBLISH_LIMITS,
  PUBLISH_CAP_WINDOW_MS,
} from "@chatbotx.io/utils/publish-limits"
import type { SocialQueuePosition } from "@chatbotx.io/utils/social-post"
import { BaseService } from "../base.service"
import {
  conflictException,
  notFoundException,
  validationException,
} from "../errors"
import { recomputePostInTx } from "./post-state"
import {
  socialPostIssuesException,
  socialPostPublishService,
} from "./publish.service"
import {
  assertSchedulePlan,
  assertScheduleWindow,
  assertTimezone,
  earliestSchedule,
  lateCutoffAt,
  MISSED_SCHEDULE_CODE,
  MISSED_SCHEDULE_MESSAGE,
  RESCHEDULE_LOCK_MS,
  SCHEDULE_MAX_LEAD_MS,
  SOCIAL_POST_NOT_SCHEDULABLE_CODE,
  SOCIAL_POST_TARGET_NOT_RESCHEDULABLE_CODE,
} from "./schedule-policy"
import { socialPostService } from "./service"
import type {
  PostWriteHook,
  RescheduleChange,
  SchedulePlan,
  SocialPostDto,
} from "./types"

export const MISSED_SCAN_BATCH = 100
const FALLBACK_TIMEZONE = "UTC"

/** What one target is to become. */
type TargetWish =
  | { kind: "at"; at: Date; timezone: string }
  | { kind: "clear" }
  | { autoSpacing?: boolean; kind: "queue"; position: SocialQueuePosition }
  | { kind: "zone"; timezone: string }

type Entry = { target: ReschedulableTarget; wish: TargetWish }

type ApplyInput = {
  entries: readonly Entry[]
  now: Date
  postId: string
  workspaceId: string
  workspaceTimezone: string
}

const notReschedulable = () =>
  conflictException(
    "The post is publishing or about to publish and can no longer be moved",
    SOCIAL_POST_TARGET_NOT_RESCHEDULABLE_CODE,
  )

const notSchedulable = () =>
  conflictException(
    "Only a draft or scheduled post can be scheduled",
    SOCIAL_POST_NOT_SCHEDULABLE_CODE,
  )

const CLEARED: TargetScheduleValues = {
  queueSlotAt: null,
  scheduleMode: "custom",
  scheduledAt: null,
  timezone: null,
}

/** Writes one target's schedule; a lost race (a worker took it) rolls the whole operation back. */
const writeSchedule = async (
  tx: DatabaseClient,
  input: {
    dueAfter: Date
    id: string
    values: TargetScheduleValues
    workspaceId: string
  },
): Promise<void> => {
  const written = await socialPostSchedulingRepository.setTargetSchedule(
    input,
    tx,
  )
  if (!written) {
    throw notReschedulable()
  }
}

const providerOf = async (
  tx: DatabaseClient,
  destinationId: string,
  workspaceId: string,
): Promise<SocialProvider> => {
  const [destination] = await socialPostRepository.findDestinations(
    { ids: [destinationId], workspaceId },
    tx,
  )
  if (!destination) {
    throw notFoundException("Destination not found")
  }
  return destination.provider
}

/**
 * Slots for a destination with no posting schedule: spaced by the network's
 * minimum gap from every queued slot and every recent publish, and under its
 * rolling 24-hour cap (docs/posts.md, "Publishing pace and platform limits").
 */
const autoSpacedSlots = async (
  tx: DatabaseClient,
  input: {
    after: Date
    count: number
    destinationId: string
    occupied: readonly Date[]
    provider: SocialProvider
    workspaceId: string
  },
): Promise<Date[]> => {
  const limits = PROVIDER_PUBLISH_LIMITS[input.provider]
  const pace = await socialPostPaceRepository.findPace(input, tx)
  const published = await socialPostPaceRepository.listPublishedSince(
    {
      contentTypes: null,
      destinationId: input.destinationId,
      since: new Date(input.after.getTime() - PUBLISH_CAP_WINDOW_MS),
      workspaceId: input.workspaceId,
    },
    tx,
  )
  // A paused destination places nothing before its pause ends.
  const after =
    pace?.pausedUntil && pace.pausedUntil > input.after
      ? pace.pausedUntil
      : input.after
  return listAutoSpacedSlots({
    after,
    capLimit: limits.dailyCap.limit,
    count: input.count,
    gapMs: limits.minGapMs,
    taken: [
      ...input.occupied,
      ...published,
      ...(pace?.lastPublishStartedAt ? [pace.lastPublishStartedAt] : []),
    ],
  })
}

/**
 * Puts each target in its destination's queue, under the destination lock the
 * caller already holds. `next` takes the first free posting time; `top` takes
 * the first time and pushes the destination's queued targets one time later.
 */
const placeInQueue = async (
  tx: DatabaseClient,
  input: {
    dueAfter: Date
    entries: readonly {
      autoSpacing?: boolean
      position: SocialQueuePosition
      target: ReschedulableTarget
    }[]
    now: Date
    workspaceId: string
    workspaceTimezone: string
  },
): Promise<void> => {
  const { workspaceId } = input
  const after = earliestSchedule(input.now)
  const horizon = input.now.getTime() + SCHEDULE_MAX_LEAD_MS
  for (const { autoSpacing, position, target } of input.entries) {
    const destinationId = target.publishDestinationId
    const schedule = await socialPostSchedulingRepository.findPostingSchedule(
      { destinationId, workspaceId },
      tx,
    )
    if (!(schedule || autoSpacing)) {
      throw validationException(
        "queue",
        "This destination has no posting schedule yet. Set its posting times first.",
      )
    }
    const others =
      position === "top"
        ? (
            await socialPostSchedulingRepository.listQueued(
              { after, destinationId, workspaceId },
              tx,
            )
          ).filter((queued) => queued.id !== target.id)
        : []
    await socialPostSchedulingRepository.releaseQueueSlots(
      { ids: others.map((queued) => queued.id), workspaceId },
      tx,
    )
    const ids = [target.id, ...others.map((queued) => queued.id)]
    // Without a posting schedule the slots are spaced by a minimum gap, so a slot queued
    // just BEFORE `after` (the previous item of the same check, whose own `after` was a
    // few ms earlier) must still be seen; with a schedule the original window is kept.
    const occupied = await socialPostSchedulingRepository.listOccupiedSlots(
      {
        after: schedule
          ? after
          : new Date(after.getTime() - PUBLISH_CAP_WINDOW_MS),
        destinationId,
        workspaceId,
      },
      tx,
    )
    const slots = schedule
      ? listFreeSlots({ after, count: ids.length, occupied, schedule })
      : await autoSpacedSlots(tx, {
          after,
          count: ids.length,
          destinationId,
          occupied,
          provider: await providerOf(tx, destinationId, workspaceId),
          workspaceId,
        })
    if (slots.length < ids.length || slots.some((s) => s.getTime() > horizon)) {
      throw validationException(
        "queue",
        "No free posting time within one year. Add posting times to the destination's schedule.",
      )
    }
    for (const [index, id] of ids.entries()) {
      const slot = slots[index]
      if (slot) {
        await writeSchedule(tx, {
          dueAfter: input.dueAfter,
          id,
          values: {
            queueSlotAt: slot,
            scheduleMode: "queue",
            scheduledAt: slot,
            timezone: schedule?.timezone ?? input.workspaceTimezone,
          },
          workspaceId,
        })
      }
    }
  }
}

/** Resolves a wish that is not a queue placement into the columns it writes. */
const valuesOf = (
  entry: Entry,
  input: { now: Date; workspaceTimezone: string },
): TargetScheduleValues => {
  const { target, wish } = entry
  switch (wish.kind) {
    case "at":
      return {
        queueSlotAt: null,
        scheduleMode: "custom",
        scheduledAt: wish.at,
        timezone: wish.timezone,
      }
    case "clear":
      return CLEARED
    case "zone": {
      if (target.scheduleMode === "queue") {
        throw validationException(
          "timezone",
          "A queued post follows its destination's posting schedule. Change the time zone of that schedule instead.",
        )
      }
      if (!target.scheduledAt) {
        throw validationException("timezone", "The post has no time to move")
      }
      const at = moveWallClockToZone(
        target.scheduledAt,
        target.timezone ?? input.workspaceTimezone,
        wish.timezone,
      )
      assertScheduleWindow(at, input.now, "timezone")
      return {
        queueSlotAt: null,
        scheduleMode: "custom",
        scheduledAt: at,
        timezone: wish.timezone,
      }
    }
    case "queue":
      throw new Error("A queue wish is placed, not written")
    default: {
      const exhaustive: never = wish
      return exhaustive
    }
  }
}

/**
 * The shared core of schedule, reschedule and unschedule. The caller holds the
 * post lock and the destinations' queue locks; every write is conditional on
 * the target still being pending, untried and not due within the lead time.
 */
const applyEntries = async (
  tx: DatabaseClient,
  input: ApplyInput,
): Promise<void> => {
  const { workspaceId } = input
  const dueAfter = new Date(input.now.getTime() + RESCHEDULE_LOCK_MS)
  const queueEntries = input.entries.flatMap((entry) =>
    entry.wish.kind === "queue"
      ? [
          {
            autoSpacing: entry.wish.autoSpacing,
            position: entry.wish.position,
            target: entry.target,
          },
        ]
      : [],
  )
  // A target that goes to the queue (again) lets go of its old slot first.
  await socialPostSchedulingRepository.releaseQueueSlots(
    { ids: queueEntries.map((entry) => entry.target.id), workspaceId },
    tx,
  )
  for (const entry of input.entries) {
    if (entry.wish.kind !== "queue") {
      await writeSchedule(tx, {
        dueAfter,
        id: entry.target.id,
        values: valuesOf(entry, input),
        workspaceId,
      })
    }
  }
  await placeInQueue(tx, {
    dueAfter,
    entries: queueEntries,
    now: input.now,
    workspaceId,
    workspaceTimezone: input.workspaceTimezone,
  })
}

/** After an operation the post is `scheduled` when a target waits for a time, else `draft`. */
const settlePostStatus = async (
  tx: DatabaseClient,
  input: { postId: string; status: SocialPostStatus; workspaceId: string },
): Promise<void> => {
  const { postId, workspaceId } = input
  if (input.status !== "draft" && input.status !== "scheduled") {
    await recomputePostInTx(tx, postId, workspaceId)
    return
  }
  const targets = await socialPostSchedulingRepository.listForSchedule(
    { socialPostId: postId, workspaceId },
    tx,
  )
  const waiting = targets.some(
    (t) => t.status === "pending" && t.nextAttemptAt !== null,
  )
  await socialPostSchedulingRepository.setPostScheduleStatus(
    { id: postId, status: waiting ? "scheduled" : "draft", workspaceId },
    tx,
  )
}

class SocialPostScheduleService extends BaseService {
  private async workspaceTimezone(workspaceId: string): Promise<string> {
    return (
      (await socialPostSchedulingRepository.findWorkspaceTimezone(
        workspaceId,
      )) ?? FALLBACK_TIMEZONE
    )
  }

  /**
   * Gives every target of a draft (or scheduled) post a time: the post's
   * `scheduledAt`, a target's own time, or a place in the destination's queue.
   * The post must pass the content check as stored; every guard (window, zone,
   * queue lock) is enforced; the post becomes `scheduled` in the same
   * transaction. `scheduledAt` and `nextAttemptAt` are written together.
   */
  async schedule(input: {
    id: string
    plan: SchedulePlan
    workspaceId: string
  }): Promise<SocialPostDto> {
    const { id, workspaceId } = input
    const apply = await this.prepare({
      plan: input.plan,
      workspaceId,
    })
    await db.transaction(async (tx) => {
      await apply(tx, id)
    })
    return await socialPostService.get({ id, workspaceId })
  }

  /**
   * The step that remembers the time a DRAFT is planned for (or forgets it with
   * `null`), in the transaction that stores the post. It only writes the
   * target's `scheduledAt` and zone: the post stays a draft and no target gets
   * a clock (`nextAttemptAt`), so nothing is queued and nothing can publish. No
   * lead-time window applies: the time may even be in the past. Scheduling the
   * draft later goes through `prepare` / `schedule`, which do apply the window.
   */
  async prepareDraftTime(input: {
    plannedAt: Date | null
    timezone?: string
    workspaceId: string
  }): Promise<PostWriteHook> {
    const { plannedAt, workspaceId } = input
    const timezone =
      input.timezone ?? (await this.workspaceTimezone(workspaceId))
    assertTimezone(timezone)
    return async (tx, id) => {
      await socialPostSchedulingRepository.setPlannedTime(
        { plannedAt, socialPostId: id, timezone, workspaceId },
        tx,
      )
    }
  }

  /**
   * Checks a plan and returns the step that applies it inside a transaction the
   * caller already holds. `socialPostService.create` / `update` run it right
   * after writing the post, so the post and its schedule are one commit: a
   * schedule that cannot be applied (no posting schedule, no free time, content
   * that fails the check) rolls the whole write back and leaves no draft.
   */
  async prepare(input: {
    plan: SchedulePlan
    workspaceId: string
  }): Promise<PostWriteHook> {
    const { plan, workspaceId } = input
    const now = new Date()
    assertSchedulePlan(plan, now)
    const workspaceTimezone = await this.workspaceTimezone(workspaceId)
    const timezone = plan.timezone ?? workspaceTimezone
    assertTimezone(timezone)
    return async (tx, id) => {
      const issues = await socialPostPublishService.storedIssues(
        { id, workspaceId },
        tx,
      )
      if (issues.length > 0) {
        throw socialPostIssuesException(issues)
      }
      await this.applyPlan(tx, {
        id,
        now,
        plan,
        timezone,
        workspaceId,
        workspaceTimezone,
      })
    }
  }

  /**
   * Gives a freshly cloned occurrence of a recurring post its slot, inside the
   * materialiser's transaction. The slot is the time the series chose, not one a
   * person picked, so it may already be a little past (the cron ran after it):
   * the 2-minute lead and one-year guards of `schedule` do not apply, and the
   * target publishes on the next scan. Every destination gets this one time in
   * the series' zone, as a custom time. The content must pass the check as
   * stored, like any other schedule.
   */
  async scheduleOccurrenceInTx(
    tx: DatabaseClient,
    input: { at: Date; id: string; timezone: string; workspaceId: string },
  ): Promise<void> {
    const { id, workspaceId } = input
    const issues = await socialPostPublishService.storedIssues(
      { id, workspaceId },
      tx,
    )
    if (issues.length > 0) {
      throw socialPostIssuesException(issues)
    }
    await this.applyPlan(tx, {
      id,
      now: new Date(),
      plan: { scheduledAt: input.at },
      timezone: input.timezone,
      workspaceId,
      workspaceTimezone: input.timezone,
    })
  }

  private async applyPlan(
    tx: DatabaseClient,
    input: {
      id: string
      now: Date
      plan: SchedulePlan
      timezone: string
      workspaceId: string
      workspaceTimezone: string
    },
  ): Promise<void> {
    const { id, now, plan, timezone, workspaceId, workspaceTimezone } = input
    const post = await socialPostPublishRepository.lockPost(
      { id, workspaceId },
      tx,
    )
    if (!post) {
      throw notFoundException("Post not found")
    }
    if (post.status !== "draft" && post.status !== "scheduled") {
      throw notSchedulable()
    }
    await socialPostSchedulingRepository.lockPostDestinations(
      { socialPostId: id, workspaceId },
      tx,
    )
    const targets = await socialPostSchedulingRepository.listForSchedule(
      { socialPostId: id, workspaceId },
      tx,
    )
    if (targets.some((target) => target.status !== "pending")) {
      throw notSchedulable()
    }
    await applyEntries(tx, {
      entries: targets.map((target) => ({
        target,
        wish: this.wishFor(target, plan, timezone),
      })),
      now,
      postId: id,
      workspaceId,
      workspaceTimezone,
    })
    await settlePostStatus(tx, {
      postId: id,
      status: post.status,
      workspaceId,
    })
  }

  /** What a plan asks for one target: its own time, else the post's time, else the queue. */
  private wishFor(
    target: ReschedulableTarget,
    plan: SchedulePlan,
    timezone: string,
  ): TargetWish {
    const own = plan.targetTimes?.[target.publishDestinationId]
    if (own) {
      return { at: own, kind: "at", timezone }
    }
    if (plan.scheduledAt) {
      return { at: plan.scheduledAt, kind: "at", timezone }
    }
    if (plan.queue) {
      return {
        autoSpacing: plan.autoSpacing === true,
        kind: "queue",
        position: plan.queue,
      }
    }
    throw validationException("targets", "Every destination needs a time")
  }

  /**
   * Moves, re-queues, changes the zone of, or unschedules the pending targets
   * of a post (one target with `targetId`, else all of them). All or nothing:
   * a target that a worker took, or that is due within a minute, refuses the
   * whole call (409 `socialPostTargetNotReschedulable`), and so does a
   * conflicting write. Unscheduling returns the targets to a draft state.
   */
  async reschedule(input: {
    change: RescheduleChange
    id: string
    targetId?: string
    workspaceId: string
  }): Promise<SocialPostDto> {
    const { change, id, targetId, workspaceId } = input
    const now = new Date()
    if (change.kind === "at") {
      assertScheduleWindow(change.scheduledAt, now)
      if (change.timezone) {
        assertTimezone(change.timezone)
      }
    }
    if (change.kind === "timezone") {
      assertTimezone(change.timezone)
    }
    if (change.kind === "at" || change.kind === "queue") {
      const issues = await socialPostPublishService.storedIssues({
        id,
        workspaceId,
      })
      if (issues.length > 0) {
        throw socialPostIssuesException(issues)
      }
    }
    const workspaceTimezone = await this.workspaceTimezone(workspaceId)

    await db.transaction(async (tx) => {
      const post = await socialPostPublishRepository.lockPost(
        { id, workspaceId },
        tx,
      )
      if (!post) {
        throw notFoundException("Post not found")
      }
      await socialPostSchedulingRepository.lockPostDestinations(
        { socialPostId: id, workspaceId },
        tx,
      )
      const targets = await socialPostSchedulingRepository.listForSchedule(
        { socialPostId: id, workspaceId },
        tx,
      )
      const scope = targetId
        ? targets.filter((target) => target.id === targetId)
        : targets.filter((target) => target.status === "pending")
      if (targetId && scope.length === 0) {
        throw notFoundException("Target not found")
      }
      const lockedUntil = now.getTime() + RESCHEDULE_LOCK_MS
      const movable = (target: ReschedulableTarget): boolean =>
        target.status === "pending" &&
        target.attemptCount === 0 &&
        (target.nextAttemptAt === null ||
          target.nextAttemptAt.getTime() > lockedUntil)
      if (scope.length === 0 || !scope.every(movable)) {
        throw notReschedulable()
      }
      await applyEntries(tx, {
        entries: scope.map((target) => ({
          target,
          wish: this.wishOfChange(change, target, workspaceTimezone),
        })),
        now,
        postId: id,
        workspaceId,
        workspaceTimezone,
      })
      await settlePostStatus(tx, {
        postId: id,
        status: post.status,
        workspaceId,
      })
    })
    return await socialPostService.get({ id, workspaceId })
  }

  private wishOfChange(
    change: RescheduleChange,
    target: ReschedulableTarget,
    workspaceTimezone: string,
  ): TargetWish {
    switch (change.kind) {
      case "at":
        return {
          at: change.scheduledAt,
          kind: "at",
          timezone: change.timezone ?? target.timezone ?? workspaceTimezone,
        }
      case "queue":
        return { kind: "queue", position: change.position }
      case "timezone":
        return { kind: "zone", timezone: change.timezone }
      case "unschedule":
        return { kind: "clear" }
      default: {
        const exhaustive: never = change
        return exhaustive
      }
    }
  }

  /**
   * Gives up pending targets whose time passed by more than the late-publish
   * window (the system was not publishing): `failed` with `missedSchedule`,
   * slot freed, post recomputed. A target that is late by less still publishes.
   * Returns how many were given up.
   */
  async failMissed(now: Date = new Date()): Promise<number> {
    const cutoff = lateCutoffAt(now)
    const missed = await socialPostSchedulingRepository.listMissed({
      cutoff,
      limit: MISSED_SCAN_BATCH,
    })
    let failed = 0
    for (const target of missed) {
      const done = await db.transaction(async (tx) => {
        const { socialPostId, workspaceId } = target
        await socialPostPublishRepository.lockPost(
          { id: socialPostId, workspaceId },
          tx,
        )
        const written = await socialPostSchedulingRepository.failMissed(
          {
            cutoff,
            error: {
              code: MISSED_SCHEDULE_CODE,
              message: MISSED_SCHEDULE_MESSAGE,
            },
            id: target.id,
            workspaceId,
          },
          tx,
        )
        if (written) {
          await recomputePostInTx(tx, socialPostId, workspaceId, now)
        }
        return written
      })
      failed += done ? 1 : 0
    }
    return failed
  }
}

export const socialPostScheduleService = new SocialPostScheduleService()
