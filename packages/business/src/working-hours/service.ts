import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  WORKING_HOURS_MAX_DATE_OVERRIDES,
  type WorkingHoursDateOverrideInput,
  type WorkingHoursDateRanges,
  type WorkingHoursIntervalInput,
  workingHoursDateOverrideInputSchema,
  workingHoursDateOverridesSchema,
  workingHoursDateRangesSchema,
  workingHoursIntervalsSchema,
} from "@chatbotx.io/database/partials"
import {
  type ReplaceMembersResult,
  type WorkingHoursWithRelations,
  workingHoursRepository,
} from "@chatbotx.io/database/repositories"
import type { WorkingHoursDateOverrideModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import { workingHoursCacheTag } from "./cache-tag"
import {
  buildDateOverridesForSchedule,
  type DateOverrideRow,
} from "./date-overrides"
import type { WorkingDateOverrides, WorkingInterval } from "./duration"

/**
 * One TTL for EVERY entry written under the workspace's working-hours tag.
 * `withCache` resets the shared tag set's expiry to the TTL of the entry being
 * written, so a longer-lived entry would outlive the tag set and could no
 * longer be invalidated. Tag invalidation is the primary path; this is only
 * the backstop.
 */
const WORKING_HOURS_CACHE_TTL_SECONDS = 60 * 60

/**
 * Date overrides are cached only for a window around "now" — enough for routing
 * and conditions; longer spans are read uncached (see `findDateOverridesForSchedules`).
 * The margin is applied on top of the UTC date so any zone's local date fits.
 */
const OVERRIDE_WINDOW_DAYS = 60
const MS_PER_DAY = 86_400_000

const utcDateKey = (instant: Date): string => instant.toISOString().slice(0, 10)

const shiftDays = (instant: Date, days: number): Date =>
  new Date(instant.getTime() + days * MS_PER_DAY)

type OverrideWindow = {
  from: string
  to: string
  rows: DateOverrideRow[]
}

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
   * Every schedule's and holiday override inside the cached window
   * (now ± {@link OVERRIDE_WINDOW_DAYS}). One entry per workspace under the
   * working-hours tag, so a write invalidates it with the rest.
   */
  private getOverrideWindow(props: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<OverrideWindow> {
    const { workspaceId, tx } = props
    return withCache(
      `working-hours:${workspaceId}:overrides`,
      async (): Promise<OverrideWindow> => {
        const now = new Date()
        const from = utcDateKey(shiftDays(now, -OVERRIDE_WINDOW_DAYS))
        const to = utcDateKey(shiftDays(now, OVERRIDE_WINDOW_DAYS))
        const rows = await workingHoursRepository.listDateOverridesInRange(
          { workspaceId, from, to },
          tx,
        )
        return {
          from,
          to,
          rows: rows.map((row) => ({
            workingHoursId: row.workingHoursId,
            date: row.date,
            ranges: row.ranges,
          })),
        }
      },
      {
        ttl: WORKING_HOURS_CACHE_TTL_SECONDS,
        tags: [workingHoursCacheTag(workspaceId)],
      },
    )
  }

  /**
   * The date overrides in force for each schedule over `[from, to]`. Served
   * from the cached window when the span (plus a one-day margin for the local
   * date) lies inside it; otherwise one uncached ranged read — never a
   * silently truncated map. A span only leaves the window for a long wait
   * (old window start) or a far-future deadline. One read for all schedules.
   */
  async findDateOverridesForSchedules(props: {
    workspaceId: string
    workingHoursIds: readonly string[]
    from: Date
    to: Date
    /** Reads on the caller's connection (see `findForAgent`). */
    tx?: DatabaseClient
  }): Promise<Map<string, WorkingDateOverrides>> {
    const { workspaceId, workingHoursIds, from, to, tx } = props
    const fromKey = utcDateKey(shiftDays(from, -1))
    const toKey = utcDateKey(shiftDays(to, 1))
    const window = await this.getOverrideWindow({ workspaceId, tx })
    const covered = window.from <= fromKey && toKey <= window.to
    const rows: DateOverrideRow[] = covered
      ? window.rows
      : (
          await workingHoursRepository.listDateOverridesInRange(
            { workspaceId, from: fromKey, to: toKey },
            tx,
          )
        ).map((row) => ({
          workingHoursId: row.workingHoursId,
          date: row.date,
          ranges: row.ranges,
        }))
    return new Map(
      workingHoursIds.map((id) => [
        id,
        buildDateOverridesForSchedule(rows, id),
      ]),
    )
  }

  async findDateOverridesFor(props: {
    workspaceId: string
    workingHoursId: string
    from: Date
    to: Date
    tx?: DatabaseClient
  }): Promise<WorkingDateOverrides> {
    const { workingHoursId, ...range } = props
    const byId = await this.findDateOverridesForSchedules({
      ...range,
      workingHoursIds: [workingHoursId],
    })
    return byId.get(workingHoursId) ?? new Map()
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
    /** Runs a cache miss on the caller's connection instead of taking a second one. */
    tx?: DatabaseClient
  }): Promise<AgentWorkingHours | null> {
    const { workspaceId, userId, tx } = props
    const cached = await withCache(
      `working-hours:${workspaceId}:agent:${userId}`,
      async (): Promise<{ schedule: AgentWorkingHours | null }> => {
        const row = await workingHoursRepository.findForUser(
          { workspaceId, userId },
          tx,
        )
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

  private parseDateOverride(override: unknown): WorkingHoursDateOverrideInput {
    const parsed = workingHoursDateOverrideInputSchema.safeParse(override)
    if (!parsed.success) {
      throw validationException(
        "date",
        parsed.error.issues[0]?.message ?? "Invalid date override",
      )
    }
    return parsed.data
  }

  private parseDateRanges(ranges: unknown): WorkingHoursDateRanges {
    const parsed = workingHoursDateRangesSchema.safeParse(ranges)
    if (!parsed.success) {
      throw validationException(
        "ranges",
        parsed.error.issues[0]?.message ?? "Invalid ranges",
      )
    }
    return parsed.data
  }

  private parseDateOverrides(
    overrides: unknown,
  ): WorkingHoursDateOverrideInput[] {
    const parsed = workingHoursDateOverridesSchema.safeParse(overrides)
    if (!parsed.success) {
      throw validationException(
        "dateOverrides",
        parsed.error.issues[0]?.message ?? "Invalid date overrides",
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
    data: {
      name?: string
      intervals?: WorkingHoursIntervalInput[]
      dateOverrides?: WorkingHoursDateOverrideInput[]
    }
  }): Promise<WorkingHoursWithRelations> {
    const { workspaceId, workingHoursId, data } = props
    const intervals =
      data.intervals === undefined
        ? undefined
        : this.parseIntervals(data.intervals)
    const dateOverrides =
      data.dateOverrides === undefined
        ? undefined
        : this.parseDateOverrides(data.dateOverrides)
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
      if (dateOverrides !== undefined) {
        const replaced = await workingHoursRepository.replaceDateOverrides(
          { workspaceId, workingHoursId, overrides: dateOverrides },
          tx,
        )
        if (replaced.status === "notFound") {
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

  // ─── Date overrides and holidays ─────────────────────────────────────────
  /** A schedule's date overrides (`workingHoursId`) or the workspace holidays (`null`), by date. Uncached. */
  async listDateOverrides(props: {
    workspaceId: string
    workingHoursId: string | null
  }): Promise<WorkingHoursDateOverrideModel[]> {
    return await workingHoursRepository.listDateOverrides(props)
  }

  async addHoliday(props: {
    workspaceId: string
    data: WorkingHoursDateOverrideInput
  }): Promise<WorkingHoursDateOverrideModel> {
    const { workspaceId } = props
    const override = this.parseDateOverride(props.data)
    const result = await workingHoursRepository.addDateOverride({
      workspaceId,
      workingHoursId: null,
      override,
    })
    if (result.status === "limitReached") {
      throw validationException(
        "date",
        `At most ${WORKING_HOURS_MAX_DATE_OVERRIDES} holidays per workspace`,
      )
    }
    if (result.status === "duplicate") {
      throw validationException(
        "date",
        `A holiday already exists on ${override.date}`,
      )
    }
    if (result.status !== "ok") {
      // A workspace-wide holiday has no parent schedule, so `notFound` cannot occur.
      throw new Error(`Unexpected add holiday result: ${result.status}`)
    }
    await this.invalidate({ workspaceId })
    await this.audit("create", `added holiday ${override.date}`)
    return result.override
  }

  async updateHoliday(props: {
    workspaceId: string
    id: string
    data: { name?: string | null; ranges?: WorkingHoursDateRanges }
  }): Promise<WorkingHoursDateOverrideModel> {
    const { workspaceId, id, data } = props
    const ranges =
      data.ranges === undefined ? undefined : this.parseDateRanges(data.ranges)
    const result = await workingHoursRepository.updateDateOverride({
      workspaceId,
      workingHoursId: null,
      id,
      name: data.name,
      ranges,
    })
    if (result.status !== "ok") {
      throw notFoundException("Holiday not found")
    }
    await this.invalidate({ workspaceId })
    await this.audit("update", `updated holiday ${result.override.date}`)
    return result.override
  }

  async deleteHoliday(props: {
    workspaceId: string
    id: string
  }): Promise<void> {
    const { workspaceId, id } = props
    const deleted = await workingHoursRepository.deleteDateOverride({
      workspaceId,
      workingHoursId: null,
      id,
    })
    if (!deleted) {
      throw notFoundException("Holiday not found")
    }
    await this.invalidate({ workspaceId })
    await this.audit("delete", `deleted holiday (#${id})`)
  }

  // ─── Cache ───────────────────────────────────────────────────────────────
  async invalidate(props: { workspaceId: string }): Promise<void> {
    await this.invalidateCacheTags(workingHoursCacheTag(props.workspaceId))
  }
}

export const workingHoursService = new WorkingHoursService()
