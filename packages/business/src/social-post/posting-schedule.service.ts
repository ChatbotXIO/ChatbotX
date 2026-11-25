import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  socialPostRepository,
  socialPostSchedulingRepository,
} from "@chatbotx.io/database/repositories"
import { createId } from "@chatbotx.io/utils"
import {
  emptyPostingSlots,
  isPostingSlot,
  listFreeSlots,
  moveWallClockToZone,
  normalisePostingSlots,
  type PostingSchedule,
  type PostingScheduleSlots,
} from "@chatbotx.io/utils/posting-slots"
import { BaseService } from "../base.service"
import { conflictException, notFoundException } from "../errors"
import {
  assertTimezone,
  earliestSchedule,
  RESCHEDULE_LOCK_MS,
  SOCIAL_POST_TARGET_NOT_RESCHEDULABLE_CODE,
} from "./schedule-policy"
import type {
  FreeSlotsDto,
  PostingScheduleDto,
  PostingScheduleReflow,
  PostingScheduleUpdateResult,
} from "./types"

export const FREE_SLOTS_DEFAULT = 10
export const FREE_SLOTS_MAX = 50
const FALLBACK_TIMEZONE = "UTC"

type StoredSchedule = NonNullable<
  Awaited<ReturnType<typeof socialPostSchedulingRepository.findPostingSchedule>>
>

const toDto = (
  destinationId: string,
  stored: StoredSchedule | null,
  timezone: string,
): PostingScheduleDto => ({
  configured: stored !== null,
  destinationId,
  slots: stored ? normalisePostingSlots(stored.slots) : emptyPostingSlots(),
  timezone: stored?.timezone ?? timezone,
  updatedAt: stored?.updatedAt ?? null,
})

type ReflowInput = {
  after: Date
  destinationId: string
  next: PostingSchedule
  now: Date
  previousTimezone: string
  workspaceId: string
}

/**
 * Re-seats the destination's queued targets on a schedule that just changed.
 * A target keeps its slot when the slot still exists (when the zone changed,
 * the same wall clock in the new zone); otherwise it takes the next free slot,
 * in its old order; with no slot left it stops being queued but keeps its time.
 * A target about to publish is never touched. Runs inside the caller's
 * transaction, so a failure anywhere leaves every target as it was.
 */
const reflowQueue = async (
  tx: DatabaseClient,
  input: ReflowInput,
): Promise<PostingScheduleReflow> => {
  const { after, destinationId, next, now, workspaceId } = input
  const queued = await socialPostSchedulingRepository.listQueued(
    { after: now, destinationId, workspaceId },
    tx,
  )
  const lockedUntil = now.getTime() + RESCHEDULE_LOCK_MS
  const movable = queued.filter((t) => t.queueSlotAt.getTime() > lockedUntil)
  const zoneChanged = input.previousTimezone !== next.timezone
  const reflow: PostingScheduleReflow = {
    detached: [],
    keptCount: queued.length - movable.length,
    moved: [],
  }

  // Slots the imminent targets keep cannot be taken by a moved one.
  const claimed = new Set<number>(
    queued
      .filter((t) => t.queueSlotAt.getTime() <= lockedUntil)
      .map((t) => t.queueSlotAt.getTime()),
  )
  const keepers: { desired: Date; id: string; slot: Date }[] = []
  const movers: typeof movable = []
  for (const target of movable) {
    const desired = zoneChanged
      ? moveWallClockToZone(
          target.queueSlotAt,
          input.previousTimezone,
          next.timezone,
        )
      : target.queueSlotAt
    const usable =
      desired.getTime() > after.getTime() &&
      isPostingSlot(next, desired) &&
      !claimed.has(desired.getTime())
    if (usable) {
      claimed.add(desired.getTime())
      keepers.push({ desired, id: target.id, slot: target.queueSlotAt })
    } else {
      movers.push(target)
    }
  }

  const rewritten = keepers.filter(
    (keeper) => keeper.desired.getTime() !== keeper.slot.getTime(),
  )
  reflow.keptCount += keepers.length - rewritten.length
  await socialPostSchedulingRepository.releaseQueueSlots(
    {
      ids: [...rewritten.map((k) => k.id), ...movers.map((m) => m.id)],
      workspaceId,
    },
    tx,
  )
  const write = async (id: string, slot: Date): Promise<void> => {
    const written = await socialPostSchedulingRepository.setTargetSchedule(
      {
        dueAfter: new Date(lockedUntil),
        id,
        values: {
          queueSlotAt: slot,
          scheduleMode: "queue",
          scheduledAt: slot,
          timezone: next.timezone,
        },
        workspaceId,
      },
      tx,
    )
    if (!written) {
      throw conflictException(
        "A queued post is about to publish; try again in a moment",
        SOCIAL_POST_TARGET_NOT_RESCHEDULABLE_CODE,
      )
    }
  }
  for (const keeper of rewritten) {
    await write(keeper.id, keeper.desired)
    reflow.moved.push({
      from: keeper.slot,
      targetId: keeper.id,
      to: keeper.desired,
    })
  }

  const occupied = await socialPostSchedulingRepository.listOccupiedSlots(
    { after, destinationId, workspaceId },
    tx,
  )
  for (const mover of movers) {
    const [slot] = listFreeSlots({ after, count: 1, occupied, schedule: next })
    if (slot) {
      occupied.push(slot)
      await write(mover.id, slot)
      reflow.moved.push({
        from: mover.queueSlotAt,
        targetId: mover.id,
        to: slot,
      })
    } else {
      await socialPostSchedulingRepository.detachFromQueue(
        { id: mover.id, workspaceId },
        tx,
      )
      reflow.detached.push({
        scheduledAt: mover.queueSlotAt,
        targetId: mover.id,
      })
    }
  }
  return reflow
}

