import { db, sql } from "@chatbotx.io/database/client"
import { analyticsConversationEventModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import type {
  ConversationArchivedStats,
  ConversationAssignedByAdminStats,
  ConversationAssignedStats,
  ConversationFollowUpStats,
  ConversationHandoffStats,
  TimeRangeQuery,
  UniqueConversationsByAdminStats,
} from "../../schemas"
import type { ConversationEventType } from "../../schemas/conversation-event"
import { BaseRepository } from "./base.repository"

export type InsertConversationEventRow = {
  workspaceId: string
  conversationId: string
  occurredAt: Date | string | number
  fromAssignee?: string | null
  toAssignee?: string | null
  channel?: string | null
  metadata?: Record<string, unknown> | null
}

export class ConversationStatsRepository extends BaseRepository {
  async insertEvents(
    payloads: InsertConversationEventRow[],
    eventType: ConversationEventType,
  ): Promise<void> {
    if (payloads.length === 0) {
      return
    }
    const rows = payloads.map((p) => ({
      eventId: createId(),
      workspaceId: p.workspaceId,
      conversationId: p.conversationId,
      eventType,
      occurredAt:
        p.occurredAt instanceof Date
          ? p.occurredAt
          : new Date(p.occurredAt as string),
      fromAssignee: p.fromAssignee ?? null,
      toAssignee: p.toAssignee ?? null,
      channel: p.channel ?? null,
      metadata: p.metadata ?? null,
    }))
    await db
      .insert(analyticsConversationEventModel)
      .values(rows)
      .onConflictDoNothing()
  }

  async getHandoffsByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationHandoffStats[]> {
    const { workspaceId, from, to, timezone } = props

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 day', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
        CASE
          WHEN "eventType" = 'conversation_transferred_to_human' THEN 'to_human'
          WHEN "eventType" = 'conversation_transferred_to_bot' THEN 'to_bot'
        END AS direction,
        SUM(count)::int AS count
      FROM analytics_conversation_events_hourly
      WHERE "workspaceId" = ${workspaceId}
        AND bucket >= ${from}
        AND bucket <= ${to}
        AND "eventType" IN ('conversation_transferred_to_human', 'conversation_transferred_to_bot')
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `)

    return (
      result.rows as {
        bucket: Date | string
        direction: "to_human" | "to_bot"
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket instanceof Date ? row.bucket : new Date(row.bucket),
      direction: row.direction,
      count: Number(row.count),
    }))
  }

  async getFollowUpsByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationFollowUpStats[]> {
    const { workspaceId, from, to, timezone } = props

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 day', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
        SUM(count)::int AS count
      FROM analytics_conversation_events_hourly
      WHERE "workspaceId" = ${workspaceId}
        AND bucket >= ${from}
        AND bucket <= ${to}
        AND "eventType" = 'conversation_followed'
      GROUP BY 1
      ORDER BY 1 ASC
    `)

    return (
      result.rows as {
        bucket: Date | string
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket instanceof Date ? row.bucket : new Date(row.bucket),
      count: Number(row.count),
    }))
  }

  async getArchivedByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationArchivedStats[]> {
    const { workspaceId, from, to, timezone } = props

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 day', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
        SUM(count)::int AS count
      FROM analytics_conversation_events_hourly
      WHERE "workspaceId" = ${workspaceId}
        AND bucket >= ${from}
        AND bucket <= ${to}
        AND "eventType" = 'conversation_archived'
      GROUP BY 1
      ORDER BY 1 ASC
    `)

    return (
      result.rows as {
        bucket: Date | string
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket instanceof Date ? row.bucket : new Date(row.bucket),
      count: Number(row.count),
    }))
  }

  async getAssignedByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationAssignedStats[]> {
    const { workspaceId, from, to, timezone } = props

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 day', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
        SUM(count)::int AS count
      FROM analytics_conversation_events_hourly
      WHERE "workspaceId" = ${workspaceId}
        AND bucket >= ${from}
        AND bucket <= ${to}
        AND "eventType" = 'conversation_assigned'
      GROUP BY 1
      ORDER BY 1 ASC
    `)

    return (
      result.rows as {
        bucket: Date | string
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket instanceof Date ? row.bucket : new Date(row.bucket),
      count: Number(row.count),
    }))
  }

  async getAssignedByAdmin(
    props: TimeRangeQuery,
  ): Promise<ConversationAssignedByAdminStats[]> {
    const { workspaceId, from, to } = props

    const [statsResult, members] = await Promise.all([
      db.execute(sql`
        SELECT
          "toAssignee",
          SUM(count)::int AS count
        FROM analytics_conversation_events_hourly
        WHERE "workspaceId" = ${workspaceId}
          AND bucket >= ${from}
          AND bucket <= ${to}
          AND "eventType" = 'conversation_assigned'
          AND "toAssignee" IS NOT NULL
        GROUP BY "toAssignee"
        ORDER BY count DESC
      `),
      db.query.workspaceMemberModel.findMany({
        where: { workspaceId },
        with: {
          user: { columns: { id: true, name: true, email: true } },
        },
      }),
    ])

    const countByAssignee = new Map<string, number>()
    for (const row of statsResult.rows as {
      toAssignee: string
      count: number
    }[]) {
      countByAssignee.set(String(row.toAssignee), Number(row.count))
    }

    return members.map((member) => ({
      workspaceId,
      toAssignee: String(member.userId),
      count: countByAssignee.get(String(member.userId)) ?? 0,
      userName: member.user?.name ?? undefined,
      userEmail: member.user?.email ?? undefined,
    }))
  }

  async getUniqueConversationsByAdmin(
    props: TimeRangeQuery,
  ): Promise<UniqueConversationsByAdminStats[]> {
    const { workspaceId, from, to } = props

    const [statsResult, members] = await Promise.all([
      db.execute(sql`
        SELECT
          "toAssignee",
          COUNT(DISTINCT "conversationId")::int AS count
        FROM "AnalyticsConversationEvent"
        WHERE "workspaceId" = ${workspaceId}
          AND "occurredAt" >= ${from}
          AND "occurredAt" <= ${to}
          AND "eventType" = 'conversation_assigned'
          AND "toAssignee" IS NOT NULL
        GROUP BY "toAssignee"
        ORDER BY count DESC
      `),
      db.query.workspaceMemberModel.findMany({
        where: { workspaceId },
        with: {
          user: { columns: { id: true, name: true, email: true } },
        },
      }),
    ])

    const countByAssignee = new Map<string, number>()
    for (const row of statsResult.rows as {
      toAssignee: string
      count: number
    }[]) {
      countByAssignee.set(String(row.toAssignee), Number(row.count))
    }

    return members.map((member) => ({
      workspaceId,
      toAssignee: String(member.userId),
      count: countByAssignee.get(String(member.userId)) ?? 0,
      userName: member.user?.name ?? undefined,
      userEmail: member.user?.email ?? undefined,
    }))
  }
}

export const conversationStatsRepository = new ConversationStatsRepository()
