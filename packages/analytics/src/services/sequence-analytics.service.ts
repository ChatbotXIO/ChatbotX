import { sequenceStatsRepository } from "../repositories/sequence-stats.repository"
import type {
  ListSequenceStepContactsResponse,
  SequenceStepEventType,
  SequenceStepStats,
} from "../schemas/sequence-stats"

export class SequenceAnalyticsService {
  getStepStats(input: {
    workspaceId: string
    sequenceId: string
    stepId: string
  }): Promise<SequenceStepStats> {
    return sequenceStatsRepository.getStepStats(input)
  }

  getContactsFromClickHouse(input: {
    workspaceId: string
    sequenceId: string
    stepId: string
    eventType: SequenceStepEventType
    page: number
    perPage: number
  }): Promise<{
    contactIds: string[]
    errorContentMap: Map<string, string | null>
    occurredAtMap: Map<string, string>
    sourceIdMap: Map<string, string>
    channelMap: Map<string, string>
    conversationIdMap: Map<string, string>
  }> {
    return sequenceStatsRepository.getContactsFromClickHouse(input)
  }

  buildContactsResponse(input: {
    contactIds: string[]
    errorContentMap: Map<string, string | null>
    occurredAtMap: Map<string, string>
    sourceIdMap: Map<string, string>
    channelMap: Map<string, string>
    conversationIdMap: Map<string, string>
    contactMap: Map<
      string,
      {
        id: string
        firstName: string | null
        lastName: string | null
        avatar: string | null
      }
    >
    total: number
    page: number
    perPage: number
  }): ListSequenceStepContactsResponse {
    return sequenceStatsRepository.buildContactsResponse(input)
  }
}

export const sequenceAnalyticsService = new SequenceAnalyticsService()
