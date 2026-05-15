import {
  botMessageStatsRepository,
  type InsertBotMessageEventRow,
} from "../repositories/postgres"
import type {
  BotMessageAIProviderStats,
  BotMessageStats,
  TimeRangeQuery,
} from "../schemas"

export class BotMessageAnalyticsService {
  recordEvents(payloads: InsertBotMessageEventRow[]): Promise<void> {
    return botMessageStatsRepository.insertEvents(payloads)
  }

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
