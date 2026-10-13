import { broadcastAnalyticsService } from "@chatbotx.io/analytics"
import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import type { OccurrenceBucketGranularity } from "@chatbotx.io/database/partials"
import {
  type BroadcastOccurrenceReason,
  broadcastOccurrenceOutcomes,
  broadcastOccurrenceReasons,
  broadcastScheduleTypes,
  broadcastStatuses,
  isRecurringTemplate,
  isTemplateSendWithoutPage,
  usesBroadcastTargets,
} from "@chatbotx.io/database/partials"
import {
  broadcastRepository,
  type DueRecurrence,
  type DueRecurrenceCursor,
  type LedgerBucketCell,
  broadcastRecurrenceRepository as repository,
} from "@chatbotx.io/database/repositories"
import { broadcastModel } from "@chatbotx.io/database/schema"
import type {
  BroadcastModel,
  BroadcastRecurrenceModel,
} from "@chatbotx.io/database/types"
import {
  computeLatestOccurrence,
  computeNextOccurrence,
  computeNextSendable,
  findSlotOnDate,
  isExcludedSlot,
  listUpcomingOccurrences,
  localDateOf,
  RECURRENCE_MAX_EXCLUDED_DATES,
  RECURRENCE_WEEK_STARTS_ON,
  type RecurrenceRule,
  recurrenceRuleSchema,
  resolveZonedInstant,
  toLocalSlot,
} from "@chatbotx.io/utils/recurrence"
import {
  canonicalizeTimezone,
  isValidTimezone,
} from "@chatbotx.io/utils/timezone"
import { formatInTimeZone } from "date-fns-tz"
import { BaseService } from "../base.service"
import {
  BROADCAST_PLAN_LIMIT_CODE,
  BroadcastValidationException,
  ChatbotXException,
  notFoundException,
  validationException,
} from "../errors"
import { buildDerivedBroadcastValues, copyBroadcastTargets } from "./derive"
import {
  broadcastPlanPolicyService,
  type RestrictedBroadcastPlanContext,
} from "./plan-policy.service"
import {
  accountSlots,
  type DisarmReason,
  disarmSeries,
} from "./recurrence-ledger"

/** A `scheduled` run older than this is shown as stalled (derived, never stored). */
export const BROADCAST_RUN_STALLED_AFTER_MS = 30 * 60 * 1000
export const BROADCAST_RUN_GROUPS_MAX_BUCKETS = 31
export const BROADCAST_OCCURRENCES_MAX_PER_PAGE = 100
export const BROADCAST_PREVIEW_MAX_COUNT = 10

const ONE_MS = 1
const SKIP_RESPONSE_UPCOMING_RUNS = 3

/** A series can skip a run while it is running or paused (a paused series is a cancelled template). */
const isSkippableStatus = (status: BroadcastModel["status"]): boolean =>
  status === broadcastStatuses.enum.recurring ||
  status === broadcastStatuses.enum.cancelled

type MaterializeSkipReason = Extract<
  BroadcastOccurrenceReason,
  "planLimit" | "noTargets" | "undeliverable"
>

const MATERIALIZE_SKIP_REASONS: ReadonlySet<BroadcastOccurrenceReason> =
  new Set<MaterializeSkipReason>(["planLimit", "noTargets", "undeliverable"])

const isMaterializeSkipReason = (
  reason: BroadcastOccurrenceReason,
): reason is MaterializeSkipReason => MATERIALIZE_SKIP_REASONS.has(reason)

/** Distinct skipped dates, oldest first; `undefined` when none so the stored rule stays minimal. */
const normalizeExcludeDates = (
  excludeDates: string[] | undefined,
): string[] | undefined => {
  const distinct = [...new Set(excludeDates)].sort()
  return distinct.length > 0 ? distinct : undefined
}

/**
 * The rule as stored and previewed: validated, with its timezone in the
 * canonical IANA spelling and its skipped dates deduplicated and sorted.
 */
const normalizeRule = (rule: RecurrenceRule): RecurrenceRule =>
  recurrenceRuleSchema.parse({
    ...rule,
    timezone: canonicalizeTimezone(rule.timezone),
    excludeDates: normalizeExcludeDates(rule.excludeDates),
  })

type SlotDecision =
  | { outcome: "created"; childBroadcastId: string }
  | { outcome: "skipped"; reason: BroadcastOccurrenceReason }

/** The series' skipped dates and what it will send next, returned by every skip/restore. */
export type OccurrenceSkipState = {
  excludeDates: string[]
  nextSendAt: Date | null
  upcomingRuns: string[]
}

