import { roundToMoneyScale } from "@chatbotx.io/database/partials"
import { pipelineActivityRepository } from "@chatbotx.io/database/repositories"
import {
  enumerateDateKeys,
  parseAnalyticsDateRange,
} from "../ads-analytics/date-range"
import { BaseService } from "../base.service"
import { percentChange } from "../ecommerce-analytics/service"
import { workspaceService } from "../workspace/service"
import type { PipelineAccessScope } from "./access"
import { pipelineService } from "./service"

export type PipelineStatsTotals = {
  created: number
  won: number
  wonValue: number
  lost: number
  lostValue: number
}

export type PipelineStatsDay = PipelineStatsTotals & { day: string }

export type PipelineStatsActor = PipelineStatsTotals & {
  /** `automation` groups every non-user actor (flows, triggers, tokens, system). */
  actorKind: "user" | "automation"
  /** The user; null for automation, or for a user that was deleted since. */
  actorUserId: string | null
}

type PipelineStats = {
  range: { from: string; to: string; timezone: string }
  current: PipelineStatsTotals
  previous: PipelineStatsTotals
  change: Record<keyof PipelineStatsTotals, number | null>
  daily: PipelineStatsDay[]
  byActor: PipelineStatsActor[]
}

type Transition = {
  kind: string
  toStatus: string | null
  count: number
  value: number
}

const emptyTotals = (): PipelineStatsTotals => ({
  created: 0,
  won: 0,
  wonValue: 0,
  lost: 0,
  lostValue: 0,
})

/** Adds one grouped activity row to a totals bucket. */
function addTransition(totals: PipelineStatsTotals, row: Transition) {
  if (row.kind === "created") {
    totals.created += row.count
  }
  // An item created already closed is a won/lost transition too.
  if (row.toStatus === "won") {
    totals.won += row.count
    totals.wonValue = roundToMoneyScale(totals.wonValue + row.value)
  } else if (row.toStatus === "lost") {
    totals.lost += row.count
    totals.lostValue = roundToMoneyScale(totals.lostValue + row.value)
  }
}

const sumTransitions = (rows: Transition[]): PipelineStatsTotals => {
  const totals = emptyTotals()
  for (const row of rows) {
    addTransition(totals, row)
  }
  return totals
}

/**
 * Transition-based pipeline analytics, read from the append-only activity
 * table: an item that was won, reopened and lost counts once in each.
 */
export class PipelineAnalyticsService extends BaseService {
  async getStats(input: {
    workspaceId: string
    pipelineId: string
    from: string
    to: string
    timezone?: string
    scope: PipelineAccessScope
  }): Promise<PipelineStats> {
    const { workspaceId, pipelineId } = input
    await pipelineService.requireAccess({
      workspaceId,
      pipelineId,
      scope: input.scope,
      action: "view",
    })
    const workspace = await workspaceService.findById({ id: workspaceId })
    const range = parseAnalyticsDateRange({
      from: input.from,
      to: input.to,
      tz: input.timezone || workspace.timezone,
    })
    const span = range.until.getTime() - range.since.getTime()
    const previousUntil = new Date(range.since.getTime() - 1)
    const previousSince = new Date(range.since.getTime() - span - 1)

    const scoped = { workspaceId, pipelineId }
    const [dailyRows, actorRows, previousRows] = await Promise.all([
      pipelineActivityRepository.dailySeries({
        ...scoped,
        from: range.since,
        to: range.until,
        timezone: range.timezone,
      }),
      pipelineActivityRepository.totalsByActor({
        ...scoped,
        from: range.since,
        to: range.until,
      }),
      pipelineActivityRepository.totalsByActor({
        ...scoped,
        from: previousSince,
        to: previousUntil,
      }),
    ])

    const current = sumTransitions(actorRows)
    const previous = sumTransitions(previousRows)
    return {
      range: { from: range.from, to: range.to, timezone: range.timezone },
      current,
      previous,
      change: {
        created: percentChange(current.created, previous.created),
        won: percentChange(current.won, previous.won),
        wonValue: percentChange(current.wonValue, previous.wonValue),
        lost: percentChange(current.lost, previous.lost),
        lostValue: percentChange(current.lostValue, previous.lostValue),
      },
      daily: this.groupDaily(range.from, range.to, dailyRows),
      byActor: this.groupByActor(actorRows),
    }
  }

  private groupDaily(
    from: string,
    to: string,
    rows: Array<Transition & { day: string }>,
  ): PipelineStatsDay[] {
    const byDay = new Map<string, PipelineStatsTotals>(
      enumerateDateKeys(from, to).map((day) => [day, emptyTotals()]),
    )
    for (const row of rows) {
      const bucket = byDay.get(row.day)
      if (bucket) {
        addTransition(bucket, row)
      }
    }
    return [...byDay.entries()].map(([day, totals]) => ({ day, ...totals }))
  }

  private groupByActor(
    rows: Array<
      Transition & { isAutomation: boolean; actorUserId: string | null }
    >,
  ): PipelineStatsActor[] {
    const byActor = new Map<string, PipelineStatsActor>()
    for (const row of rows) {
      const actorKind = row.isAutomation ? "automation" : "user"
      // A deleted user's rows (null id) stay "user", never "automation".
      const actorUserId = row.isAutomation ? null : row.actorUserId
      const key = `${actorKind}:${actorUserId ?? ""}`
      const bucket = byActor.get(key) ?? {
        actorKind,
        actorUserId,
        ...emptyTotals(),
      }
      addTransition(bucket, row)
      byActor.set(key, bucket)
    }
    return [...byActor.values()]
  }
}

export const pipelineAnalyticsService = new PipelineAnalyticsService()
