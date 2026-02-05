import type {
  BotMessageAIProviderStats,
  BotMessageStats,
  TimeRange,
} from "../models"
import { BaseRepository } from "./base.repository"

export class BotMessageStatsRepository extends BaseRepository {
  private getTableAndColumn(granularity: "minute" | "hour" | "day"): {
    table: string
    timeColumn: string
  } {
    if (granularity === "minute") {
      return { table: "bot_messages_minute", timeColumn: "minute" }
    }
    if (granularity === "hour") {
      return { table: "bot_messages_hourly", timeColumn: "hour" }
    }
    return { table: "bot_messages_daily", timeColumn: "day" }
  }

  async getMessagesByResult(
    chatbotId: string,
    timeRange: TimeRange,
    granularity: "minute" | "hour" | "day",
  ): Promise<BotMessageStats[]> {
    const { table, timeColumn } = this.getTableAndColumn(granularity)

    const timeFilter = this.buildTimestampFilter(
      timeColumn,
      timeRange.from,
      timeRange.to,
    )

    const sql = `
      SELECT
        ${timeColumn} as timestamp,
        result,
        response_type,
        ai_provider,
        countMerge(event_count_state) as count
      FROM ${table}
      WHERE chatbot_id = {chatbotId:String}
        AND has_response = 1
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
      chatbotId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      chatbotId,
      timestamp: new Date(row.timestamp),
      hasResponse: true,
      responseType: row.response_type as BotMessageStats["responseType"],
      result: row.result as BotMessageStats["result"],
      aiProvider: row.ai_provider as BotMessageStats["aiProvider"],
      count: Number(row.count),
    }))
  }

  async getMessagesWithNoResponse(
    chatbotId: string,
    timeRange: TimeRange,
    granularity: "minute" | "hour" | "day",
  ): Promise<BotMessageStats[]> {
    const { table, timeColumn } = this.getTableAndColumn(granularity)

    const timeFilter = this.buildTimestampFilter(
      timeColumn,
      timeRange.from,
      timeRange.to,
    )

    const sql = `
      SELECT
        ${timeColumn} as timestamp,
        response_type,
        ai_provider,
        countMerge(event_count_state) as count
      FROM ${table}
      WHERE chatbot_id = {chatbotId:String}
        AND has_response = 0
        AND ${timeFilter.sql}
      GROUP BY ${timeColumn}, response_type, ai_provider
      ORDER BY ${timeColumn} ASC
    `

    const result = await this.query<{
      timestamp: string
      response_type: string
      ai_provider: string
      count: string
    }>(sql, {
      chatbotId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      chatbotId,
      timestamp: new Date(row.timestamp),
      hasResponse: false,
      responseType: row.response_type as BotMessageStats["responseType"],
      aiProvider: row.ai_provider as BotMessageStats["aiProvider"],
      count: Number(row.count),
    }))
  }

  async getMessagesWithResponse(
    chatbotId: string,
    timeRange: TimeRange,
    granularity: "minute" | "hour" | "day",
  ): Promise<BotMessageStats[]> {
    const { table, timeColumn } = this.getTableAndColumn(granularity)

    const timeFilter = this.buildTimestampFilter(
      timeColumn,
      timeRange.from,
      timeRange.to,
    )

    const sql = `
      SELECT
        ${timeColumn} as timestamp,
        response_type,
        result,
        ai_provider,
        countMerge(event_count_state) as count
      FROM ${table}
      WHERE chatbot_id = {chatbotId:String}
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
      chatbotId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      chatbotId,
      timestamp: new Date(row.timestamp),
      hasResponse: true,
      responseType: row.response_type as BotMessageStats["responseType"],
      result: row.result as BotMessageStats["result"],
      aiProvider: row.ai_provider as BotMessageStats["aiProvider"],
      count: Number(row.count),
    }))
  }

  async getAIProviderStats(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<BotMessageAIProviderStats[]> {
    const timeFilter = this.buildTimestampFilter(
      "day",
      timeRange.from,
      timeRange.to,
    )

    const sql = `
      SELECT
        ai_provider,
        sum(countMerge(event_count_state)) as count
      FROM bot_messages_daily
      WHERE chatbot_id = {chatbotId:String}
        AND has_response = 1
        AND response_type = 'ai_agent'
        AND ai_provider != 'none'
        AND ${timeFilter.sql}
      GROUP BY ai_provider
      ORDER BY count DESC
    `

    const result = await this.query<{
      ai_provider: string
      count: string
    }>(sql, {
      chatbotId,
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
