import type { ConversationHandoffStats, TimeRange } from "../models"
import { BaseRepository } from "./base.repository"

export class ConversationStatsRepository extends BaseRepository {
  async getHandoffsByDay(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<ConversationHandoffStats[]> {
    const fromTimestamp = Math.floor(timeRange.from.getTime() / 1000)
    const toTimestamp = Math.floor(timeRange.to.getTime() / 1000)

    const sql = `
      SELECT
        chatbot_id,
        day,
        direction,
        countMerge(handoff_count_state) as count
      FROM conversation_handoffs_daily
      WHERE chatbot_id = {chatbotId:String}
        AND day >= toDate(toDateTime({from:UInt32}, 'UTC'))
        AND day <= toDate(toDateTime({to:UInt32}, 'UTC'))
      GROUP BY chatbot_id, day, direction
      ORDER BY day ASC, direction ASC
    `

    const result = await this.query<{
      chatbot_id: string
      day: string
      direction: "to_human" | "to_bot"
      count: string
    }>(sql, {
      chatbotId,
      from: fromTimestamp,
      to: toTimestamp,
    })

    return result.map((row) => ({
      chatbotId: row.chatbot_id,
      timestamp: new Date(row.day),
      direction: row.direction,
      count: Number(row.count),
    }))
  }
}

export const conversationStatsRepository = new ConversationStatsRepository()
