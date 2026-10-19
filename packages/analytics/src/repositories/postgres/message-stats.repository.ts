import { db, sql } from "@chatbotx.io/database/client"
// Narrow subpath, NOT the `queries` barrel: that barrel re-exports the
// contact-filter modules, which dereference schema tables at module scope
// and therefore crash any suite that mocks `@chatbotx.io/database/schema`
// narrowly. Analytics only needs the one timezone helper.
import { resolvedTimezone } from "@chatbotx.io/database/queries/date-bucket"
import { analyticsMessageEventModel } from "@chatbotx.io/database/schema"
import type { EventBusMessageMetadata } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { buildEventFilter } from "../../lib/event-filter"
import {
  fillDailyMessageStats,
  fillMessageStatsMonthlySeries,
  shouldUseCagg,
  shouldUseMonthlyGranularity,
} from "../../lib/time-series"
import type {
  FilteredTimeRangeQuery,
  HumanAgentStats,
  MessagesByAdminStats,
  MessagesBySenderStats,
  UniqueContactsByAdminStats,
} from "../../schemas"
import { hasAnalyticsFilter } from "../../schemas/common"
import type {
  MessageEventType,
  MessageStats,
} from "../../schemas/message-event"
import { agentResponseStatsRepository } from "./agent-response-stats.repository"
import { BaseRepository } from "./base.repository"
import { conversationStatsRepository } from "./conversation-stats.repository"
import { getEventBusEventId } from "./event-bus-idempotency"

export type InsertMessageEventRow = EventBusMessageMetadata & {
  /** Stable logical id; wins over the event-bus stream id when a send can re-run. */
  eventId?: string | null
  workspaceId: string
  contactId: string
  occurredAt: Date | string | number
  senderType?: "bot" | "human" | null
  adminId?: string | null
  channel?: string | null
  inboxId?: string | null
  source?: string | null
  sourceId?: string | null
  metadata?: Record<string, unknown> | null
}

export class MessageStatsRepository extends BaseRepository {
  async insertEvents(
    payloads: InsertMessageEventRow[],
    eventType: MessageEventType,
  ): Promise<void> {
    if (payloads.length === 0) {
      return
    }
    const rows = payloads.map((p) => ({
      eventId: p.eventId ?? getEventBusEventId(p) ?? createId(),
      workspaceId: p.workspaceId,
      contactId: p.contactId,
      eventType,
      occurredAt:
        p.occurredAt instanceof Date
          ? p.occurredAt
          : new Date(p.occurredAt as string),
      senderType: p.senderType ?? null,
      adminId: p.adminId ?? null,
      channel: p.channel ?? null,
      inboxId: p.inboxId ?? null,
      source: p.source ?? null,
      sourceId: p.sourceId ?? null,
      metadata: p.metadata ?? null,
    }))
    await db
      .insert(analyticsMessageEventModel)
      .values(rows)
      .onConflictDoNothing()
  }

