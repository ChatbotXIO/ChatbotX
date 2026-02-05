import type {
  BotMessageAIProviderStats,
  BotMessageStats,
  TimeRange,
} from "../models"
import { botMessageStatsRepository } from "../repositories/bot-message-stats.repository"

export class BotMessageAnalyticsService {
  getMessagesByResult(
    chatbotId: string,
    timeRange: TimeRange,
    granularity: "minute" | "hour" | "day",
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesByResult(
      chatbotId,
      timeRange,
      granularity,
    )
  }

  getMessagesWithNoResponse(
    chatbotId: string,
    timeRange: TimeRange,
    granularity: "minute" | "hour" | "day",
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesWithNoResponse(
      chatbotId,
      timeRange,
      granularity,
    )
  }

  getMessagesWithResponse(
    chatbotId: string,
    timeRange: TimeRange,
    granularity: "minute" | "hour" | "day",
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesWithResponse(
      chatbotId,
      timeRange,
      granularity,
    )
  }

  getAIProviderStats(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<BotMessageAIProviderStats[]> {
    return botMessageStatsRepository.getAIProviderStats(chatbotId, timeRange)
  }
}

export const botMessageAnalyticsService = new BotMessageAnalyticsService()
