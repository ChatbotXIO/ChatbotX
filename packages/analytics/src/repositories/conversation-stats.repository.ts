import type { ConversationHandoffStats, TimeRangeQuery } from "../schemas"
import { BaseRepository } from "./base.repository"

export class ConversationStatsRepository extends BaseRepository {
  async getHandoffsByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationHandoffStats[]> {
    const { chatbotId } = props

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const dayGroup = this.buildDayGroupFromHourly(props)

    const sql = `
      SELECT
        chatbot_id,
        day_group as day,
        direction,
        sum(count) as count
      FROM (
        SELECT
          chatbot_id,
          ${dayGroup} as day_group,
          direction,
          countMerge(handoff_count_state) as count
        FROM conversation_handoffs_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND ${timeFilter.sql}
        GROUP BY chatbot_id, day_group, direction
      )
      GROUP BY chatbot_id, day_group, direction
      ORDER BY day ASC, direction ASC
    `

    const result = await this.query<{
      chatbot_id: string
      day: string
      direction: "to_human" | "to_bot"
      count: string
    }>(sql, {
      chatbotId,
      ...timeFilter.params,
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
