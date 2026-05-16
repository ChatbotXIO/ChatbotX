import {
  type InsertMessageEventRow,
  messageStatsRepository,
} from "../repositories/postgres"
import type {
  HumanAgentStats,
  MessagesByAdminStats,
  MessagesBySenderStats,
  TimeRangeQuery,
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
    props: TimeRangeQuery & { eventTypes?: MessageEventType[] },
  ): Promise<MessageStats[]> {
    return messageStatsRepository.getStatsByMinute(props)
  }

  getStatsByHour(
    props: TimeRangeQuery & { eventTypes?: MessageEventType[] },
  ): Promise<MessageStats[]> {
    return messageStatsRepository.getStatsByHour(props)
  }

  getStatsByDay(
    props: TimeRangeQuery & { eventTypes?: MessageEventType[] },
  ): Promise<MessageStats[]> {
    return messageStatsRepository.getStatsByDay(props)
  }

  getMessagesBySender(
    props: TimeRangeQuery & { granularity?: "day" | "month" },
  ): Promise<MessagesBySenderStats[]> {
    return messageStatsRepository.getMessagesBySender(props)
  }

  getMessagesByAdmin(props: TimeRangeQuery): Promise<MessagesByAdminStats[]> {
    return messageStatsRepository.getMessagesByAdmin(props)
  }

  getUniqueContactsByAdmin(
    props: TimeRangeQuery,
  ): Promise<UniqueContactsByAdminStats[]> {
    return messageStatsRepository.getUniqueContactsByAdmin(props)
  }

  getHumanAgentStats(props: TimeRangeQuery): Promise<HumanAgentStats[]> {
    return messageStatsRepository.getHumanAgentStats(props)
  }
}

export const messageAnalyticsService = new MessageAnalyticsService()
