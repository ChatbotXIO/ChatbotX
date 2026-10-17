import {
  botMessageStatsRepository,
  type InsertBotMessageEventRow,
} from "../repositories/postgres"
import type {
  BotMessageAIProviderStats,
  BotMessageStats,
  FilteredTimeRangeQuery,
} from "../schemas"

export class BotMessageAnalyticsService {
  recordEvents(payloads: InsertBotMessageEventRow[]): Promise<void> {
    return botMessageStatsRepository.insertEvents(payloads)
  }

  getMessagesByResult(
    props: FilteredTimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesByResult(props)
  }

  getMessagesWithNoResponse(
    props: FilteredTimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesWithNoResponse(props)
  }

  getMessagesWithResponse(
    props: FilteredTimeRangeQuery & {
      granularity: "minute" | "hour" | "day"
    },
  ): Promise<BotMessageStats[]> {
    return botMessageStatsRepository.getMessagesWithResponse(props)
  }

  getAIProviderStats(
    props: FilteredTimeRangeQuery,
  ): Promise<BotMessageAIProviderStats[]> {
    return botMessageStatsRepository.getAIProviderStats(props)
  }
}

export const botMessageAnalyticsService = new BotMessageAnalyticsService()
