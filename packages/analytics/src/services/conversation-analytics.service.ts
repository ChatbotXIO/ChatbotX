import { conversationStatsRepository } from "../repositories/conversation-stats.repository"
import type { ConversationHandoffStats, TimeRangeQuery } from "../schemas"

export class ConversationAnalyticsService {
  getHandoffsByDay(props: TimeRangeQuery): Promise<ConversationHandoffStats[]> {
    return conversationStatsRepository.getHandoffsByDay(props)
  }
}

export const conversationAnalyticsService = new ConversationAnalyticsService()
