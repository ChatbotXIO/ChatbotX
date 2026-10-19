import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type WorkingHoursIntervalInput,
  workingHoursIntervalsSchema,
} from "@chatbotx.io/database/partials"
import {
  type ReplaceMembersResult,
  type WorkingHoursWithRelations,
  workingHoursRepository,
} from "@chatbotx.io/database/repositories"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import { workingHoursCacheTag } from "./cache-tag"
import type { WorkingInterval } from "./duration"

/**
 * One TTL for EVERY entry written under the workspace's working-hours tag.
 * `withCache` resets the shared tag set's expiry to the TTL of the entry being
 * written, so a longer-lived entry would outlive the tag set and could no
 * longer be invalidated. Tag invalidation is the primary path; this is only
 * the backstop.
 */
const WORKING_HOURS_CACHE_TTL_SECONDS = 60 * 60

type AgentWorkingHours = {
  workingHoursId: string
  intervals: WorkingInterval[]
}

const invalidMembersException = () =>
  validationException(
    "userIds",
    "One or more userIds are not members of this workspace",
  )

class WorkingHoursService extends BaseService {
  // ─── Reads (cached) ─────────────────────────────────────────────────────
  listByWorkspace(props: {
    workspaceId: string
  }): Promise<WorkingHoursWithRelations[]> {
    const { workspaceId } = props
    return withCache(
      `working-hours:${workspaceId}:list`,
      () => workingHoursRepository.listByWorkspace({ workspaceId }),
      {
        ttl: WORKING_HOURS_CACHE_TTL_SECONDS,
        tags: [workingHoursCacheTag(workspaceId)],
      },
    )
  }

  /**
   * The schedule a human agent is measured against, or `null`. Cached per
   * (workspace, user) — bounded by the member count — as a wrapper object
   * because `withCache` skips `null`, and agents without a schedule are the
   * common case on the reply path.
   */
  async findForAgent(props: {
    workspaceId: string
    userId: string
  }): Promise<AgentWorkingHours | null> {
    const { workspaceId, userId } = props
    const cached = await withCache(
      `working-hours:${workspaceId}:agent:${userId}`,
      async (): Promise<{ schedule: AgentWorkingHours | null }> => {
        const row = await workingHoursRepository.findForUser({
          workspaceId,
          userId,
        })
        if (!row) {
          return { schedule: null }
        }
        return {
          schedule: {
            workingHoursId: row.id,
            intervals: row.intervals.map((interval) => ({
              weekday: interval.weekday,
              startMinute: interval.startMinute,
              endMinute: interval.endMinute,
            })),
          },
        }
      },
      {
        ttl: WORKING_HOURS_CACHE_TTL_SECONDS,
        tags: [workingHoursCacheTag(workspaceId)],
      },
    )
    return cached.schedule
  }

  // ─── Reads (NOT cached — write-path guard) ───────────────────────────────
  async findByIdOrFail(props: {
    workspaceId: string
    workingHoursId: string
    tx?: DatabaseClient
  }): Promise<WorkingHoursWithRelations> {
    const row = await workingHoursRepository.findById(
      { workspaceId: props.workspaceId, id: props.workingHoursId },
      props.tx ?? db,
    )
    if (!row) {
      throw notFoundException("Working hours not found")
    }
    return row
  }

  // ─── Validation ──────────────────────────────────────────────────────────
  private parseIntervals(intervals: unknown): WorkingHoursIntervalInput[] {
    const parsed = workingHoursIntervalsSchema.safeParse(intervals)
    if (!parsed.success) {
      throw validationException(
        "intervals",
        parsed.error.issues[0]?.message ?? "Invalid intervals",
      )
    }
    return parsed.data
  }

  /**
   * Maps the repository outcome to the service errors. Membership is verified
   * under a key-share lock inside the write transaction, so a concurrent
   * removal cannot slip a non-member in. Call it INSIDE the transaction so a
   * rejection rolls back the repository's writes.
   */
  private assertMembersApplied(result: ReplaceMembersResult): void {
    if (result.status === "notFound") {
      throw notFoundException("Working hours not found")
    }
    if (result.status === "invalidUsers") {
      throw invalidMembersException()
    }
  }