  async getStatsByMinute(
    props: FilteredTimeRangeQuery & {
      eventTypes?: MessageEventType[]
    },
  ): Promise<MessageStats[]> {
    const { workspaceId, from, to, eventTypes } = props
    const eventFilter = buildEventFilter(props)

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 minute', "occurredAt") AS bucket,
        "eventType",
        COUNT(*)::int AS count,
        COUNT(DISTINCT "contactId")::int AS "uniqueContacts"
      FROM "AnalyticsMessageEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        ${eventTypeFilter}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `)

    return (
      result.rows as {
        bucket: Date
        eventType: MessageEventType
        count: number
        uniqueContacts: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket,
      eventType: row.eventType,
      count: Number(row.count),
      uniqueContacts: Number(row.uniqueContacts),
    }))
  }

  async getStatsByHour(
    props: FilteredTimeRangeQuery & {
      eventTypes?: MessageEventType[]
    },
  ): Promise<MessageStats[]> {
    const { workspaceId, from, to, eventTypes } = props
    const eventFilter = buildEventFilter(props)

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    // The hourly cagg carries no `inboxId`; a filtered read buckets the raw
    // hypertable by hour instead and keeps the same output shape.
    const query = hasAnalyticsFilter(props)
      ? sql`
          SELECT
            time_bucket('1 hour', "occurredAt") AS bucket,
            "eventType",
            COUNT(*)::int AS count
          FROM "AnalyticsMessageEvent"
          WHERE "workspaceId" = ${workspaceId}${eventFilter}
            AND "occurredAt" >= ${from}
            AND "occurredAt" <= ${to}
            ${eventTypeFilter}
          GROUP BY 1, 2
          ORDER BY 1 ASC, 2 ASC
        `
      : sql`
          SELECT
            time_bucket('1 hour', bucket) AS bucket,
            "eventType",
            SUM(count)::int AS count
          FROM analytics_message_events_hourly
          WHERE "workspaceId" = ${workspaceId}
            AND bucket >= ${from}
            AND bucket <= ${to}
            ${eventTypeFilter}
          GROUP BY 1, 2
          ORDER BY 1 ASC, 2 ASC
        `
    const result = await db.execute(query)

    return (
      result.rows as {
        bucket: Date
        eventType: MessageEventType
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket,
      eventType: row.eventType,
      count: Number(row.count),
      uniqueContacts: 0,
    }))
  }

  async getStatsByDay(
    props: FilteredTimeRangeQuery & {
      eventTypes?: MessageEventType[]
    },
  ): Promise<MessageStats[]> {
    if (shouldUseMonthlyGranularity(props)) {
      return this.getStatsByMonth(props)
    }

    const { workspaceId, from, to, timezone, eventTypes } = props

    const eventFilter = buildEventFilter(props)

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    const query = shouldUseCagg(props)
      ? sql`
          SELECT
            time_bucket('1 day', bucket AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS bucket,
            "eventType",
            SUM(count)::int AS count
          FROM analytics_message_events_hourly
          WHERE "workspaceId" = ${workspaceId}
            AND bucket >= ${from}
            AND bucket <= ${to}
            ${eventTypeFilter}
          GROUP BY 1, 2
          ORDER BY 1 ASC, 2 ASC
        `
      : sql`
          SELECT
            time_bucket('1 day', "occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS bucket,
            "eventType",
            COUNT(*)::int AS count
          FROM "AnalyticsMessageEvent"
          WHERE "workspaceId" = ${workspaceId}${eventFilter}
            AND "occurredAt" >= ${from}
            AND "occurredAt" <= ${to}
            ${eventTypeFilter}
          GROUP BY 1, 2
          ORDER BY 1 ASC, 2 ASC
        `

    const result = await db.execute(query)

    const rows = (
      result.rows as {
        bucket: Date
        eventType: MessageEventType
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket,
      eventType: row.eventType,
      count: Number(row.count),
      uniqueContacts: 0,
    }))

    if (!eventTypes || eventTypes.length === 0) {
      return rows
    }
    return fillDailyMessageStats({ ...props, rows, eventTypes })
  }

  private async getStatsByMonth(
    props: FilteredTimeRangeQuery & {
      eventTypes?: MessageEventType[]
    },
  ): Promise<MessageStats[]> {
    const { workspaceId, from, to, timezone, eventTypes } = props
    const eventFilter = buildEventFilter(props)

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    // Month granularity always > 7 days — use raw hypertable
    const result = await db.execute(sql`
      SELECT
        time_bucket('1 month', "occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS bucket,
        "eventType",
        COUNT(*)::int AS count
      FROM "AnalyticsMessageEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        ${eventTypeFilter}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `)

    const rows = (
      result.rows as {
        bucket: Date
        eventType: MessageEventType
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket,
      eventType: row.eventType,
      count: Number(row.count),
      uniqueContacts: 0,
    }))

    if (!eventTypes || eventTypes.length === 0) {
      return rows
    }
    return fillMessageStatsMonthlySeries({ ...props, rows, eventTypes })
  }

  async getMessagesBySender(
    props: FilteredTimeRangeQuery & { granularity?: "day" | "month" },
  ): Promise<MessagesBySenderStats[]> {
    const { workspaceId, from, to, timezone } = props
    const eventFilter = buildEventFilter(props)
    const useMonth =
      props.granularity === "month" || shouldUseMonthlyGranularity(props)
    const interval = useMonth ? "1 month" : "1 day"

    const query =
      useMonth || !shouldUseCagg(props)
        ? sql`
            SELECT
              time_bucket(${interval}, "occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS bucket,
              "channel",
              "senderType",
              COUNT(*)::int AS count
            FROM "AnalyticsMessageEvent"
            WHERE "workspaceId" = ${workspaceId}${eventFilter}
              AND "occurredAt" >= ${from}
              AND "occurredAt" <= ${to}
              AND "senderType" IS NOT NULL
              AND "channel" IS NOT NULL
            GROUP BY 1, 2, 3
            ORDER BY 1 ASC, 2 ASC, 3 ASC
          `
        : sql`
            SELECT
              time_bucket(${interval}, bucket AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS bucket,
              "channel",
              "senderType",
              SUM(count)::int AS count
            FROM analytics_message_events_hourly
            WHERE "workspaceId" = ${workspaceId}
              AND bucket >= ${from}
              AND bucket <= ${to}
              AND "senderType" IS NOT NULL
              AND "channel" IS NOT NULL
            GROUP BY 1, 2, 3
            ORDER BY 1 ASC, 2 ASC, 3 ASC
          `

    const result = await db.execute(query)

    return (
      result.rows as {
        bucket: Date
        channel: string
        senderType: "bot" | "human"
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket,
      channel: row.channel,
      senderType: row.senderType,
      count: Number(row.count),
    }))
  }

  fetchWorkspaceMembers(workspaceId: string) {
    return db.query.workspaceMemberModel.findMany({
      where: { workspaceId },
      with: {
        user: { columns: { id: true, name: true, email: true } },
      },
    })
  }

  private async getMessagesByAdminCounts(
    props: FilteredTimeRangeQuery,
  ): Promise<Map<string, number>> {
    const { workspaceId, from, to } = props
    const eventFilter = buildEventFilter(props)
    const statsResult = await db.execute(sql`
      SELECT
        "adminId",
        COUNT(*)::int AS count
      FROM "AnalyticsMessageEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'message_human_sent'
        AND "adminId" IS NOT NULL
      GROUP BY "adminId"
      ORDER BY count DESC
    `)

    const countByAdmin = new Map<string, number>()
    for (const row of statsResult.rows as {
      adminId: string
      count: number
    }[]) {
      countByAdmin.set(String(row.adminId), Number(row.count))
    }
    return countByAdmin
  }

  private async getUniqueContactsByAdminCounts(
    props: FilteredTimeRangeQuery,
  ): Promise<Map<string, number>> {
    const { workspaceId, from, to } = props
    const eventFilter = buildEventFilter(props)
    const statsResult = await db.execute(sql`
      SELECT
        "adminId",
        COUNT(DISTINCT "contactId")::int AS count
      FROM "AnalyticsMessageEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "senderType" = 'human'
        AND "adminId" IS NOT NULL
      GROUP BY "adminId"
      ORDER BY count DESC
    `)

    const countByAdmin = new Map<string, number>()
    for (const row of statsResult.rows as {
      adminId: string
      count: number
    }[]) {
      countByAdmin.set(String(row.adminId), Number(row.count))
    }
    return countByAdmin
  }

  async getMessagesByAdmin(
    props: FilteredTimeRangeQuery,
  ): Promise<MessagesByAdminStats[]> {
    const { workspaceId } = props
    const [countByAdmin, members] = await Promise.all([
      this.getMessagesByAdminCounts(props),
      this.fetchWorkspaceMembers(workspaceId),
    ])

    return members.map((member) => ({
      workspaceId,
      adminId: String(member.userId),
      count: countByAdmin.get(String(member.userId)) ?? 0,
      userName: member.user?.name ?? undefined,
      userEmail: member.user?.email ?? undefined,
    }))
  }

  async getUniqueContactsByAdmin(
    props: FilteredTimeRangeQuery,
  ): Promise<UniqueContactsByAdminStats[]> {
    const { workspaceId } = props
    const [countByAdmin, members] = await Promise.all([
      this.getUniqueContactsByAdminCounts(props),
      this.fetchWorkspaceMembers(workspaceId),
    ])

    return members.map((member) => ({
      workspaceId,
      toAssignee: String(member.userId),
      count: countByAdmin.get(String(member.userId)) ?? 0,
      userName: member.user?.name ?? undefined,
      userEmail: member.user?.email ?? undefined,
    }))
  }

  async getHumanAgentStats(
    props: FilteredTimeRangeQuery,
  ): Promise<HumanAgentStats[]> {
    const { workspaceId } = props

    const [
      messageCount,
      contactCount,
      assignedByAdmin,
      responseByAdmin,
      members,
    ] = await Promise.all([
      this.getMessagesByAdminCounts(props),
      this.getUniqueContactsByAdminCounts(props),
      conversationStatsRepository.getAssignedByAdmin(props),
      agentResponseStatsRepository.getAveragesByAdmin(props),
      this.fetchWorkspaceMembers(workspaceId),
    ])
    const responseStats = new Map(responseByAdmin.map((r) => [r.adminId, r]))

    const assignedCount = new Map(
      assignedByAdmin.map((s) => [s.toAssignee, s.count]),
    )

    // Rows are built from the CURRENT workspace members: an agent who has left
    // the workspace drops out, along with their response-time data. Members
    // with no response events get null averages and zero counts.
    return members.map((member) => {
      const adminId = String(member.userId)
      const response = responseStats.get(adminId)
      return {
        workspaceId,
        adminId,
        avgResponseSeconds: response?.avgResponseSeconds ?? null,
        avgWorkingResponseSeconds: response?.avgWorkingResponseSeconds ?? null,
        avgFirstResponseSeconds: response?.avgFirstResponseSeconds ?? null,
        avgWorkingFirstResponseSeconds:
          response?.avgWorkingFirstResponseSeconds ?? null,
        responseCount: response?.responseCount ?? 0,
        firstResponseCount: response?.firstResponseCount ?? 0,
        messagesSent: messageCount.get(adminId) ?? 0,
        uniqueContacts: contactCount.get(adminId) ?? 0,
        assignedConversations: assignedCount.get(adminId) ?? 0,
        userName: member.user?.name ?? undefined,
        userEmail: member.user?.email ?? undefined,
      }
    })
  }
}

export const messageStatsRepository = new MessageStatsRepository()
