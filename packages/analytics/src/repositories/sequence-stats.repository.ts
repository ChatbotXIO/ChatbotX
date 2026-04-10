import { FlowEventType, MessageEventType } from "@chatbotx.io/flow-config"
import type { ContactEventData } from "../schemas/common"
import type {
  SequenceStepEventType,
  SequenceStepStats,
} from "../schemas/sequence-stats"
import { BaseRepository } from "./base.repository"

type ClickHouseStatsRow = {
  event_type: string
  count: string
}

type ClickHouseContactRow = {
  contact_id: string
  content: string | null
  max_occurred_at: string
  source_id: string
  channel: string
  conv_id: string
}

export class SequenceStatsRepository extends BaseRepository {
  async getStepStats(input: {
    workspaceId: string
    sequenceId: string
    stepId: string
  }): Promise<SequenceStepStats> {
    const eventTypes = [
      ...Object.values(MessageEventType),
      ...Object.values(FlowEventType),
    ]
    const sql = `
      SELECT
        event_type,
        uniq(contact_id) as count
      FROM sequence_schedule_events
      WHERE workspace_id = {workspaceId:String}
        AND sequence_id = {sequenceId:String}
        AND step_id = {stepId:String}
        AND event_type IN (${eventTypes.map((t) => `'${t}'`).join(", ")})
      GROUP BY event_type
    `

    const rows = await this.query<ClickHouseStatsRow>(sql, {
      workspaceId: input.workspaceId,
      sequenceId: input.sequenceId,
      stepId: input.stepId,
    })

    const stats: SequenceStepStats = {
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
    sequenceId: string
    stepId: string
    eventType: SequenceStepEventType
    page: number
    perPage: number
  }): Promise<{
    contactIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    const { workspaceId, sequenceId, stepId, eventType, page, perPage } = input
    const offset = (page - 1) * perPage

    const eventTypeFilter = [eventType]

    const contactRows = await this.query<ClickHouseContactRow>(
      `
        SELECT
          contact_id,
          argMax(content, occurred_at) as content,
          max(occurred_at) as max_occurred_at,
          argMax(source_id, occurred_at) as source_id,
          argMax(channel, occurred_at) as channel,
          argMax(conv_id, occurred_at) as conv_id
        FROM sequence_schedule_events
        WHERE workspace_id = {workspaceId:String}
          AND sequence_id = {sequenceId:String}
          AND step_id = {stepId:String}
          AND event_type in {eventTypeFilter:Array(String)}
        GROUP BY contact_id
        ORDER BY max_occurred_at DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `,
      {
        workspaceId,
        sequenceId,
        stepId,
        eventTypeFilter,
        limit: perPage,
        offset,
      },
    )

    const contactIds = contactRows.map((row) => row.contact_id)
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

      contactEventMap.set(row.contact_id, {
        occurredAt: row.max_occurred_at,
        sourceId: row.source_id ?? undefined,
        channel: row.channel ?? undefined,
        conversationId: row.conv_id ?? undefined,
        errorContent,
      })
    }

    return { contactIds, contactEventMap }
  }
}

export const sequenceStatsRepository = new SequenceStatsRepository()
