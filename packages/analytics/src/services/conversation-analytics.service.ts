import { conversationStatsRepository } from "../repositories/clickhouse/conversation-stats.repository"
import type {
  ConversationArchivedStats,
  ConversationAssignedByAdminStats,
  ConversationAssignedStats,
  ConversationFollowUpStats,
  ConversationHandoffStats,
  TimeRangeQuery,
  UniqueConversationsByAdminStats,
} from "../schemas"

export class ConversationAnalyticsService {
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
