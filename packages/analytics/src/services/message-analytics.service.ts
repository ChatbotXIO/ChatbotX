import {
  type InsertMessageEventRow,
  messageStatsRepository,
} from "../repositories/postgres"
import type {
  FilteredTimeRangeQuery,
  HumanAgentStats,
  MessagesByAdminStats,
  MessagesBySenderStats,
  UniqueContactsByAdminStats,
} from "../schemas"
import type { MessageEventType, MessageStats } from "../schemas/message-event"

export class MessageAnalyticsService {
  recordEvents(
    payloads: InsertMessageEventRow[],
    eventType: MessageEventType,
  ): Promise<void> {
    return messageStatsRepository.insertEvents(payloads, eventType)
  }

  getStatsByMinute(
    props: FilteredTimeRangeQuery & { eventTypes?: MessageEventType[] },
  ): Promise<MessageStats[]> {
    return messageStatsRepository.getStatsByMinute(props)
  }

  getStatsByHour(
    props: FilteredTimeRangeQuery & { eventTypes?: MessageEventType[] },
  ): Promise<MessageStats[]> {
    return messageStatsRepository.getStatsByHour(props)
  }

  getStatsByDay(
    props: FilteredTimeRangeQuery & { eventTypes?: MessageEventType[] },
  ): Promise<MessageStats[]> {
    return messageStatsRepository.getStatsByDay(props)
  }

  getMessagesBySender(
    props: FilteredTimeRangeQuery & { granularity?: "day" | "month" },
  ): Promise<MessagesBySenderStats[]> {
    return messageStatsRepository.getMessagesBySender(props)
  }

  getMessagesByAdmin(
    props: FilteredTimeRangeQuery,
  ): Promise<MessagesByAdminStats[]> {
    return messageStatsRepository.getMessagesByAdmin(props)
  }

  getUniqueContactsByAdmin(
    props: FilteredTimeRangeQuery,
  ): Promise<UniqueContactsByAdminStats[]> {
    return messageStatsRepository.getUniqueContactsByAdmin(props)
  }

  getHumanAgentStats(
    props: FilteredTimeRangeQuery,
  ): Promise<HumanAgentStats[]> {
    return messageStatsRepository.getHumanAgentStats(props)
  }
}

export const messageAnalyticsService = new MessageAnalyticsService()
