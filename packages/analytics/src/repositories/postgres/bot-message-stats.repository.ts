import { db, sql } from "@chatbotx.io/database/client"
import { analyticsBotMessageEventModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../lib/logger"
import {
  fillBotMessageStatsDaySeries,
  fillBotMessageStatsMonthSeries,
  getUtcDayKey,
  iterateTzDays,
  shouldUseCagg,
  shouldUseMonthlyGranularity,
} from "../../lib/time-series"
import type {
  BotMessageAIProviderStats,
  BotMessageResult,
  BotMessageStats,
  TimeRangeQuery,
} from "../../schemas"
import { BaseRepository } from "./base.repository"

export type InsertBotMessageEventRow = {
  workspaceId: string
  messageId: string
  conversationId: string
  occurredAt: Date | string | number
  hasResponse: boolean
  responseType?: string | null
  routeType?: string | null
  result?: string | null
  aiProvider?: string | null
  channel?: string | null
  source?: string | null
  metadata?: Record<string, unknown> | null
}

export class BotMessageStatsRepository extends BaseRepository {
  async insertEvents(payloads: InsertBotMessageEventRow[]): Promise<void> {
    if (payloads.length === 0) {
      return
    }
    const validPayloads = payloads.filter((p) => {
      if (!(p.messageId && p.workspaceId && p.conversationId)) {
        logger.warn(
          {
            messageId: p.messageId,
            workspaceId: p.workspaceId,
            conversationId: p.conversationId,
            hasResponse: p.hasResponse,
            responseType: p.responseType,
          },
          "[bot-message-stats] dropping invalid event row",
        )
        return false
      }
      return true
    })
    if (validPayloads.length === 0) {
      return
    }
    const rows = validPayloads.map((p) => ({
      eventId: createId(),
      workspaceId: p.workspaceId,
      messageId: p.messageId,
      conversationId: p.conversationId,
      occurredAt:
        p.occurredAt instanceof Date
          ? p.occurredAt
          : new Date(p.occurredAt as string),
      hasResponse: p.hasResponse,
      responseType: p.responseType ?? null,
      routeType: p.routeType ?? null,
      result: p.result ?? null,
      aiProvider: p.aiProvider ?? null,
      channel: p.channel ?? null,
      source: p.source ?? null,
      metadata: p.metadata ?? null,
    }))
    try {
      await db
        .insert(analyticsBotMessageEventModel)
        .values(rows)
        .onConflictDoNothing()
    } catch (error) {
      logger.error(
        {
          error,
          rowCount: rows.length,
        },
        "[bot-message-stats] insertEvents failed",
      )
    }
  }

  async getMessagesByResult(
    props: TimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    const { granularity, workspaceId, from, to, timezone } = props

    if (granularity === "day" && shouldUseMonthlyGranularity(props)) {
      const result = await db.execute(sql`
        SELECT
          time_bucket('1 month', "occurredAt" AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
          "result",
          "responseType",
          "aiProvider",
          COUNT(*)::int AS count
        FROM "AnalyticsBotMessageEvent"
        WHERE "workspaceId" = ${workspaceId}
          AND "occurredAt" >= ${from}
          AND "occurredAt" <= ${to}
          AND "result" IS NOT NULL
        GROUP BY 1, 2, 3, 4
        ORDER BY 1 ASC
      `)

      const rows = mapBotMessageRows(
        workspaceId,
        result.rows as RawBotMessageRow[],
      )
      const results: BotMessageResult[] = ["success", "fallback"]
      return fillBotMessageStatsMonthSeries({ ...props, rows, results })
    }

    if (granularity === "day") {
      const query = shouldUseCagg(props)
        ? sql`
            SELECT
              time_bucket('1 day', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
              "result",
              "responseType",
              "aiProvider",
              SUM(count)::int AS count
            FROM analytics_bot_message_events_hourly
            WHERE "workspaceId" = ${workspaceId}
              AND bucket >= ${from}
              AND bucket <= ${to}
              AND "result" IS NOT NULL
            GROUP BY 1, 2, 3, 4
            ORDER BY 1 ASC
          `
        : sql`
            SELECT
              time_bucket('1 day', "occurredAt" AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
              "result",
              "responseType",
              "aiProvider",
              COUNT(*)::int AS count
            FROM "AnalyticsBotMessageEvent"
            WHERE "workspaceId" = ${workspaceId}
              AND "occurredAt" >= ${from}
              AND "occurredAt" <= ${to}
              AND "result" IS NOT NULL
            GROUP BY 1, 2, 3, 4
            ORDER BY 1 ASC
          `

      const result = await db.execute(query)
      const rows = mapBotMessageRows(
        workspaceId,
        result.rows as RawBotMessageRow[],
      )
      const results: BotMessageResult[] = ["success", "fallback"]
      return fillBotMessageStatsDaySeries({ ...props, rows, results })
    }

    if (granularity === "hour") {
      const result = await db.execute(sql`
        SELECT
          time_bucket('1 hour', bucket) AS bucket,
          "result",
          "responseType",
          "aiProvider",
          SUM(count)::int AS count
        FROM analytics_bot_message_events_hourly
        WHERE "workspaceId" = ${workspaceId}
          AND bucket >= ${from}
          AND bucket <= ${to}
          AND "result" IS NOT NULL
        GROUP BY 1, 2, 3, 4
        ORDER BY 1 ASC
      `)

      return mapBotMessageRows(workspaceId, result.rows as RawBotMessageRow[])
    }

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 minute', "occurredAt") AS bucket,
        "result",
        "responseType",
        "aiProvider",
        COUNT(*)::int AS count
      FROM "AnalyticsBotMessageEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "result" IS NOT NULL
      GROUP BY 1, 2, 3, 4
      ORDER BY 1 ASC
    `)

    return mapBotMessageRows(workspaceId, result.rows as RawBotMessageRow[])
  }

  async getMessagesWithNoResponse(
    props: TimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    const { granularity, workspaceId, from, to, timezone } = props

    if (granularity === "day") {
      const query = shouldUseCagg(props)
        ? sql`
            SELECT
              time_bucket('1 day', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
              "hasResponse",
              "responseType",
              SUM(count)::int AS count
            FROM analytics_bot_message_events_hourly
            WHERE "workspaceId" = ${workspaceId}
              AND bucket >= ${from}
              AND bucket <= ${to}
              AND "hasResponse" = false
            GROUP BY 1, 2, 3
            ORDER BY 1 ASC
          `
        : sql`
            SELECT
              time_bucket('1 day', "occurredAt" AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
              "hasResponse",
              "responseType",
              COUNT(*)::int AS count
            FROM "AnalyticsBotMessageEvent"
            WHERE "workspaceId" = ${workspaceId}
              AND "occurredAt" >= ${from}
              AND "occurredAt" <= ${to}
              AND "hasResponse" = false
            GROUP BY 1, 2, 3
            ORDER BY 1 ASC
          `

      const result = await db.execute(query)

      return (
        result.rows as {
          bucket: Date
          hasResponse: boolean
          responseType: string
          count: number
        }[]
      ).map((row) => ({
        workspaceId,
        timestamp: row.bucket,
        hasResponse: row.hasResponse,
        responseType: row.responseType as BotMessageStats["responseType"],
        aiProvider: "none" as const,
        count: Number(row.count),
      }))
    }

    if (granularity === "hour") {
      const result = await db.execute(sql`
        SELECT
          time_bucket('1 hour', bucket) AS bucket,
          "hasResponse",
          "responseType",
          SUM(count)::int AS count
        FROM analytics_bot_message_events_hourly
        WHERE "workspaceId" = ${workspaceId}
          AND bucket >= ${from}
          AND bucket <= ${to}
          AND "hasResponse" = false
        GROUP BY 1, 2, 3
        ORDER BY 1 ASC
      `)

      return (
        result.rows as {
          bucket: Date
          hasResponse: boolean
          responseType: string
          count: number
        }[]
      ).map((row) => ({
        workspaceId,
        timestamp: row.bucket,
        hasResponse: row.hasResponse,
        responseType: row.responseType as BotMessageStats["responseType"],
        aiProvider: "none" as const,
        count: Number(row.count),
      }))
    }

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 minute', "occurredAt") AS bucket,
        "hasResponse",
        "responseType",
        COUNT(*)::int AS count
      FROM "AnalyticsBotMessageEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "hasResponse" = false
      GROUP BY 1, 2, 3
      ORDER BY 1 ASC
    `)

    return (
      result.rows as {
        bucket: Date
        hasResponse: boolean
        responseType: string
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket,
      hasResponse: row.hasResponse,
      responseType: row.responseType as BotMessageStats["responseType"],
      aiProvider: "none" as const,
      count: Number(row.count),
    }))
  }

  async getMessagesWithResponse(
    props: TimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    const { granularity, workspaceId, from, to, timezone } = props

    if (granularity === "day") {
      const query = shouldUseCagg(props)
        ? sql`
            SELECT
              time_bucket('1 day', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
              "responseType",
              "result",
              "aiProvider",
              SUM(count)::int AS count
            FROM analytics_bot_message_events_hourly
            WHERE "workspaceId" = ${workspaceId}
              AND bucket >= ${from}
              AND bucket <= ${to}
              AND "hasResponse" = true
            GROUP BY 1, 2, 3, 4
            ORDER BY 1 ASC
          `
        : sql`
            SELECT
              time_bucket('1 day', "occurredAt" AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
              "responseType",
              "result",
              "aiProvider",
              COUNT(*)::int AS count
            FROM "AnalyticsBotMessageEvent"
            WHERE "workspaceId" = ${workspaceId}
              AND "occurredAt" >= ${from}
              AND "occurredAt" <= ${to}
              AND "hasResponse" = true
            GROUP BY 1, 2, 3, 4
            ORDER BY 1 ASC
          `

      const result = await db.execute(query)
      const rows = mapBotMessageRows(
        workspaceId,
        result.rows as RawBotMessageRow[],
        true,
      )

      const byDay = new Map<string, BotMessageStats[]>()
      for (const r of rows) {
        const key = getUtcDayKey(r.timestamp)
        const existing = byDay.get(key)
        if (existing) {
          existing.push(r)
        } else {
          byDay.set(key, [r])
        }
      }

      const filled: BotMessageStats[] = []
      for (const { key } of iterateTzDays(from, to, timezone)) {
        const dayRows = byDay.get(key)
        if (dayRows) {
          filled.push(...dayRows)
        }
      }
      return filled
    }

    if (granularity === "hour") {
      const result = await db.execute(sql`
        SELECT
          time_bucket('1 hour', bucket) AS bucket,
          "responseType",
          "result",
          "aiProvider",
          SUM(count)::int AS count
        FROM analytics_bot_message_events_hourly
        WHERE "workspaceId" = ${workspaceId}
          AND bucket >= ${from}
          AND bucket <= ${to}
          AND "hasResponse" = true
        GROUP BY 1, 2, 3, 4
        ORDER BY 1 ASC
      `)

      return mapBotMessageRows(
        workspaceId,
        result.rows as RawBotMessageRow[],
        true,
      )
    }

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 minute', "occurredAt") AS bucket,
        "responseType",
        "result",
        "aiProvider",
        COUNT(*)::int AS count
      FROM "AnalyticsBotMessageEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "hasResponse" = true
      GROUP BY 1, 2, 3, 4
      ORDER BY 1 ASC
    `)

    return mapBotMessageRows(
      workspaceId,
      result.rows as RawBotMessageRow[],
      true,
    )
  }

  async getAIProviderStats(
    props: TimeRangeQuery,
  ): Promise<BotMessageAIProviderStats[]> {
    const { workspaceId, from, to } = props

    const query = shouldUseCagg(props)
      ? sql`
          SELECT
            "aiProvider",
            SUM(count)::int AS count
          FROM analytics_bot_message_events_hourly
          WHERE "workspaceId" = ${workspaceId}
            AND bucket >= ${from}
            AND bucket <= ${to}
            AND "hasResponse" = true
            AND "responseType" = 'ai_agent'
            AND "aiProvider" IS NOT NULL
            AND "aiProvider" != 'none'
          GROUP BY "aiProvider"
          ORDER BY count DESC
        `
      : sql`
          SELECT
            "aiProvider",
            COUNT(*)::int AS count
          FROM "AnalyticsBotMessageEvent"
          WHERE "workspaceId" = ${workspaceId}
            AND "occurredAt" >= ${from}
            AND "occurredAt" <= ${to}
            AND "hasResponse" = true
            AND "responseType" = 'ai_agent'
            AND "aiProvider" IS NOT NULL
            AND "aiProvider" != 'none'
          GROUP BY "aiProvider"
          ORDER BY count DESC
        `

    const result = await db.execute(query)
    const rows = result.rows as { aiProvider: string; count: number }[]
    const total = rows.reduce((sum, row) => sum + Number(row.count), 0)

    return rows.map((row) => ({
      aiProvider: row.aiProvider as BotMessageAIProviderStats["aiProvider"],
      count: Number(row.count),
      percentage: total > 0 ? (Number(row.count) / total) * 100 : 0,
    }))
  }
}

type RawBotMessageRow = {
  bucket: Date
  result?: string
  responseType?: string
  aiProvider?: string
  count: number
}

function mapBotMessageRows(
  workspaceId: string,
  rows: RawBotMessageRow[],
  hasResponse = true,
): BotMessageStats[] {
  return rows.map((row) => ({
    workspaceId,
    timestamp: row.bucket,
    hasResponse,
    responseType: (row.responseType ??
      "none") as BotMessageStats["responseType"],
    result: (row.result ?? undefined) as BotMessageStats["result"],
    aiProvider: row.aiProvider ?? "none",
    count: Number(row.count),
  }))
}

export const botMessageStatsRepository = new BotMessageStatsRepository()