export type MaterializeOccurrenceInput = {
  recurrenceId: string
  /** The workspace the job was enqueued for; the series must belong to it. */
  workspaceId: string
  occurrenceAt: Date
}

export type MaterializeOccurrenceResult = {
  createdBroadcastId: string | null
  seriesEnded: boolean
  skipped?: MaterializeSkipReason
  /** The slot was already settled by an earlier attempt; this call changed nothing. */
  replayed?: boolean
}

const NOTHING_MATERIALIZED: MaterializeOccurrenceResult = {
  createdBroadcastId: null,
  seriesEnded: false,
}

const isActiveBroadcastsLimit = (error: unknown): boolean =>
  error instanceof ChatbotXException &&
  error.code === BROADCAST_PLAN_LIMIT_CODE &&
  error.data?.reason === "activeBroadcasts"

/** First day of the bucket after `bucket` (a `YYYY-MM-DD` local first day). */
const NEXT_BUCKET_START: Record<
  OccurrenceBucketGranularity,
  (start: Date) => Date
> = {
  day: (start) => new Date(start.getTime() + 86_400_000),
  week: (start) => new Date(start.getTime() + 7 * 86_400_000),
  month: (start) =>
    new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)),
}

export const nextBucketStart = (
  bucket: string,
  granularity: OccurrenceBucketGranularity,
): string =>
  NEXT_BUCKET_START[granularity](new Date(`${bucket}T00:00:00.000Z`))
    .toISOString()
    .slice(0, 10)

const addCount = <K extends string>(
  counts: Partial<Record<K, number>>,
  key: K,
  amount: number,
): void => {
  counts[key] = (counts[key] ?? 0) + amount
}

export type RunGroup = {
  /** First local day of the group (`YYYY-MM-DD` in the group timezone). */
  periodStart: string
  /** First local day after the group (exclusive). */
  periodEnd: string
  /** The same boundaries as instants: pass them as `from` / `to` to list the group's slots. */
  periodStartAt: string
  periodEndAt: string
  slotCount: number
  createdCount: number
  skippedCount: number
  missedCount: number
  reasonCounts: Partial<Record<BroadcastOccurrenceReason, number>>
  runStateCounts: Record<string, number>
  stats: Awaited<
    ReturnType<typeof broadcastAnalyticsService.getStatsByOccurrenceBucket>
  >[string]
}

export const groupLedgerCells = (
  buckets: string[],
  cells: LedgerBucketCell[],
  granularity: OccurrenceBucketGranularity,
  timezone: string,
): Omit<RunGroup, "stats">[] =>
  buckets.map((bucket) => {
    const periodEnd = nextBucketStart(bucket, granularity)
    const group: Omit<RunGroup, "stats"> = {
      periodStart: bucket,
      periodEnd,
      periodStartAt: resolveZonedInstant(
        bucket,
        "00:00",
        timezone,
      ).toISOString(),
      periodEndAt: resolveZonedInstant(
        periodEnd,
        "00:00",
        timezone,
      ).toISOString(),
      slotCount: 0,
      createdCount: 0,
      skippedCount: 0,
      missedCount: 0,
      reasonCounts: {},
      runStateCounts: {},
    }
    for (const cell of cells.filter(
      (candidate) => candidate.bucket === bucket,
    )) {
      group.slotCount += cell.slots
      if (cell.outcome === "created") {
        group.createdCount += cell.slots
        if (cell.runStatus) {
          addCount(group.runStateCounts, cell.runStatus, cell.slots)
        }
      } else if (cell.outcome === "skipped") {
        group.skippedCount += cell.slots
      } else {
        group.missedCount += cell.slots
      }
      if (cell.reason) {
        addCount(group.reasonCounts, cell.reason, cell.slots)
      }
    }
    return group
  })

class BroadcastRecurrenceService extends BaseService {
  // ---- schedule -----------------------------------------------------------

  /**
   * Stores the rule of a template, creating the series row when it has none,
   * and returns it locked. Never deletes: a series keeps its history even when
   * the template is edited back to a one-off broadcast.
   */
  async upsertRule(
    tx: DatabaseClient,
    input: { workspaceId: string; broadcastId: string; rule: RecurrenceRule },
  ): Promise<BroadcastRecurrenceModel> {
    const rule = normalizeRule(input.rule)
    await repository.insertIfMissing(tx, {
      workspaceId: input.workspaceId,
      broadcastId: input.broadcastId,
      rule,
    })
    const [locked] = await repository.lockForWrite(tx, {
      workspaceId: input.workspaceId,
      broadcastIds: [input.broadcastId],
    })
    if (!locked) {
      throw notFoundException("Recurrence not found")
    }
    await repository.update(tx, { id: locked.id, patch: { rule } })
    return { ...locked, rule }
  }