class SocialPostingScheduleService extends BaseService {
  /** The destination must be one of the workspace. */
  private async assertDestination(
    workspaceId: string,
    destinationId: string,
  ): Promise<void> {
    const [destination] = await socialPostRepository.findDestinations({
      ids: [destinationId],
      workspaceId,
    })
    if (!destination) {
      throw notFoundException("Destination not found")
    }
  }

  private async defaultTimezone(workspaceId: string): Promise<string> {
    return (
      (await socialPostSchedulingRepository.findWorkspaceTimezone(
        workspaceId,
      )) ?? FALLBACK_TIMEZONE
    )
  }

  /** The destination's posting schedule; every day off, in the workspace's zone, until someone sets it. */
  async get(input: {
    destinationId: string
    workspaceId: string
  }): Promise<PostingScheduleDto> {
    const { destinationId, workspaceId } = input
    await this.assertDestination(workspaceId, destinationId)
    const stored = await socialPostSchedulingRepository.findPostingSchedule({
      destinationId,
      workspaceId,
    })
    return toDto(destinationId, stored, await this.defaultTimezone(workspaceId))
  }

  /**
   * The next free posting times, as "Add to queue" would assign them: strictly
   * after `after` (and after the two-minute lead), skipping every time a
   * queued target holds. Not a reservation.
   */
  async freeSlots(input: {
    after?: Date
    destinationId: string
    limit?: number
    workspaceId: string
  }): Promise<FreeSlotsDto> {
    const { destinationId, workspaceId } = input
    await this.assertDestination(workspaceId, destinationId)
    const lead = earliestSchedule(new Date())
    const after =
      input.after && input.after.getTime() > lead.getTime() ? input.after : lead
    const limit = Math.min(
      Math.max(input.limit ?? FREE_SLOTS_DEFAULT, 1),
      FREE_SLOTS_MAX,
    )
    const stored = await socialPostSchedulingRepository.findPostingSchedule({
      destinationId,
      workspaceId,
    })
    if (!stored) {
      return {
        items: [],
        timezone: await this.defaultTimezone(workspaceId),
      }
    }
    const occupied = await socialPostSchedulingRepository.listOccupiedSlots(
      { after, destinationId, workspaceId },
      db,
    )
    return {
      items: listFreeSlots({
        after,
        count: limit,
        occupied,
        schedule: stored,
      }),
      timezone: stored.timezone,
    }
  }

  /**
   * Replaces the schedule (and the zone) and re-seats the queue on it, all in
   * one transaction under the destination's lock.
   */
  async update(input: {
    destinationId: string
    slots: PostingScheduleSlots
    timezone?: string
    workspaceId: string
  }): Promise<PostingScheduleUpdateResult> {
    const { destinationId, workspaceId } = input
    await this.assertDestination(workspaceId, destinationId)
    const slots = normalisePostingSlots(input.slots)
    const now = new Date()
    const after = earliestSchedule(now)

    const reflow = await db.transaction(async (tx) => {
      await socialPostSchedulingRepository.lockDestinations([destinationId], tx)
      const previous = await socialPostSchedulingRepository.findPostingSchedule(
        { destinationId, workspaceId },
        tx,
      )
      const timezone =
        input.timezone ??
        previous?.timezone ??
        (await this.defaultTimezone(workspaceId))
      assertTimezone(timezone)
      await socialPostSchedulingRepository.upsertPostingSchedule(
        {
          destinationId,
          id: createId(),
          slots,
          timezone,
          workspaceId,
        },
        tx,
      )
      return await reflowQueue(tx, {
        after,
        destinationId,
        next: { slots, timezone },
        now,
        previousTimezone: previous?.timezone ?? timezone,
        workspaceId,
      })
    })
    return {
      reflow,
      schedule: await this.get({ destinationId, workspaceId }),
    }
  }
}

export const socialPostingScheduleService = new SocialPostingScheduleService()
