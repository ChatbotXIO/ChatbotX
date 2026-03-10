import type { ConversationHandoffStats, TimeRange } from "../models"
import { conversationStatsRepository } from "../repositories/conversation-stats.repository"

export class ConversationAnalyticsService {
  getHandoffsByDay(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
  ): Promise<ConversationHandoffStats[]> {
    return conversationStatsRepository.getHandoffsByDay(
      chatbotId,
      timeRange,
      timezone,
    )
  }
}

export const conversationAnalyticsService = new ConversationAnalyticsService()
