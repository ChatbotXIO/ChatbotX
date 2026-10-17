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
  FilteredTimeRangeQuery,
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

  getHandoffsByDay(
    props: FilteredTimeRangeQuery,
  ): Promise<ConversationHandoffStats[]> {
    return conversationStatsRepository.getHandoffsByDay(props)
  }

  getFollowUpsByDay(
    props: FilteredTimeRangeQuery,
  ): Promise<ConversationFollowUpStats[]> {
    return conversationStatsRepository.getFollowUpsByDay(props)
  }

  getArchivedByDay(
    props: FilteredTimeRangeQuery,
  ): Promise<ConversationArchivedStats[]> {
    return conversationStatsRepository.getArchivedByDay(props)
  }

  getAssignedByDay(
    props: FilteredTimeRangeQuery,
  ): Promise<ConversationAssignedStats[]> {
    return conversationStatsRepository.getAssignedByDay(props)
  }

  getAssignedByAdmin(
    props: FilteredTimeRangeQuery,
  ): Promise<ConversationAssignedByAdminStats[]> {
    return conversationStatsRepository.getAssignedByAdmin(props)
  }

  getUniqueConversationsByAdmin(
    props: FilteredTimeRangeQuery,
  ): Promise<UniqueConversationsByAdminStats[]> {
    return conversationStatsRepository.getUniqueConversationsByAdmin(props)
  }
}

export const conversationAnalyticsService = new ConversationAnalyticsService()