  // ─── Writes ──────────────────────────────────────────────────────────────
  async create(props: {
    workspaceId: string
    data: {
      name: string
      intervals?: WorkingHoursIntervalInput[]
      userIds?: string[]
    }
  }): Promise<WorkingHoursWithRelations> {
    const { workspaceId, data } = props
    const intervals = this.parseIntervals(data.intervals ?? [])
    const userIds = [...new Set(data.userIds ?? [])]
    const created = await db.transaction(async (tx) => {
      const row = await workingHoursRepository.create(
        { workspaceId, name: data.name },
        tx,
      )
      if (intervals.length > 0) {
        await workingHoursRepository.replaceIntervals(
          { workspaceId, workingHoursId: row.id, intervals },
          tx,
        )
      }
      if (userIds.length > 0) {
        this.assertMembersApplied(
          await workingHoursRepository.replaceMembers(
            { workspaceId, workingHoursId: row.id, userIds },
            tx,
          ),
        )
      }
      return row
    })
    await this.invalidate({ workspaceId })
    await this.audit(
      "create",
      `created working hours "${created.name}" (#${created.id})`,
    )
    return await this.findByIdOrFail({
      workspaceId,
      workingHoursId: created.id,
    })
  }

  async update(props: {
    workspaceId: string
    workingHoursId: string
    data: { name?: string; intervals?: WorkingHoursIntervalInput[] }
  }): Promise<WorkingHoursWithRelations> {
    const { workspaceId, workingHoursId, data } = props
    const intervals =
      data.intervals === undefined
        ? undefined
        : this.parseIntervals(data.intervals)
    const previousName = await db.transaction(async (tx) => {
      const current = await this.findByIdOrFail({
        workspaceId,
        workingHoursId,
        tx,
      })
      if (intervals !== undefined) {
        const ok = await workingHoursRepository.replaceIntervals(
          { workspaceId, workingHoursId, intervals },
          tx,
        )
        if (!ok) {
          throw notFoundException("Working hours not found")
        }
      }
      if (data.name !== undefined && data.name !== current.name) {
        await workingHoursRepository.rename(
          { workspaceId, id: workingHoursId, name: data.name },
          tx,
        )
      }
      return current.name
    })
    await this.invalidate({ workspaceId })
    await this.audit(
      "update",
      `updated working hours "${previousName}" (#${workingHoursId})`,
    )
    return await this.findByIdOrFail({ workspaceId, workingHoursId })
  }

  async delete(props: {
    workspaceId: string
    workingHoursId: string
  }): Promise<void> {
    const { workspaceId, workingHoursId } = props
    const current = await this.findByIdOrFail({ workspaceId, workingHoursId })
    const deleted = await workingHoursRepository.delete({
      workspaceId,
      id: workingHoursId,
    })
    if (!deleted) {
      throw notFoundException("Working hours not found")
    }
    await this.invalidate({ workspaceId })
    await this.audit(
      "delete",
      `deleted working hours "${current.name}" (#${workingHoursId})`,
    )
  }

  /** Full replacement. A user already on another schedule is moved here. */
  async replaceMembers(props: {
    workspaceId: string
    workingHoursId: string
    userIds: string[]
  }): Promise<WorkingHoursWithRelations> {
    const { workspaceId, workingHoursId } = props
    const userIds = [...new Set(props.userIds)]
    // The service owns the transaction so a rejected write (non-member user,
    // unknown schedule) rolls back the repository's parent-row bump too.
    await db.transaction(async (tx) => {
      this.assertMembersApplied(
        await workingHoursRepository.replaceMembers(
          { workspaceId, workingHoursId, userIds },
          tx,
        ),
      )
    })
    await this.invalidate({ workspaceId })
    await this.audit(
      "update",
      `set ${userIds.length} member(s) on working hours (#${workingHoursId})`,
    )
    return await this.findByIdOrFail({ workspaceId, workingHoursId })
  }

  /**
   * Drops the given users' schedule membership (they were removed from the
   * workspace). Runs on the caller's client so it commits with the member
   * delete; the CALLER invalidates the working-hours tag after its commit.
   */
  async removeMembersForUsers(props: {
    workspaceId: string
    userIds: string[]
    tx: DatabaseClient
  }): Promise<void> {
    await workingHoursRepository.deleteMembersForUsers(
      { workspaceId: props.workspaceId, userIds: props.userIds },
      props.tx,
    )
  }

  // ─── Cache ───────────────────────────────────────────────────────────────
  async invalidate(props: { workspaceId: string }): Promise<void> {
    await this.invalidateCacheTags(workingHoursCacheTag(props.workspaceId))
  }
}

export const workingHoursService = new WorkingHoursService()