  /**
   * Starts (or restarts) the series: accounts the slots that elapsed while it
   * was off, computes the next run, and returns what the caller must write on
   * the template. A restricted channel's explicit over-cap rate is rejected
   * exactly like a one-off broadcast's; a blank rate stores the cap.
   */
  async arm(
    tx: DatabaseClient,
    input: {
      recurrence: BroadcastRecurrenceModel
      workspaceId: string
      channel: string
      sendRatePerMinute: number | null | undefined
      restriction: RestrictedBroadcastPlanContext | null
      now: Date
    },
  ): Promise<{
    nextRunAt: Date
    sendRateOverride: { sendRatePerMinute: number } | undefined
  }> {
    const { recurrence, now } = input
    const nextRunAt = computeNextOccurrence(recurrence.rule, {
      after: now,
      occurrenceCount: recurrence.occurrenceCount,
    })
    if (!nextRunAt) {
      throw new BroadcastValidationException(
        "The schedule has no upcoming run",
        "recurrence",
      )
    }

    const sendRateOverride = input.restriction
      ? await broadcastPlanPolicyService.assertActivationAllowed(tx, {
          workspaceId: input.workspaceId,
          channel: input.channel,
          restriction: input.restriction,
          sendRatePerMinute: input.sendRatePerMinute,
          checkSlot: false,
        })
      : undefined

    await accountSlots(tx, {
      recurrence,
      through: now,
      outcome: "skipped",
      reason: recurrence.pausedAt ? "paused" : "draft",
      now,
    })
    await repository.update(tx, {
      id: recurrence.id,
      patch: {
        nextRunAt,
        accountedThroughAt: now,
        pausedAt: null,
        endedAt: null,
      },
    })
    return { nextRunAt, sendRateOverride }
  }

  /** Stops the series, first accounting any slot that was already due but not yet taken. */
  disarm(
    tx: DatabaseClient,
    input: {
      recurrence: BroadcastRecurrenceModel
      reason: DisarmReason
      now: Date
    },
  ): Promise<void> {
    return disarmSeries(tx, input)
  }

  // ---- materialization ----------------------------------------------------

  listDue(input: {
    limit: number
    cursor?: DueRecurrenceCursor | null
  }): Promise<DueRecurrence[]> {
    return repository.listDue(input)
  }

  findOldestDueAgeMs(): Promise<number | null> {
    return repository.findOldestDueAgeMs()
  }

