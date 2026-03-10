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
    timezone: string,
    granularity: "minute" | "hour" | "day",
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesByResult(
      chatbotId,
      timeRange,
      timezone,
      granularity,
    )
  }

  getMessagesWithNoResponse(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
    granularity: "minute" | "hour" | "day",
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesWithNoResponse(
      chatbotId,
      timeRange,
      timezone,
      granularity,
    )
  }

  getMessagesWithResponse(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
    granularity: "minute" | "hour" | "day",
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesWithResponse(
      chatbotId,
      timeRange,
      timezone,
      granularity,
    )
  }

  getAIProviderStats(
    chatbotId: string,
    timeRange: TimeRange,
    timezone: string,
  ): Promise<BotMessageAIProviderStats[]> {
    return botMessageStatsRepository.getAIProviderStats(
      chatbotId,
      timeRange,
      timezone,
    )
  }
}

export const botMessageAnalyticsService = new BotMessageAnalyticsService()
