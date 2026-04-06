import { broadcastStatsRepository } from "../repositories/broadcast-stats.repository"
import type {
  BroadcastEventType,
  BroadcastStats,
  ListBroadcastContactsResponse,
} from "../schemas/broadcast-stats"

export class BroadcastAnalyticsService {
  getStats(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<BroadcastStats> {
    return broadcastStatsRepository.getStats(input)
  }

  getContactsFromClickHouse(input: {
    workspaceId: string
    broadcastId: string
    eventType: BroadcastEventType
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
    return broadcastStatsRepository.getContactsFromClickHouse(input)
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
  }): ListBroadcastContactsResponse {
    return broadcastStatsRepository.buildContactsResponse(input)
  }
}

export const broadcastAnalyticsService = new BroadcastAnalyticsService()
