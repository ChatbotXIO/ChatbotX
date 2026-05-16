import { db, sql } from "@chatbotx.io/database/client"
import { analyticsMessageEventModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  fillDailyMessageStats,
  fillMessageStatsMonthlySeries,
  shouldUseMonthlyGranularity,
} from "../../lib/time-series"
import type {
  HumanAgentStats,
  MessagesByAdminStats,
  MessagesBySenderStats,
  TimeRangeQuery,
  UniqueContactsByAdminStats,
} from "../../schemas"
import type {
  MessageEventType,
  MessageStats,
} from "../../schemas/message-event"
import { BaseRepository } from "./base.repository"
import { conversationStatsRepository } from "./conversation-stats.repository"

export type InsertMessageEventRow = {
  workspaceId: string
  contactId: string
  occurredAt: Date | string | number
  senderType?: "bot" | "human" | null
  adminId?: string | null
  channel?: string | null
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
      eventId: createId(),
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
    props: TimeRangeQuery & {
      eventTypes?: MessageEventType[]
    },
  ): Promise<MessageStats[]> {
    const { workspaceId, from, to, eventTypes } = props

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
      WHERE "workspaceId" = ${workspaceId}
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
    props: TimeRangeQuery & {
      eventTypes?: MessageEventType[]
    },
  ): Promise<MessageStats[]> {
    const { workspaceId, from, to, eventTypes } = props

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    const result = await db.execute(sql`
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
    `)

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
    props: TimeRangeQuery & {
      eventTypes?: MessageEventType[]
    },
  ): Promise<MessageStats[]> {
    if (shouldUseMonthlyGranularity(props)) {
      return this.getStatsByMonth(props)
    }

    const { workspaceId, from, to, timezone, eventTypes } = props

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 day', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
        "eventType",
        SUM(count)::int AS count
      FROM analytics_message_events_hourly
      WHERE "workspaceId" = ${workspaceId}
        AND bucket >= ${from}
        AND bucket <= ${to}
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
    return fillDailyMessageStats({ ...props, rows, eventTypes })
  }

  private async getStatsByMonth(
    props: TimeRangeQuery & {
      eventTypes?: MessageEventType[]
    },
  ): Promise<MessageStats[]> {
    const { workspaceId, from, to, timezone, eventTypes } = props

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 month', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
        "eventType",
        SUM(count)::int AS count
      FROM analytics_message_events_hourly
      WHERE "workspaceId" = ${workspaceId}
        AND bucket >= ${from}
        AND bucket <= ${to}
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
    props: TimeRangeQuery & { granularity?: "day" | "month" },
  ): Promise<MessagesBySenderStats[]> {
    const { workspaceId, from, to, timezone } = props
    const useMonth =
      props.granularity === "month" || shouldUseMonthlyGranularity(props)
    const interval = useMonth ? "1 month" : "1 day"

    const result = await db.execute(sql`
      SELECT
        time_bucket(${interval}, bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
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
    `)

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

  private fetchWorkspaceMembers(workspaceId: string) {
    return db.query.workspaceMemberModel.findMany({
      where: { workspaceId },
      with: {
        user: { columns: { id: true, name: true, email: true } },
      },
    })
  }

  private async getMessagesByAdminCounts(
    props: TimeRangeQuery,
  ): Promise<Map<string, number>> {
    const { workspaceId, from, to } = props
    const statsResult = await db.execute(sql`
      SELECT
        "adminId",
        COUNT(*)::int AS count
      FROM "AnalyticsMessageEvent"
      WHERE "workspaceId" = ${workspaceId}
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
    props: TimeRangeQuery,
  ): Promise<Map<string, number>> {
    const { workspaceId, from, to } = props
    const statsResult = await db.execute(sql`
      SELECT
        "adminId",
        COUNT(DISTINCT "contactId")::int AS count
      FROM "AnalyticsMessageEvent"
      WHERE "workspaceId" = ${workspaceId}
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
    props: TimeRangeQuery,
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
    props: TimeRangeQuery,
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

  async getHumanAgentStats(props: TimeRangeQuery): Promise<HumanAgentStats[]> {
    const { workspaceId } = props

    const [messageCount, contactCount, assignedByAdmin, members] =
      await Promise.all([
        this.getMessagesByAdminCounts(props),
        this.getUniqueContactsByAdminCounts(props),
        conversationStatsRepository.getAssignedByAdmin(props),
        this.fetchWorkspaceMembers(workspaceId),
      ])

    const assignedCount = new Map(
      assignedByAdmin.map((s) => [s.toAssignee, s.count]),
    )

    return members.map((member) => ({
      workspaceId,
      adminId: String(member.userId),
      messagesSent: messageCount.get(String(member.userId)) ?? 0,
      uniqueContacts: contactCount.get(String(member.userId)) ?? 0,
      assignedConversations: assignedCount.get(String(member.userId)) ?? 0,
      userName: member.user?.name ?? undefined,
      userEmail: member.user?.email ?? undefined,
    }))
  }
}

export const messageStatsRepository = new MessageStatsRepository()
