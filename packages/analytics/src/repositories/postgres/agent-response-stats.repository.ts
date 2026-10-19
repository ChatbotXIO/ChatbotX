import { db, sql } from "@chatbotx.io/database/client"
// Narrow subpath, NOT the `queries` barrel — see message-stats.repository.ts.
import { zonedDateKey } from "@chatbotx.io/database/queries/date-bucket"
import { analyticsAgentResponseEventModel } from "@chatbotx.io/database/schema"
import type { EventBusMessageMetadata } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { buildEventFilter } from "../../lib/event-filter"
import type {
  AgentResponseAverages,
  AgentResponseDailyAverages,
  FilteredTimeRangeQuery,
} from "../../schemas"
import { BaseRepository } from "./base.repository"
import { getEventBusEventId } from "./event-bus-idempotency"

export type InsertAgentResponseEventRow = EventBusMessageMetadata & {
  /** Stable logical id (`reply:<messageId>`); wins over the event-bus stream id. */
  eventId?: string | null
  workspaceId: string
  conversationId: string
  contactId: string
  adminId: string
  occurredAt: Date | string | number
  awaitingSince: Date | string | number
  measuredFrom: Date | string | number
  responseSeconds: number
  workingResponseSeconds?: number | null
  isFirstResponse: boolean
  workingHoursId?: string | null
  slaTargetSeconds?: number | null
  slaMet?: boolean | null
  channel?: string | null
  inboxId?: string | null
  metadata?: Record<string, unknown> | null
}

type AveragesRow = {
  adminId: string
  avgResponseSeconds: number | null
  avgWorkingResponseSeconds: number | null
  avgFirstResponseSeconds: number | null
  avgWorkingFirstResponseSeconds: number | null
  responseCount: number
  firstResponseCount: number
  responseSlaEligibleCount: number
  responseSlaMetCount: number
  firstResponseSlaEligibleCount: number
  firstResponseSlaMetCount: number
}

const toDate = (value: Date | string | number): Date =>
  value instanceof Date ? value : new Date(value)

const toNullableNumber = (value: number | string | null): number | null =>
  value === null || value === undefined ? null : Number(value)

const slaPercent = (met: number, eligible: number): number | null =>
  eligible === 0 ? null : Math.round((met / eligible) * 1000) / 10

function mapAverages(row: AveragesRow): AgentResponseAverages {
  const responseSlaEligibleCount = Number(row.responseSlaEligibleCount)
  const responseSlaMetCount = Number(row.responseSlaMetCount)
  const firstResponseSlaEligibleCount = Number(
    row.firstResponseSlaEligibleCount,
  )
  const firstResponseSlaMetCount = Number(row.firstResponseSlaMetCount)
  return {
    adminId: String(row.adminId),
    avgResponseSeconds: toNullableNumber(row.avgResponseSeconds),
    avgWorkingResponseSeconds: toNullableNumber(row.avgWorkingResponseSeconds),
    avgFirstResponseSeconds: toNullableNumber(row.avgFirstResponseSeconds),
    avgWorkingFirstResponseSeconds: toNullableNumber(
      row.avgWorkingFirstResponseSeconds,
    ),
    responseCount: Number(row.responseCount),
    firstResponseCount: Number(row.firstResponseCount),
    responseSlaEligibleCount,
    responseSlaMetCount,
    responseSlaMetPercent: slaPercent(
      responseSlaMetCount,
      responseSlaEligibleCount,
    ),
    firstResponseSlaEligibleCount,
    firstResponseSlaMetCount,
    firstResponseSlaMetPercent: slaPercent(
      firstResponseSlaMetCount,
      firstResponseSlaEligibleCount,
    ),
  }
}

