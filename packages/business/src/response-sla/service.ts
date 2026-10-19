import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type ResponseSlaPolicyInput,
  type ResponseSlaWindowState,
  responseSlaRepository,
} from "@chatbotx.io/database/repositories"
import type { ResponseSlaPolicyModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { validationException } from "../errors"
import { logger } from "../logger"
import {
  addWorkingSeconds,
  MAX_WORKING_WALK_DAYS,
} from "../working-hours/duration"
import { resolveMeasuredFrom } from "../working-hours/measure"
import { workingHoursService } from "../working-hours/service"
import { resolveWorkingHoursTimezone } from "../working-hours/timezone"
import { workspaceService } from "../workspace/service"

/** Short policy cache: one tiny entry per workspace (even "no policy"), tag-invalidated on write. */
const RESPONSE_SLA_CACHE_TTL_SECONDS = 60 * 60
const MS_PER_DAY = 86_400_000
const MS_PER_SECOND = 1000

/**
 * First attempt walks only the span the cached override window covers; only a
 * deadline that is not reached inside it pays for the uncached ranged read.
 */
const CACHED_WALK_DAYS = 55

export const RESPONSE_SLA_MIN_TARGET_SECONDS = 60
export const RESPONSE_SLA_MAX_TARGET_SECONDS = 30 * 24 * 60 * 60

const responseSlaCacheTag = (workspaceId: string) =>
  `response-sla:${workspaceId}`

type SlaSnapshot = {
  responseDueAt: Date
  responseSlaBreachingAt: Date
  responseSlaTargetSeconds: number
}

const secondsAfter = (from: Date, seconds: number): Date =>
  new Date(from.getTime() + seconds * MS_PER_SECOND)

/** A DM window a tracked statement opened, or whose assignee changed while it had a deadline. */
type SlaWindowChange = {
  current: ResponseSlaWindowState
  since: Date
  opened: boolean
  reassigned: boolean
}

class ResponseSlaService extends BaseService {
  // ─── Policy ──────────────────────────────────────────────────────────────
  /** Cached; a wrapper because `withCache` skips `null` and "no policy" is the common case. */
  async findPolicy(props: {
    workspaceId: string
    /** Runs a cache miss on the caller's connection instead of taking a second one. */
    tx?: DatabaseClient
  }): Promise<ResponseSlaPolicyModel | null> {
    const { workspaceId, tx } = props
    const cached = await withCache(
      `response-sla:${workspaceId}:policy`,
      async (): Promise<{ policy: ResponseSlaPolicyModel | null }> => ({
        // Only a cache miss reads the database, on the caller's connection and
        // in a savepoint: a rejected query (statement timeout, ...) rolls back
        // only the savepoint, never the caller's transaction. A cache hit costs
        // no round-trip at all.
        policy:
          (await this.inSavepoint(tx, (client) =>
            responseSlaRepository.findPolicy({ workspaceId }, client),
          )) ?? null,
      }),
      {
        ttl: RESPONSE_SLA_CACHE_TTL_SECONDS,
        tags: [responseSlaCacheTag(workspaceId)],
      },
    )
    return cached.policy
  }

  private parsePolicy(data: ResponseSlaPolicyInput): ResponseSlaPolicyInput {
    const inRange = (value: number) =>
      Number.isInteger(value) &&
      value >= RESPONSE_SLA_MIN_TARGET_SECONDS &&
      value <= RESPONSE_SLA_MAX_TARGET_SECONDS
    if (!inRange(data.firstResponseTargetSeconds)) {
      throw validationException(
        "firstResponseTargetSeconds",
        `Must be a whole number of seconds between ${RESPONSE_SLA_MIN_TARGET_SECONDS} and ${RESPONSE_SLA_MAX_TARGET_SECONDS}`,
      )
    }
    if (
      data.nextResponseTargetSeconds !== null &&
      !inRange(data.nextResponseTargetSeconds)
    ) {
      throw validationException(
        "nextResponseTargetSeconds",
        `Must be null or a whole number of seconds between ${RESPONSE_SLA_MIN_TARGET_SECONDS} and ${RESPONSE_SLA_MAX_TARGET_SECONDS}`,
      )
    }
    if (
      !Number.isInteger(data.breachingThresholdPercent) ||
      data.breachingThresholdPercent < 1 ||
      data.breachingThresholdPercent > 99
    ) {
      throw validationException(
        "breachingThresholdPercent",
        "Must be a whole number between 1 and 99",
      )
    }
    return data
  }

  async upsertPolicy(props: {
    workspaceId: string
    data: ResponseSlaPolicyInput
  }): Promise<ResponseSlaPolicyModel> {
    const { workspaceId } = props
    // One transaction: the policy row stays locked until the snapshots are
    // cleared, so a concurrent window opening cannot slip a deadline in between.
    const row = await db.transaction(async (client) => {
      const saved = await responseSlaRepository.upsertPolicy(
        { workspaceId, data: this.parsePolicy(props.data) },
        client,
      )
      if (!saved.enabled) {
        await responseSlaRepository.clearWorkspaceSnapshots(
          { workspaceId },
          client,
        )
      }
      return saved
    })
    await this.invalidateCacheTags(responseSlaCacheTag(workspaceId))
    await this.audit(
      "update",
      row.enabled
        ? "updated the response SLA policy"
        : "disabled the response SLA policy",
    )
    return row
  }

  async deletePolicy(props: { workspaceId: string }): Promise<boolean> {
    const deleted = await db.transaction(async (client) => {
      const removed = await responseSlaRepository.deletePolicy(props, client)
      await responseSlaRepository.clearWorkspaceSnapshots(props, client)
      return removed
    })
    await this.invalidateCacheTags(responseSlaCacheTag(props.workspaceId))
    if (deleted) {
      await this.audit("delete", "removed the response SLA policy")
    }
    return deleted
  }

  // ─── Snapshot computation ────────────────────────────────────────────────
  /**
   * Deadline and "breaching" instant of a window that started at `start`, for
   * the agent it is currently assigned to. An agent with a schedule is counted
   * in working time (overrides range-aware); an unassigned conversation, or an
   * agent without a schedule, in calendar time. `null` when a working-time
   * deadline is not reached within a year (no SLA is better than a wrong one).
   */
  async computeSnapshot(props: {
    workspaceId: string
    assignedUserId: string | null
    start: Date
    targetSeconds: number
    breachingThresholdPercent: number
    /** The caller's connection: cache misses read on it, never on a second one. */
    tx?: DatabaseClient
  }): Promise<SlaSnapshot | null> {
    const {
      workspaceId,
      assignedUserId,
      start,
      targetSeconds,
      breachingThresholdPercent,
      tx,
    } = props
    const breachingSeconds = Math.max(
      1,
      Math.round((targetSeconds * (100 - breachingThresholdPercent)) / 100),
    )
    const schedule = assignedUserId
      ? await workingHoursService.findForAgent({
          workspaceId,
          userId: assignedUserId,
          tx,
        })
      : null
    if (!schedule) {
      return {
        responseDueAt: secondsAfter(start, targetSeconds),
        responseSlaBreachingAt: secondsAfter(start, breachingSeconds),
        responseSlaTargetSeconds: targetSeconds,
      }
    }

    const workspace = await workspaceService.find({
      where: { id: workspaceId },
      tx,
    })
    const timezone = resolveWorkingHoursTimezone(
      workspace ?? { id: workspaceId },
    )
    const walk = async (maxDays: number) => {
      const dateOverrides = await workingHoursService.findDateOverridesFor({
        workspaceId,
        workingHoursId: schedule.workingHoursId,
        from: start,
        to: new Date(start.getTime() + maxDays * MS_PER_DAY),
        tx,
      })
      const base = {
        from: start,
        intervals: schedule.intervals,
        timezone,
        dateOverrides,
        maxDays,
      }
      return {
        due: addWorkingSeconds({ ...base, seconds: targetSeconds }),
        breaching: addWorkingSeconds({ ...base, seconds: breachingSeconds }),
      }
    }

    let { due, breaching } = await walk(CACHED_WALK_DAYS)
    // Even an empty weekly schedule can open later through a holiday or its own
    // date override, so the full-year read is never skipped.
    if (!due) {
      ;({ due, breaching } = await walk(MAX_WORKING_WALK_DAYS))
    }
    if (!(due && breaching)) {
      logger.warn(
        { workspaceId, assignedUserId, targetSeconds },
        "Response SLA deadline not reached within the walk limit; no SLA set",
      )
      return null
    }
    return {
      responseDueAt: due,
      responseSlaBreachingAt: breaching,
      responseSlaTargetSeconds: targetSeconds,
    }
  }

  // ─── Window tracking ─────────────────────────────────────────────────────
  /**
   * Runs `run` (a statement that can open the DM waiting window or change the
   * assignee of `conversationIds`) and keeps the SLA snapshot in step with it:
   * a window that this statement opened gets a deadline, and an open window
   * whose assignee changed gets it recomputed for the new agent.
   *
   * Opening and reassignment are detected from the state read under a row lock
   * taken BEFORE `run`, so a concurrent writer cannot make an old window look
   * newly opened. The deadline is written with a compare-and-set on the window
   * start, inside the same transaction (the caller's when `tx` is given).
   * Workspaces without a policy only pay one cached read.
   */
  async trackWindow<T>(
    props: {
      workspaceId: string
      conversationIds: readonly string[]
      /** Users the statement may assign (warmed before the lock). */
      assigneeHints?: readonly (string | null | undefined)[]
      tx?: DatabaseClient
    },
    run: (client: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    const { workspaceId, conversationIds } = props
    let policy: ResponseSlaPolicyModel | null
    try {
      policy = await this.findPolicy({ workspaceId, tx: props.tx })
    } catch (err) {
      // SLA bookkeeping is optional: a failed policy read is "no SLA", never a
      // failed message, assignment or pause.
      logger.warn({ err, workspaceId }, "Response SLA policy read failed")
      return await run(props.tx ?? db)
    }
    // A disabled policy keeps its targets but tracks nothing.
    if (!policy?.enabled || conversationIds.length === 0) {
      return await run(props.tx ?? db)
    }
    // The common case once a policy is on: another customer message in a window
    // that is already open. Nothing can change for the SLA, so skip the lock,
    // the warm-up and the bookkeeping. (Callers that pass assignee hints may
    // reassign, so they always take the full path.)
    if (
      !props.assigneeHints &&
      (await this.areWindowsAlreadyOpen({
        workspaceId,
        conversationIds,
        client: props.tx ?? db,
      }))
    ) {
      return await run(props.tx ?? db)
    }
    // Warm the lookups `computeSnapshot` needs BEFORE the row lock is taken, so
    // a cold cache never makes a lock-holding transaction wait on the pool.
    await this.warmLookups({
      workspaceId,
      conversationIds,
      assigneeHints: props.assigneeHints ?? [],
      tx: props.tx,
    })
    const execute = async (client: DatabaseClient): Promise<T> => {
      const before = await responseSlaRepository.readWindowStates(
        { workspaceId, ids: conversationIds, lock: true },
        client,
      )
      const result = await run(client)
      const after = await responseSlaRepository.readWindowStates(
        { workspaceId, ids: conversationIds, lock: false },
        client,
      )
      const changes = this.detectChanges(before, after)
      if (changes.length === 0) {
        return result
      }
      try {
        // A savepoint: a failed SLA write must not poison the caller's
        // transaction, and SLA bookkeeping must never fail the message,
        // assignment or pause it rides on (the window just has no deadline).
        await client.transaction((savepoint) =>
          this.syncSnapshots({
            workspaceId,
            policy,
            changes,
            client: savepoint,
          }),
        )
      } catch (err) {
        logger.warn(
          { err, workspaceId, conversationIds },
          "Response SLA snapshot update failed; window left without a deadline",
        )
        // The savepoint rolled back, so an open window may still carry the
        // previous assignee's deadline: a wrong deadline is worse than none.
        await this.dropStaleSnapshots({ workspaceId, before, after, client })
      }
      return result
    }
    return props.tx ? await execute(props.tx) : await db.transaction(execute)
  }

  /** Runs `fn` in a savepoint of the caller's transaction, or plain when there is none. */
  private inSavepoint<T>(
    tx: DatabaseClient | undefined,
    fn: (client: DatabaseClient | undefined) => Promise<T>,
  ): Promise<T> {
    return tx ? tx.transaction((savepoint) => fn(savepoint)) : fn(undefined)
  }

  /**
   * Best effort, never throws: fills the caches `computeSnapshot` reads — the
   * workspace, the override window and the schedule of every agent involved (the
   * current assignee, read without a lock, plus the caller's hints) — so a cold
   * cache never makes a lock-holding transaction wait for a second connection.
   * An assignee that changes in between falls back to the in-lock lookup.
   */
  private async warmLookups(props: {
    workspaceId: string
    conversationIds: readonly string[]
    assigneeHints: readonly (string | null | undefined)[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId } = props
    try {
      await this.inSavepoint(props.tx, async (client) => {
        const userIds = new Set(
          await responseSlaRepository.readAssigneeIds(
            { workspaceId, ids: props.conversationIds },
            client,
          ),
        )
        for (const hint of props.assigneeHints) {
          if (hint) {
            userIds.add(hint)
          }
        }
        await Promise.all([
          workspaceService.find({ where: { id: workspaceId }, tx: client }),
          workingHoursService.findDateOverridesForSchedules({
            workspaceId,
            workingHoursIds: [],
            from: new Date(),
            to: new Date(Date.now() + CACHED_WALK_DAYS * MS_PER_DAY),
            tx: client,
          }),
          ...[...userIds].map((userId) =>
            workingHoursService.findForAgent({
              workspaceId,
              userId,
              tx: client,
            }),
          ),
        ])
      })
    } catch (err) {
      logger.warn({ err, workspaceId }, "Response SLA cache warm-up failed")
    }
  }

  /** A failed peek just means the full path runs. */
  private async areWindowsAlreadyOpen(props: {
    workspaceId: string
    conversationIds: readonly string[]
    client: DatabaseClient
  }): Promise<boolean> {
    try {
      return await responseSlaRepository.areWindowsAlreadyOpen(
        { workspaceId: props.workspaceId, ids: props.conversationIds },
        props.client,
      )
    } catch {
      return false
    }
  }

  /** The DM windows a statement opened, or whose assignee changed while a deadline was set. */
  private detectChanges(
    before: ResponseSlaWindowState[],
    after: ResponseSlaWindowState[],
  ): SlaWindowChange[] {
    const previous = new Map(before.map((state) => [state.id, state]))
    const changes: SlaWindowChange[] = []
    for (const current of after) {
      const since = current.awaitingHumanReplySince
      if (current.sourceId !== null || since === null) {
        continue
      }
      const prior = previous.get(current.id)
      const opened = prior?.awaitingHumanReplySince === null
      const reassigned =
        !opened &&
        current.responseDueAt !== null &&
        prior?.assignedUserId !== current.assignedUserId
      if (opened || reassigned) {
        changes.push({ current, since, opened, reassigned })
      }
    }
    return changes
  }

  private async syncSnapshots(props: {
    workspaceId: string
    policy: ResponseSlaPolicyModel
    changes: SlaWindowChange[]
    client: DatabaseClient
  }): Promise<void> {
    const { workspaceId, policy, client } = props
    for (const { current, since, opened, reassigned } of props.changes) {
      const targetSeconds = opened
        ? this.targetFor(policy, current.adminRepliedAt === null)
        : current.responseSlaTargetSeconds
      if (targetSeconds === null) {
        continue
      }
      const snapshot = await this.computeSnapshot({
        workspaceId,
        assignedUserId: current.assignedUserId,
        start: resolveMeasuredFrom({
          closedAwaitingSince: since,
          assignedUserId: current.assignedUserId,
          assignedUserAt: current.assignedUserAt,
          adminId: current.assignedUserId ?? "",
        }),
        targetSeconds,
        breachingThresholdPercent: policy.breachingThresholdPercent,
        tx: client,
      })
      if (snapshot) {
        await responseSlaRepository.setSnapshotIfWindowUnchanged(
          {
            workspaceId,
            id: current.id,
            expectedSince: since,
            snapshot,
          },
          client,
        )
      } else if (reassigned) {
        // The new agent's calendar cannot supply the target: the old agent's
        // deadline no longer applies, and a wrong deadline is worse than none.
        await responseSlaRepository.clearSnapshotIfWindowUnchanged(
          { workspaceId, id: current.id, expectedSince: since },
          client,
        )
      }
    }
  }

  /** Best effort: clears the snapshot of windows that were open before and after a failed sync. */
  private async dropStaleSnapshots(props: {
    workspaceId: string
    before: ResponseSlaWindowState[]
    after: ResponseSlaWindowState[]
    client: DatabaseClient
  }): Promise<void> {
    const openBefore = new Set(
      props.before
        .filter((state) => state.awaitingHumanReplySince !== null)
        .map((state) => state.id),
    )
    try {
      await props.client.transaction(async (savepoint) => {
        for (const state of props.after) {
          if (
            state.awaitingHumanReplySince !== null &&
            state.responseDueAt !== null &&
            openBefore.has(state.id)
          ) {
            await responseSlaRepository.clearSnapshotIfWindowUnchanged(
              {
                workspaceId: props.workspaceId,
                id: state.id,
                expectedSince: state.awaitingHumanReplySince,
              },
              savepoint,
            )
          }
        }
      })
    } catch (err) {
      logger.warn(
        { err, workspaceId: props.workspaceId },
        "Response SLA stale snapshot cleanup failed",
      )
    }
  }

  private targetFor(
    policy: ResponseSlaPolicyModel,
    isFirstResponse: boolean,
  ): number | null {
    return isFirstResponse
      ? policy.firstResponseTargetSeconds
      : policy.nextResponseTargetSeconds
  }
}

export const responseSlaService = new ResponseSlaService()
