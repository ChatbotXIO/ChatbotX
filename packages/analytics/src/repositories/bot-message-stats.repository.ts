import {
  fillBotMessageStatsDaySeries,
  fillBotMessageStatsMonthSeries,
  generateDaySeries,
  getUtcDayKey,
  shouldUseMonthlyGranularity,
} from "../lib"
import type {
  BotMessageAIProviderStats,
  BotMessageResult,
  BotMessageStats,
  TimeRangeQuery,
} from "../schemas"
import { BaseRepository } from "./base.repository"

export class BotMessageStatsRepository extends BaseRepository {
  private getTableAndColumn(granularity: "minute" | "hour"): {
    table: string
    timeColumn: string
  } {
    if (granularity === "minute") {
      return { table: "bot_messages_minute", timeColumn: "minute" }
    }
    return { table: "bot_messages_hourly", timeColumn: "hour" }
  }

  private async getMessagesByResultMonth(
    props: TimeRangeQuery,
  ): Promise<BotMessageStats[]> {
    const { workspaceId } = props

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const monthGroup = this.buildMonthGroupFromHourly(props)

    const sql = `
      SELECT
        workspace_id,
        month_group as month,
        result,
        response_type,
        ai_provider,
        sum(count) as count
      FROM (
        SELECT
          workspace_id,
          ${monthGroup} as month_group,
          result,
          response_type,
          ai_provider,
          uniqExactMerge(unique_messages_state) as count
        FROM bot_messages_hourly
        WHERE workspace_id = {workspaceId:String}
          AND result != ''
          AND ${timeFilter.sql}
        GROUP BY workspace_id, month_group, result, response_type, ai_provider
      )
      GROUP BY workspace_id, month_group, result, response_type, ai_provider
      ORDER BY month ASC, result ASC
    `

    const result = await this.query<{
      workspace_id: string
      month: string
      result: string
      response_type: string
      ai_provider: string
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    const rows = result.map((row) => ({
      workspaceId: row.workspace_id,
      timestamp: new Date(row.month),
      hasResponse: true,
      responseType: row.response_type as BotMessageStats["responseType"],
      result: row.result as BotMessageStats["result"],
      aiProvider: row.ai_provider as BotMessageStats["aiProvider"],
      count: Number(row.count),
    }))

    const results: BotMessageResult[] = ["success", "fallback"]
    return fillBotMessageStatsMonthSeries({
      ...props,
      rows,
      results,
    })
  }

  async getMessagesByResult(
    props: TimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    const { granularity, workspaceId } = props
    if (granularity === "day" && shouldUseMonthlyGranularity(props)) {
      return this.getMessagesByResultMonth(props)
    }

    if (granularity === "day") {
      const timeFilter = this.buildHourlyTimestampFilter(props)
      const dayGroup = this.buildDayGroupFromHourly(props)

      const sql = `
        SELECT
          day_group as timestamp,
          result,
          response_type,
          ai_provider,
          sum(count) as count
        FROM (
          SELECT
            ${dayGroup} as day_group,
            result,
            response_type,
            ai_provider,
            uniqExactMerge(unique_messages_state) as count
          FROM bot_messages_hourly
          WHERE workspace_id = {workspaceId:String}
            AND result != ''
            AND ${timeFilter.sql}
          GROUP BY day_group, result, response_type, ai_provider
        )
        GROUP BY day_group, result, response_type, ai_provider
        ORDER BY timestamp ASC
      `

      const result = await this.query<{
        timestamp: string
        result: string
        response_type: string
        ai_provider: string
        count: string
      }>(sql, {
        workspaceId,
        ...timeFilter.params,
      })

      const rows = result.map((row) => ({
        workspaceId,
        timestamp: new Date(row.timestamp),
        hasResponse: true,
        responseType: row.response_type as BotMessageStats["responseType"],
        result: row.result as BotMessageStats["result"],
        aiProvider: row.ai_provider as BotMessageStats["aiProvider"],
        count: Number(row.count),
      }))

      const results: BotMessageResult[] = ["success", "fallback"]
      return fillBotMessageStatsDaySeries({
        ...props,
        rows,
        results,
      })
    }

    const { table, timeColumn } = this.getTableAndColumn(granularity)
    const timeFilter = this.buildTimestampFilter({
      ...props,
      field: timeColumn,
    })

    const sql = `
      SELECT
        ${timeColumn} as timestamp,
        result,
        response_type,
        ai_provider,
        uniqExactMerge(unique_messages_state) as count
      FROM ${table}
      WHERE workspace_id = {workspaceId:String}
        AND result != ''
        AND ${timeFilter.sql}
      GROUP BY ${timeColumn}, result, response_type, ai_provider
      ORDER BY ${timeColumn} ASC
    `

    const result = await this.query<{
      timestamp: string
      result: string
      response_type: string
      ai_provider: string
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      workspaceId,
      timestamp: new Date(row.timestamp),
      hasResponse: true,
      responseType: row.response_type as BotMessageStats["responseType"],
      result: row.result as BotMessageStats["result"],
      aiProvider: row.ai_provider as BotMessageStats["aiProvider"],
      count: Number(row.count),
    }))
  }

  async getMessagesWithNoResponse(
    props: TimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    const { granularity, workspaceId } = props
    if (granularity === "day") {
      const timeFilter = this.buildHourlyTimestampFilter(props)
      const dayGroup = this.buildDayGroupFromHourly(props)

      const sql = `
        SELECT
          day_group as timestamp,
          has_response,
          response_type,
          sum(count) as count
        FROM (
          SELECT
            ${dayGroup} as day_group,
            has_response,
            response_type,
            uniqExactMerge(unique_messages_state) as count
          FROM bot_messages_hourly
          WHERE workspace_id = {workspaceId:String}
            AND has_response = 0
            AND ${timeFilter.sql}
          GROUP BY day_group, has_response, response_type
        )
        GROUP BY day_group, has_response, response_type
        ORDER BY timestamp ASC
      `

      const result = await this.query<{
        timestamp: string
        has_response: number
        response_type: string
        count: string
      }>(sql, {
        workspaceId,
        ...timeFilter.params,
      })

      return result.map((row) => ({
        workspaceId,
        timestamp: new Date(row.timestamp),
        hasResponse: row.has_response === 1,
        responseType: row.response_type as BotMessageStats["responseType"],
        aiProvider: "none" as const,
        count: Number(row.count),
      }))
    }

    const { table, timeColumn } = this.getTableAndColumn(granularity)
    const timeFilter = this.buildTimestampFilter({
      ...props,
      field: timeColumn,
    })

    const sql = `
      SELECT
        ${timeColumn} as timestamp,
        has_response,
        response_type,
        uniqExactMerge(unique_messages_state) as count
      FROM ${table}
      WHERE workspace_id = {workspaceId:String}
        AND has_response = 0
        AND ${timeFilter.sql}
      GROUP BY ${timeColumn}, has_response, response_type
      ORDER BY ${timeColumn} ASC
    `

    const result = await this.query<{
      timestamp: string
      has_response: number
      response_type: string
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      workspaceId,
      timestamp: new Date(row.timestamp),
      hasResponse: row.has_response === 1,
      responseType: row.response_type as BotMessageStats["responseType"],
      aiProvider: "none" as const,
      count: Number(row.count),
    }))
  }

  async getMessagesWithResponse(
    props: TimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    const { granularity, workspaceId } = props
    if (granularity === "day") {
      const timeFilter = this.buildHourlyTimestampFilter(props)
      const dayGroup = this.buildDayGroupFromHourly(props)

      const sql = `
        SELECT
          day_group as timestamp,
          response_type,
          result,
          ai_provider,
          sum(count) as count
        FROM (
          SELECT
            ${dayGroup} as day_group,
            response_type,
            result,
            ai_provider,
            uniqExactMerge(unique_messages_state) as count
          FROM bot_messages_hourly
          WHERE workspace_id = {workspaceId:String}
            AND has_response = 1
            AND ${timeFilter.sql}
          GROUP BY day_group, response_type, result, ai_provider
        )
        GROUP BY day_group, response_type, result, ai_provider
        ORDER BY timestamp ASC
      `

      const result = await this.query<{
        timestamp: string
        response_type: string
        result: string
        ai_provider: string
        count: string
      }>(sql, {
        workspaceId,
        ...timeFilter.params,
      })

      const rows = result.map((row) => ({
        workspaceId,
        timestamp: new Date(row.timestamp),
        hasResponse: true,
        responseType: row.response_type as BotMessageStats["responseType"],
        result: row.result as BotMessageStats["result"],
        aiProvider: row.ai_provider as BotMessageStats["aiProvider"],
        count: Number(row.count),
      }))

      const byDay = new Map<string, BotMessageStats[]>()
      for (const r of rows) {
        const dayKey = getUtcDayKey(r.timestamp)
        if (!byDay.has(dayKey)) {
          byDay.set(dayKey, [])
        }
        const dayRows = byDay.get(dayKey)
        if (dayRows) {
          dayRows.push(r)
        }
      }

      const filled: BotMessageStats[] = []
      const daySeries = generateDaySeries(props.from, props.to)
      for (const d of daySeries) {
        const dayKey = getUtcDayKey(d)
        const dayRows = byDay.get(dayKey)
        if (dayRows && dayRows.length > 0) {
          filled.push(...dayRows)
        }
      }

      return filled
    }

    const { table, timeColumn } = this.getTableAndColumn(granularity)
    const timeFilter = this.buildTimestampFilter({
      ...props,
      field: timeColumn,
    })

    const sql = `
      SELECT
        ${timeColumn} as timestamp,
        response_type,
        result,
        ai_provider,
        uniqExactMerge(unique_messages_state) as count
      FROM ${table}
      WHERE workspace_id = {workspaceId:String}
        AND has_response = 1
        AND ${timeFilter.sql}
      GROUP BY ${timeColumn}, response_type, result, ai_provider
      ORDER BY ${timeColumn} ASC
    `

    const result = await this.query<{
      timestamp: string
      response_type: string
      result: string
      ai_provider: string
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      workspaceId,
      timestamp: new Date(row.timestamp),
      hasResponse: true,
      responseType: row.response_type as BotMessageStats["responseType"],
      result: row.result as BotMessageStats["result"],
      aiProvider: row.ai_provider as BotMessageStats["aiProvider"],
      count: Number(row.count),
    }))
  }

  async getAIProviderStats(
    props: TimeRangeQuery,
  ): Promise<BotMessageAIProviderStats[]> {
    const { workspaceId } = props
    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        ai_provider,
        sum(count) as count
      FROM (
        SELECT
          ai_provider,
          uniqExactMerge(unique_messages_state) as count
        FROM bot_messages_hourly
        WHERE workspace_id = {workspaceId:String}
          AND has_response = 1
          AND response_type = 'ai_agent'
          AND ai_provider != 'none'
          AND ${timeFilter.sql}
        GROUP BY ai_provider
      )
      GROUP BY ai_provider
      ORDER BY count DESC
    `

    const result = await this.query<{
      ai_provider: string
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    const total = result.reduce((sum, row) => sum + Number(row.count), 0)

    return result.map((row) => ({
      aiProvider: row.ai_provider as BotMessageAIProviderStats["aiProvider"],
      count: Number(row.count),
      percentage: total > 0 ? (Number(row.count) / total) * 100 : 0,
    }))
  }
}

export const botMessageStatsRepository = new BotMessageStatsRepository()
