import type { ConversationHandoffStats, TimeRange } from "../models"
import { conversationStatsRepository } from "../repositories/conversation-stats.repository"

export class ConversationAnalyticsService {
  getHandoffsByDay(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<ConversationHandoffStats[]> {
    return conversationStatsRepository.getHandoffsByDay(chatbotId, timeRange)
  }
}

export const conversationAnalyticsService = new ConversationAnalyticsService()
