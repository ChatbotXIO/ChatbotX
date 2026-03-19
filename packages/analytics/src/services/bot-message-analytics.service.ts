import { botMessageStatsRepository } from "../repositories/bot-message-stats.repository"
import type {
  BotMessageAIProviderStats,
  BotMessageStats,
  TimeRangeQuery,
} from "../schemas"

export class BotMessageAnalyticsService {
  getMessagesByResult(
    props: TimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesByResult(props)
  }

  getMessagesWithNoResponse(
    props: TimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesWithNoResponse(props)
  }

  getMessagesWithResponse(
    props: TimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesWithResponse(props)
  }

  getAIProviderStats(
    props: TimeRangeQuery,
  ): Promise<BotMessageAIProviderStats[]> {
    return botMessageStatsRepository.getAIProviderStats(props)
  }
}

export const botMessageAnalyticsService = new BotMessageAnalyticsService()
