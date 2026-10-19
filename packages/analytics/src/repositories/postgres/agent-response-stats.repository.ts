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
}

const toDate = (value: Date | string | number): Date =>
  value instanceof Date ? value : new Date(value)

const toNullableNumber = (value: number | string | null): number | null =>
  value === null || value === undefined ? null : Number(value)

function mapAverages(row: AveragesRow): AgentResponseAverages {
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
  }
}

/** The six measures shared by both reads; parameter-free. A function so `sql` is not evaluated at module scope. */
const measuresSql = () => sql`
  ROUND(AVG("responseSeconds"))::int AS "avgResponseSeconds",
  ROUND(AVG("workingResponseSeconds"))::int AS "avgWorkingResponseSeconds",
  ROUND(AVG("responseSeconds") FILTER (WHERE "isFirstResponse"))::int AS "avgFirstResponseSeconds",
  ROUND(AVG("workingResponseSeconds") FILTER (WHERE "isFirstResponse"))::int AS "avgWorkingFirstResponseSeconds",
  COUNT(*)::int AS "responseCount",
  COUNT(*) FILTER (WHERE "isFirstResponse")::int AS "firstResponseCount"
`

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
        ${measuresSql()}
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
        ${measuresSql()}
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