  /** A blocked owner's slot: nothing is sent and the series moves on, with the reason on the ledger. */
  async skipOccurrence(
    input: MaterializeOccurrenceInput & { reason: "blockedOwner" },
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const found = await repository.findForMaterialize(tx, input)
      if (!(found && this.isDueSlot(found.recurrence, input.occurrenceAt))) {
        return
      }
      const now = await repository.selectDbNow(tx)
      await this.settleSlot(tx, {
        ...found,
        occurrenceAt: input.occurrenceAt,
        now,
        decision: { outcome: "skipped", reason: input.reason },
      })
    })
  }

  /**
   * Turns one due slot into a run (a child broadcast) or into a reasoned skip,
   * and advances the series — all in one transaction, so the ledger row, the
   * run, its targets and the cursor are either all there or all absent. A
   * replayed job finds the slot already settled and changes nothing.
   */
  async materializeOccurrence(
    input: MaterializeOccurrenceInput,
  ): Promise<MaterializeOccurrenceResult> {
    const result = await db.transaction(async (tx) => {
      const found = await repository.findForMaterialize(tx, input)
      if (!found) {
        return NOTHING_MATERIALIZED
      }
      const { recurrence, template } = found
      const now = await repository.selectDbNow(tx)

      if (!this.isDueSlot(recurrence, input.occurrenceAt)) {
        return await this.findSettledRun(tx, recurrence, input.occurrenceAt)
      }
      if (!this.isLiveTemplate(template)) {
        await disarmSeries(tx, { recurrence, reason: "draft", now })
        return NOTHING_MATERIALIZED
      }

      const effective = this.resolveEffectiveSlot(recurrence, input, now)
      await accountSlots(tx, {
        recurrence,
        through: new Date(effective.getTime() - ONE_MS),
        outcome: "missed",
        reason: "catchUpSuperseded",
        now,
      })

      const decision = await this.decideSlot(tx, {
        recurrence,
        template,
        occurrenceAt: effective,
      })
      return await this.settleSlot(tx, {
        recurrence,
        template,
        occurrenceAt: effective,
        now,
        decision,
      })
    })

    if (result.createdBroadcastId && !result.replayed) {
      await this.audit(
        "launch",
        `launched a recurring broadcast run (#${result.createdBroadcastId})`,
      )
    }
    return result
  }

  /**
   * What to do with a due slot: skip it (nothing to deliver, or no capacity) or
   * create its run. Capacity is reserved before anything is inserted, so a
   * skip leaves nothing to roll back.
   */
  private async decideSlot(
    tx: DatabaseClient,
    input: {
      recurrence: BroadcastRecurrenceModel
      template: BroadcastModel
      occurrenceAt: Date
    },
  ): Promise<SlotDecision> {
    const { recurrence, template, occurrenceAt } = input
    // Checked first: a skipped date must not reserve capacity or touch targets.
    if (isExcludedSlot(recurrence.rule, occurrenceAt)) {
      return { outcome: "skipped", reason: "excludedDate" }
    }
    const blocking = await this.findBlockingReason(tx, template)
    if (blocking) {
      return { outcome: "skipped", reason: blocking }
    }
    const capacity = await this.reserveCapacity(tx, template)
    if (capacity === "planLimit") {
      return { outcome: "skipped", reason: "planLimit" }
    }
    const childBroadcastId = await this.insertRun(tx, {
      template,
      rule: recurrence.rule,
      occurrenceAt,
      rateOverride: capacity,
    })
    return { outcome: "created", childBroadcastId }
  }

  /** The slot is only actionable while it is the series' armed `nextRunAt`. */
  private isDueSlot(
    recurrence: BroadcastRecurrenceModel,
    occurrenceAt: Date,
  ): boolean {
    return recurrence.nextRunAt?.getTime() === occurrenceAt.getTime()
  }

  private isLiveTemplate(template: BroadcastModel): boolean {
    return (
      template.status === broadcastStatuses.enum.recurring &&
      template.deletedAt === null &&
      isRecurringTemplate(template)
    )
  }

  /**
   * A retried job after a lost commit acknowledgement: report the decision the
   * first attempt took. After a catch-up the run belongs to a LATER slot than
   * the job's own, so the series' last settled slot is consulted too.
   */
  private async findSettledRun(
    tx: DatabaseClient,
    recurrence: BroadcastRecurrenceModel,
    occurrenceAt: Date,
  ): Promise<MaterializeOccurrenceResult> {
    const { timezone } = recurrence.rule
    const own = await repository.findLedgerRow(tx, {
      recurrenceId: recurrence.id,
      localSlot: toLocalSlot(occurrenceAt, timezone),
      occurrenceAt,
    })
    const supersededBy =
      own?.outcome === "missed" &&
      recurrence.lastOccurrenceAt &&
      recurrence.lastOccurrenceAt > occurrenceAt
        ? await repository.findLedgerRow(tx, {
            recurrenceId: recurrence.id,
            localSlot: toLocalSlot(recurrence.lastOccurrenceAt, timezone),
            occurrenceAt: recurrence.lastOccurrenceAt,
          })
        : null
    const settled = supersededBy ?? own
    // No ledger row means the job was merely stale (paused or edited since it
    // was enqueued): nothing was settled, so nothing is replayed.
    if (!settled) {
      return NOTHING_MATERIALIZED
    }
    return {
      createdBroadcastId: settled.childBroadcastId,
      seriesEnded: recurrence.nextRunAt === null && recurrence.endedAt !== null,
      replayed: true,
    }
  }

  /** The latest slot not in the future: after an outage only that one is sent. */
  private resolveEffectiveSlot(
    recurrence: BroadcastRecurrenceModel,
    input: MaterializeOccurrenceInput,
    now: Date,
  ): Date {
    const latest = computeLatestOccurrence(recurrence.rule, {
      atOrBefore: now,
      occurrenceCount: recurrence.occurrenceCount,
    })
    return latest && latest > input.occurrenceAt ? latest : input.occurrenceAt
  }

  /** A page or flow removed since the series was armed leaves nothing deliverable. */
  private async findBlockingReason(
    tx: DatabaseClient,
    template: BroadcastModel,
  ): Promise<Extract<
    MaterializeSkipReason,
    "noTargets" | "undeliverable"
  > | null> {
    if (!usesBroadcastTargets(template)) {
      // A template whose page (integration) was disconnected can no longer send.
      if (isTemplateSendWithoutPage(template)) {
        return "undeliverable"
      }
      return template.flowId || template.templateId ? null : "undeliverable"
    }
    const targets = await tx.query.broadcastTargetModel.findMany({
      where: { broadcastId: template.id },
      columns: { flowId: true, templateId: true },
    })
    if (targets.length === 0) {
      return "noTargets"
    }
    return targets.some((target) => target.flowId || target.templateId)
      ? null
      : "undeliverable"
  }

  /**
   * Checked BEFORE the run is inserted, so a full slot rejects cleanly with
   * nothing to roll back. The template's rate is clamped to the plan's CURRENT
   * cap: a policy change since arming shrinks the run instead of failing it.
   */
  private async reserveCapacity(
    tx: DatabaseClient,
    template: BroadcastModel,
  ): Promise<{ sendRatePerMinute: number } | "planLimit" | undefined> {
    if (!broadcastPlanPolicyService.appliesToChannel(template.channel)) {
      return
    }
    const restriction = broadcastPlanPolicyService.restrictionFor(
      await broadcastPlanPolicyService.resolveForWorkspace(
        template.workspaceId,
      ),
      template.channel,
    )
    if (!restriction) {
      return
    }
    const cap = restriction.policy.maxSendRatePerMinute
    try {
      return await broadcastPlanPolicyService.assertActivationAllowed(tx, {
        workspaceId: template.workspaceId,
        channel: template.channel,
        restriction,
        sendRatePerMinute: Math.min(template.sendRatePerMinute ?? cap, cap),
        checkSlot: true,
      })
    } catch (error) {
      if (isActiveBroadcastsLimit(error)) {
        return "planLimit"
      }
      throw error
    }
  }

  /** Inserts the run; an existing run for the same instant is reused (one instant is one send). */
  private async insertRun(
    tx: DatabaseClient,
    input: {
      template: BroadcastModel
      rule: RecurrenceRule
      occurrenceAt: Date
      rateOverride: { sendRatePerMinute: number } | undefined
    },
  ): Promise<string> {
    const { template, occurrenceAt } = input
    const [inserted] = await tx
      .insert(broadcastModel)
      .values(
        buildDerivedBroadcastValues(template, {
          name: `${template.name} · ${formatInTimeZone(occurrenceAt, input.rule.timezone, "yyyy-MM-dd HH:mm")}`,
          status: broadcastStatuses.enum.scheduled,
          schedulesType: broadcastScheduleTypes.enum.future,
          schedulesAt: occurrenceAt,
          parentBroadcastId: template.id,
          occurrenceAt,
          ...input.rateOverride,
        }),
      )
      .onConflictDoNothing({
        target: [broadcastModel.parentBroadcastId, broadcastModel.occurrenceAt],
      })
      .returning({ id: broadcastModel.id })

    if (!inserted) {
      const existing = await tx.query.broadcastModel.findFirst({
        where: {
          parentBroadcastId: template.id,
          occurrenceAt: { eq: occurrenceAt },
        },
        columns: { id: true },
      })
      if (!existing) {
        throw new ChatbotXException("Run could not be created")
      }
      return existing.id
    }
    await copyBroadcastTargets(tx, {
      sourceBroadcastId: template.id,
      broadcastId: inserted.id,
    })
    return inserted.id
  }

  /**
   * Records the decision for a slot and advances the series: the ledger row,
   * then a compare-and-set on `nextRunAt` that must hit exactly one row. The
   * lifetime count only grows on a created run, so skipped slots never use up
   * an `afterOccurrences` budget.
   */
  private async settleSlot(
    tx: DatabaseClient,
    input: {
      recurrence: BroadcastRecurrenceModel
      template: BroadcastModel
      occurrenceAt: Date
      now: Date
      decision: SlotDecision
    },
  ): Promise<MaterializeOccurrenceResult> {
    const { recurrence, template, occurrenceAt, now, decision } = input
    const created = decision.outcome === "created"
    const armedSlot = recurrence.nextRunAt as Date

    await repository.insertLedgerRows(tx, [
      {
        workspaceId: recurrence.workspaceId,
        recurrenceId: recurrence.id,
        localSlot: toLocalSlot(occurrenceAt, recurrence.rule.timezone),
        occurrenceAt,
        outcome: decision.outcome,
        reason: created ? null : decision.reason,
        childBroadcastId: created ? decision.childBroadcastId : null,
        materializedAt: now,
      },
    ])

    const occurrenceCount = recurrence.occurrenceCount + (created ? 1 : 0)
    const nextRunAt = computeNextOccurrence(recurrence.rule, {
      after: occurrenceAt,
      occurrenceCount,
    })
    const advanced = await repository.update(tx, {
      id: recurrence.id,
      expectedNextRunAt: armedSlot,
      patch: {
        nextRunAt,
        accountedThroughAt: occurrenceAt,
        occurrenceCount,
        lastOccurrenceAt: occurrenceAt,
        ...(nextRunAt ? {} : { endedAt: now }),
      },
    })
    if (!advanced) {
      throw new ChatbotXException("Recurrence moved while materializing")
    }

    await tx
      .update(broadcastModel)
      .set({
        schedulesAt: nextRunAt ?? occurrenceAt,
        ...(nextRunAt ? {} : { status: broadcastStatuses.enum.sent }),
      })
      .where(eq(broadcastModel.id, template.id))

    return {
      createdBroadcastId: created ? decision.childBroadcastId : null,
      seriesEnded: nextRunAt === null,
      ...(decision.outcome === "skipped" &&
      isMaterializeSkipReason(decision.reason)
        ? { skipped: decision.reason }
        : {}),
    }
  }

  /**
   * Skips (or restores) the runs on local dates of an armed or paused series.
   * A run is named by its local date (`dates`) or by its instant
   * (`occurrenceAts`, as listed in `upcomingRuns`); all of them change in one
   * transaction or none does. A date stays a real slot: the worker still reaches it and settles it as
   * `skipped / excludedDate`, so the cursor never moves here. Only the rule
   * changes, under the series lock, so it is serialized against the worker —
   * whichever commits first wins, and a slot that already ran is rejected.
   */
  async setOccurrenceExcluded(input: {
    workspaceId: string
    idOrName: string
    dates?: string[]
    occurrenceAts?: Date[]
    excluded: boolean
  }): Promise<OccurrenceSkipState> {
    const { recurrence: unlocked } = await this.findSeries(input)
    const { recurrence, rule, applied } = await db.transaction(async (tx) => {
      const found = await repository.findForMaterialize(tx, {
        recurrenceId: unlocked.id,
        workspaceId: input.workspaceId,
      })
      if (!found) {
        throw notFoundException("Broadcast not found")
      }
      const { recurrence: locked, template } = found
      this.assertSkippable(locked, template)

      const requested = this.requestedDates(locked.rule, input)
      const current = locked.rule.excludeDates ?? []
      // A date already in the wanted state is a no-op, not an error.
      const pending = requested.filter(
        (date) => current.includes(date) !== input.excluded,
      )
      if (pending.length === 0) {
        return { recurrence: locked, rule: locked.rule, applied: [] }
      }

      const now = await repository.selectDbNow(tx)
      for (const date of pending) {
        this.assertDateCanChange(locked, {
          date,
          excluded: input.excluded,
          now,
        })
      }
      const updated = this.withExcludedDates(locked, {
        dates: pending,
        excluded: input.excluded,
      })
      await repository.update(tx, { id: locked.id, patch: { rule: updated } })
      return { recurrence: locked, rule: updated, applied: pending }
    })

    if (applied.length > 0) {
      await this.audit(
        "update",
        `${input.excluded ? "skipped" : "restored"} recurring broadcast runs on ${applied.join(", ")} (#${unlocked.broadcastId})`,
      )
    }
    return this.describeSkipState(recurrence, rule)
  }

  /** The local dates a request names, from `dates` and/or the instants of `occurrenceAts`, distinct and in order. */
  private requestedDates(
    rule: RecurrenceRule,
    input: { dates?: string[]; occurrenceAts?: Date[] },
  ): string[] {
    const requested = [
      ...(input.dates ?? []),
      ...(input.occurrenceAts ?? []).map((instant) =>
        localDateOf(instant, rule.timezone),
      ),
    ]
    if (requested.length === 0) {
      throw new BroadcastValidationException(
        "Name at least one run to skip or restore",
        "recurrence",
      )
    }
    return [...new Set(requested)].sort()
  }

  private assertSkippable(
    recurrence: BroadcastRecurrenceModel,
    template: BroadcastModel,
  ): void {
    const skippable =
      template.deletedAt === null &&
      isRecurringTemplate(template) &&
      recurrence.endedAt === null &&
      isSkippableStatus(template.status)
    if (!skippable) {
      throw new BroadcastValidationException(
        "Only a repeating broadcast that is running or paused can skip a run",
        "recurrence",
      )
    }
  }

  /** The date must be a run that has not started (and has not been settled) yet. */
  private assertDateCanChange(
    recurrence: BroadcastRecurrenceModel,
    input: { date: string; excluded: boolean; now: Date },
  ): void {
    const slot = findSlotOnDate(recurrence.rule, {
      date: input.date,
      occurrenceCount: recurrence.occurrenceCount,
    })
    if (!slot) {
      // A leftover date that no longer matches a run may always be removed.
      if (input.excluded) {
        throw new BroadcastValidationException(
          "The schedule has no run on that date",
          "recurrence",
        )
      }
      return
    }
    const settledThrough = recurrence.accountedThroughAt
    if (slot <= input.now || (settledThrough && slot <= settledThrough)) {
      throw new BroadcastValidationException(
        "That run has already started and can no longer change",
        "recurrence",
      )
    }
  }

  /** The rule with dates added or removed; dates already settled are dropped so the list stays small. */
  private withExcludedDates(
    recurrence: BroadcastRecurrenceModel,
    input: { dates: string[]; excluded: boolean },
  ): RecurrenceRule {
    const { rule, accountedThroughAt } = recurrence
    const settledDate = accountedThroughAt
      ? localDateOf(accountedThroughAt, rule.timezone)
      : null
    const kept = (rule.excludeDates ?? []).filter(
      (date) =>
        !input.dates.includes(date) && (!settledDate || date >= settledDate),
    )
    const next = normalizeExcludeDates(
      input.excluded ? [...kept, ...input.dates] : kept,
    )
    if ((next?.length ?? 0) > RECURRENCE_MAX_EXCLUDED_DATES) {
      throw new BroadcastValidationException(
        `Skip at most ${RECURRENCE_MAX_EXCLUDED_DATES} dates`,
        "recurrence",
      )
    }
    return { ...rule, excludeDates: next }
  }

  /** What an agent or the UI needs after a change: the skipped dates, the next real send and the next runs. */
  private describeSkipState(
    recurrence: BroadcastRecurrenceModel,
    rule: RecurrenceRule,
  ): OccurrenceSkipState {
    return {
      excludeDates: rule.excludeDates ?? [],
      nextSendAt: this.nextSendAtOf({ ...recurrence, rule }),
      upcomingRuns: recurrence.nextRunAt
        ? this.upcomingRunsOf(
            { rule, occurrenceCount: recurrence.occurrenceCount },
            new Date(),
            SKIP_RESPONSE_UPCOMING_RUNS,
          )
        : [],
    }
  }

  /** The next run that will really send: the armed slot, or the first one after skipped dates. */
  nextSendAtOf(
    recurrence: Pick<
      BroadcastRecurrenceModel,
      "rule" | "nextRunAt" | "occurrenceCount"
    >,
  ): Date | null {
    return recurrence.nextRunAt
      ? computeNextSendable(recurrence.rule, {
          from: recurrence.nextRunAt,
          occurrenceCount: recurrence.occurrenceCount,
        })
      : null
  }

  // ---- reads --------------------------------------------------------------

  /** The upcoming runs of a rule — one function behind the form preview, the API preview and the detail views. */
  previewUpcoming(input: { rule: RecurrenceRule; count: number; now: Date }): {
    upcomingRuns: string[]
    timezone: string
    weekStartsOn: typeof RECURRENCE_WEEK_STARTS_ON
  } {
    const rule = normalizeRule(input.rule)
    return {
      upcomingRuns: this.upcomingRunsOf(
        { rule, occurrenceCount: 0 },
        input.now,
        Math.min(input.count, BROADCAST_PREVIEW_MAX_COUNT),
      ),
      timezone: rule.timezone,
      weekStartsOn: RECURRENCE_WEEK_STARTS_ON,
    }
  }

  /** Next runs of a stored series, for detail responses. */
  upcomingRunsOf(
    recurrence: Pick<BroadcastRecurrenceModel, "rule" | "occurrenceCount">,
    now: Date,
    count: number,
  ): string[] {
    return listUpcomingOccurrences(recurrence.rule, {
      after: now,
      occurrenceCount: recurrence.occurrenceCount,
      limit: count,
    }).map((date) => date.toISOString())
  }

  private async findSeries(input: { workspaceId: string; idOrName: string }) {
    const template = await broadcastRepository.findByIdOrName(input)
    if (!template) {
      throw notFoundException("Broadcast not found")
    }
    const recurrence = await repository.findByBroadcastId(db, {
      broadcastId: template.id,
    })
    if (!recurrence) {
      throw notFoundException("This broadcast does not repeat")
    }
    return { template, recurrence }
  }

  /** Slots grouped by local day / ISO week / month, newest first, with the stats of the runs inside. */
  async listRunGroups(input: {
    workspaceId: string
    idOrName: string
    granularity: OccurrenceBucketGranularity
    timezone?: string | null
    limit: number
    cursor?: string | null
  }) {
    const { template, recurrence } = await this.findSeries(input)
    const requested = input.timezone
      ? canonicalizeTimezone(input.timezone)
      : null
    const timezone =
      requested && isValidTimezone(requested)
        ? requested
        : recurrence.rule.timezone
    const limit = Math.min(input.limit, BROADCAST_RUN_GROUPS_MAX_BUCKETS)

    // One extra key says whether another page exists, so the UI never offers
    // "Load more" for an empty page.
    const fetched = await repository.listLedgerBucketKeys({
      recurrenceId: recurrence.id,
      granularity: input.granularity,
      timezone,
      limit: limit + 1,
      cursor: input.cursor,
    })
    const buckets = fetched.slice(0, limit)
    const [cells, stats, totalSlots] = await Promise.all([
      repository.listLedgerBucketCells({
        recurrenceId: recurrence.id,
        granularity: input.granularity,
        timezone,
        buckets,
      }),
      broadcastAnalyticsService.getStatsByOccurrenceBucket({
        workspaceId: input.workspaceId,
        parentBroadcastId: template.id,
        granularity: input.granularity,
        timezone,
        buckets,
      }),
      repository.countLedgerSlots({ recurrenceId: recurrence.id }),
    ])

    return {
      data: groupLedgerCells(buckets, cells, input.granularity, timezone).map(
        (group) => ({
          ...group,
          stats: stats[group.periodStart],
        }),
      ),
      nextCursor: fetched.length > limit ? (buckets.at(-1) ?? null) : null,
      totalSlots,
      totalRuns: recurrence.occurrenceCount,
      timezone,
      weekStartsOn: RECURRENCE_WEEK_STARTS_ON,
    }
  }

  /** One page of slots, newest first, each with the run it created (if any) and that run's stats. */
  async listOccurrences(input: {
    workspaceId: string
    idOrName: string
    from?: Date | null
    to?: Date | null
    cursor?: string | null
    limit: number
  }) {
    const { recurrence } = await this.findSeries(input)
    const limit = Math.min(input.limit, BROADCAST_OCCURRENCES_MAX_PER_PAGE)
    const cursor = decodeOccurrenceCursor(input.cursor)

    const rows = await repository.listLedgerRows({
      recurrenceId: recurrence.id,
      from: input.from,
      to: input.to,
      cursor,
      limit: limit + 1,
    })
    const page = rows.slice(0, limit)
    const runIds = page.flatMap((row) => (row.run ? [row.run.id] : []))
    const stats =
      runIds.length > 0
        ? await broadcastAnalyticsService.getBatchStats({
            workspaceId: input.workspaceId,
            broadcastIds: runIds,
          })
        : {}
    const now = Date.now()
    const last = page.at(-1)

    return {
      data: page.map((row) => ({
        localSlot: row.localSlot,
        occurrenceAt: row.occurrenceAt,
        outcome: broadcastOccurrenceOutcomes.parse(row.outcome),
        reason:
          row.reason === null
            ? null
            : broadcastOccurrenceReasons.parse(row.reason),
        latenessMs: Math.max(
          0,
          row.materializedAt.getTime() - row.occurrenceAt.getTime(),
        ),
        supersededCount: row.supersededCount,
        run: row.run
          ? {
              id: row.run.id,
              status: row.run.status,
              contactCount: row.run.contactCount,
              isStalled:
                row.run.status === broadcastStatuses.enum.scheduled &&
                now - row.occurrenceAt.getTime() >
                  BROADCAST_RUN_STALLED_AFTER_MS,
              stats: stats[row.run.id],
            }
          : null,
      })),
      nextCursor:
        rows.length > limit && last ? encodeOccurrenceCursor(last) : null,
    }
  }
}

// `<epoch ms>:<ledger row id>` - both numeric, because the id is compared to a bigint column.
const OCCURRENCE_CURSOR_PATTERN = /^(\d+):(\d+)$/

const encodeOccurrenceCursor = (row: {
  occurrenceAt: Date
  id: string
}): string => `${row.occurrenceAt.getTime()}:${row.id}`

const decodeOccurrenceCursor = (
  cursor: string | null | undefined,
): { occurrenceAt: Date; id: string } | null => {
  if (!cursor) {
    return null
  }
  const match = OCCURRENCE_CURSOR_PATTERN.exec(cursor)
  const occurrenceAt = new Date(Number(match?.[1]))
  if (!match || Number.isNaN(occurrenceAt.getTime())) {
    throw validationException("cursor", "Invalid cursor")
  }
  return { occurrenceAt, id: match[2] }
}

export const broadcastRecurrenceService = new BroadcastRecurrenceService()