/** The measures shared by both reads, scoped to one workspace. A function so `sql` is not evaluated at module scope. */
const measuresSql = (workspaceId: string) => {
  // SLA stats are only reported while the workspace's policy is switched on.
  const slaOn = sql`EXISTS (SELECT 1 FROM "ResponseSlaPolicy" WHERE "ResponseSlaPolicy"."workspaceId" = ${workspaceId} AND "ResponseSlaPolicy"."enabled")`
  return sql`
  ROUND(AVG("responseSeconds"))::int AS "avgResponseSeconds",
  ROUND(AVG("workingResponseSeconds"))::int AS "avgWorkingResponseSeconds",
  ROUND(AVG("responseSeconds") FILTER (WHERE "isFirstResponse"))::int AS "avgFirstResponseSeconds",
  ROUND(AVG("workingResponseSeconds") FILTER (WHERE "isFirstResponse"))::int AS "avgWorkingFirstResponseSeconds",
  COUNT(*)::int AS "responseCount",
  COUNT(*) FILTER (WHERE "isFirstResponse")::int AS "firstResponseCount",
  COUNT(*) FILTER (WHERE "slaMet" IS NOT NULL AND ${slaOn})::int AS "responseSlaEligibleCount",
  COUNT(*) FILTER (WHERE "slaMet" AND ${slaOn})::int AS "responseSlaMetCount",
  COUNT(*) FILTER (WHERE "isFirstResponse" AND "slaMet" IS NOT NULL AND ${slaOn})::int AS "firstResponseSlaEligibleCount",
  COUNT(*) FILTER (WHERE "isFirstResponse" AND "slaMet" AND ${slaOn})::int AS "firstResponseSlaMetCount"
`
}

export class AgentResponseStatsRepository extends BaseRepository {
  async insertEvents(payloads: InsertAgentResponseEventRow[]): Promise<void> {
    if (payloads.length === 0) {
      return
    }
    const rows = payloads.map((p) => ({
      eventId: p.eventId ?? getEventBusEventId(p) ?? createId(),
      workspaceId: p.workspaceId,
      conversationId: p.conversationId,
      contactId: p.contactId,
      adminId: p.adminId,
      occurredAt: toDate(p.occurredAt),
      awaitingSince: toDate(p.awaitingSince),
      measuredFrom: toDate(p.measuredFrom),
      responseSeconds: p.responseSeconds,
      workingResponseSeconds: p.workingResponseSeconds ?? null,
      isFirstResponse: p.isFirstResponse,
      workingHoursId: p.workingHoursId ?? null,
      slaTargetSeconds: p.slaTargetSeconds ?? null,
      slaMet: p.slaMet ?? null,
      channel: p.channel ?? null,
      inboxId: p.inboxId ?? null,
      metadata: p.metadata ?? null,
    }))
    await db
      .insert(analyticsAgentResponseEventModel)
      .values(rows)
      .onConflictDoNothing()
  }

  async getAveragesByAdmin(
    props: Omit<FilteredTimeRangeQuery, "timezone">,
  ): Promise<AgentResponseAverages[]> {
    const { workspaceId, from, to } = props
    const eventFilter = buildEventFilter(props)
    const result = await db.execute(sql`
      SELECT
        "adminId",
        ${measuresSql(workspaceId)}
      FROM "AnalyticsAgentResponseEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
      GROUP BY "adminId"
      ORDER BY "adminId" ASC
    `)
    return (result.rows as AveragesRow[]).map(mapAverages)
  }

  async getDailyAveragesByAdmin(
    props: FilteredTimeRangeQuery,
  ): Promise<AgentResponseDailyAverages[]> {
    const { workspaceId, from, to, timezone } = props
    const eventFilter = buildEventFilter(props)
    const result = await db.execute(sql`
      SELECT
        "adminId",
        ${zonedDateKey(analyticsAgentResponseEventModel.occurredAt, timezone)} AS "date",
        ${measuresSql(workspaceId)}
      FROM "AnalyticsAgentResponseEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
      GROUP BY 1, 2
      ORDER BY 2 ASC, 1 ASC
    `)
    return (result.rows as (AveragesRow & { date: string })[]).map((row) => ({
      ...mapAverages(row),
      date: String(row.date),
    }))
  }
}

export const agentResponseStatsRepository = new AgentResponseStatsRepository()
