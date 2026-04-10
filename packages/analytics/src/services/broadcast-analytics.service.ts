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
  }> {
    return broadcastStatsRepository.getContactsFromClickHouse(input)
  }

  buildContactsResponse(input: {
    contactIds: string[]
    errorContentMap: Map<string, string | null>
    occurredAtMap: Map<string, string>
    contactMap: Map<
      string,
      {
        id: string
        firstName: string | null
        lastName: string | null
        sourceId: string | null
        avatar: string | null
        channel: string
      }
    >
    conversationMap: Map<string, string>
    total: number
    page: number
    perPage: number
  }): ListBroadcastContactsResponse {
    return broadcastStatsRepository.buildContactsResponse(input)
  }
}

export const broadcastAnalyticsService = new BroadcastAnalyticsService()
