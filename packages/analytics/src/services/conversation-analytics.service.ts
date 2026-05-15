import {
  conversationStatsRepository,
  type InsertConversationEventRow,
} from "../repositories/postgres"
import type {
  ConversationArchivedStats,
  ConversationAssignedByAdminStats,
  ConversationAssignedStats,
  ConversationFollowUpStats,
  ConversationHandoffStats,
  TimeRangeQuery,
  UniqueConversationsByAdminStats,
} from "../schemas"
import type { ConversationEventType } from "../schemas/conversation-event"

export class ConversationAnalyticsService {
  recordEvents(
    payloads: InsertConversationEventRow[],
    eventType: ConversationEventType,
  ): Promise<void> {
    return conversationStatsRepository.insertEvents(payloads, eventType)
  }

  getHandoffsByDay(props: TimeRangeQuery): Promise<ConversationHandoffStats[]> {
    return conversationStatsRepository.getHandoffsByDay(props)
  }

  getFollowUpsByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationFollowUpStats[]> {
    return conversationStatsRepository.getFollowUpsByDay(props)
  }

  getArchivedByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationArchivedStats[]> {
    return conversationStatsRepository.getArchivedByDay(props)
  }

  getAssignedByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationAssignedStats[]> {
    return conversationStatsRepository.getAssignedByDay(props)
  }

  getAssignedByAdmin(
    props: TimeRangeQuery,
  ): Promise<ConversationAssignedByAdminStats[]> {
    return conversationStatsRepository.getAssignedByAdmin(props)
  }

  getUniqueConversationsByAdmin(
    props: TimeRangeQuery,
  ): Promise<UniqueConversationsByAdminStats[]> {
    return conversationStatsRepository.getUniqueConversationsByAdmin(props)
  }
}

export const conversationAnalyticsService = new ConversationAnalyticsService()
