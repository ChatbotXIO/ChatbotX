import { FlowEventType, MessageEventType } from "@chatbotx.io/flow-config"
import type {
  BroadcastEventType,
  BroadcastStats,
} from "../schemas/broadcast-stats"
import type { ContactEventData } from "../schemas/common"
import { BaseRepository } from "./base.repository"

type ClickHouseStatsRow = {
  event_type: string
  count: string
}

type ClickHouseContactRow = {
  contact_inbox_id: string
  contact_id: string
  content: string | null
  max_occurred_at: string
  conv_id: string
}

export class BroadcastStatsRepository extends BaseRepository {
  async getStats(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<BroadcastStats> {
    const eventTypes = [
      ...Object.values(MessageEventType),
      ...Object.values(FlowEventType),
    ]
    const sql = `
      SELECT
        event_type,
        uniq(contact_inbox_id) as count
      FROM broadcast_events
      WHERE workspace_id = {workspaceId:String}
        AND broadcast_id = {broadcastId:String}
        AND batch_id = 1
        AND event_type IN (${eventTypes.map((t) => `'${t}'`).join(", ")})
      GROUP BY event_type
    `

    const rows = await this.query<ClickHouseStatsRow>(sql, {
      workspaceId: input.workspaceId,
      broadcastId: input.broadcastId,
    })

    const stats: BroadcastStats = {
      "message:sent": 0,
      "message:delivered": 0,
      "message:seen": 0,
      "flow:clicked": 0,
      "message:failed": 0,
    }

    for (const row of rows) {
      const count = Number.parseInt(row.count, 10)
      switch (row.event_type) {
        case MessageEventType["message:sent"]:
          stats["message:delivered"] = count
          break
        case MessageEventType["message:delivered"]:
          stats["message:delivered"] = count
          break
        case MessageEventType["message:seen"]:
          stats["message:seen"] = count
          break
        case FlowEventType["flow:clicked"]:
          stats["flow:clicked"] = count
          break
        case MessageEventType["message:failed"]:
          stats["message:failed"] = count
          break
        default:
          break
      }
    }

    stats["message:sent"] = stats["message:delivered"] + stats["message:failed"]

    return stats
  }

  async getContactsFromClickHouse(input: {
    workspaceId: string
    broadcastId: string
    eventType: BroadcastEventType
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    const { workspaceId, broadcastId, eventType, page, perPage } = input
    const offset = (page - 1) * perPage

    let eventTypeFilter = [eventType]

    if (eventType === "message:sent") {
      eventTypeFilter = ["message:delivered", "message:failed"]
    }

    const contactRows = await this.query<ClickHouseContactRow>(
      `
        SELECT
          contact_inbox_id,
          contact_id,
          argMax(content, occurred_at) as content,
          max(occurred_at) as max_occurred_at,
          argMax(conv_id, occurred_at) as conv_id
        FROM broadcast_events
        WHERE workspace_id = {workspaceId:String}
          AND broadcast_id = {broadcastId:String}
          AND batch_id = 1
          AND event_type in {eventTypeFilter:Array(String)}
        GROUP BY contact_inbox_id, contact_id
        ORDER BY max_occurred_at DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `,
      {
        workspaceId,
        broadcastId,
        eventTypeFilter,
        limit: perPage,
        offset,
      },
    )

    const contactInboxIds = contactRows.map((row) => row.contact_inbox_id)
    const contactEventMap = new Map<string, ContactEventData>()

    for (const row of contactRows) {
      let errorContent: string | null | undefined
      if (row.content) {
        try {
          const parsed = JSON.parse(row.content)
          if (parsed.error) {
            errorContent =
              typeof parsed.error === "string"
                ? parsed.error
                : (parsed.error.message ?? JSON.stringify(parsed.error))
          }
        } catch {
          errorContent = null
        }
      }

      contactEventMap.set(row.contact_inbox_id, {
        contactId: row.contact_id,
        occurredAt: row.max_occurred_at,
        conversationId: row.conv_id ?? undefined,
        errorContent,
      })
    }

    return { contactInboxIds, contactEventMap }
  }
}

export const broadcastStatsRepository = new BroadcastStatsRepository()
