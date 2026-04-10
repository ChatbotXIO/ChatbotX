import type {
  ListSequenceStepContactsResponse,
  SequenceStepContactData,
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
}

export class SequenceStatsRepository extends BaseRepository {
  async getStepStats(input: {
    workspaceId: string
    sequenceId: string
    stepId: string
  }): Promise<SequenceStepStats> {
    const sql = `
      SELECT
        event_type,
        uniq(contact_id) as count
      FROM sequence_schedule_events
      WHERE chatbot_id = {workspaceId:String}
        AND sequence_id = {sequenceId:String}
        AND step_id = {stepId:String}
        AND event_type IN ('delivered', 'seen', 'clicked', 'failed')
      GROUP BY event_type
    `

    const rows = await this.query<ClickHouseStatsRow>(sql, {
      workspaceId: input.workspaceId,
      sequenceId: input.sequenceId,
      stepId: input.stepId,
    })

    const stats: SequenceStepStats = {
      sent: 0,
      delivered: 0,
      seen: 0,
      clicked: 0,
      failed: 0,
    }

    for (const row of rows) {
      const count = Number.parseInt(row.count, 10)
      switch (row.event_type) {
        case "delivered":
          stats.delivered = count
          break
        case "seen":
          stats.seen = count
          break
        case "clicked":
          stats.clicked = count
          break
        case "failed":
          stats.failed = count
          break
        default:
          break
      }
    }

    stats.sent = stats.delivered + stats.failed

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
    errorContentMap: Map<string, string | null>
    occurredAtMap: Map<string, string>
  }> {
    const { workspaceId, sequenceId, stepId, eventType, page, perPage } = input
    const offset = (page - 1) * perPage

    let eventTypeFilter: string[]
    if (eventType === "sent") {
      eventTypeFilter = ["delivered", "failed"]
    } else {
      eventTypeFilter = [eventType]
    }

    const contactRows = await this.query<ClickHouseContactRow>(
      `
        SELECT
          contact_id,
          argMax(content, occurred_at) as content,
          max(occurred_at) as max_occurred_at
        FROM sequence_schedule_events
        WHERE chatbot_id = {workspaceId:String}
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
    const errorContentMap = new Map<string, string | null>()
    const occurredAtMap = new Map<string, string>()

    for (const row of contactRows) {
      occurredAtMap.set(row.contact_id, row.max_occurred_at)
      if (row.content) {
        try {
          const parsed = JSON.parse(row.content)
          if (parsed.error) {
            const errorMsg =
              typeof parsed.error === "string"
                ? parsed.error
                : (parsed.error.message ?? JSON.stringify(parsed.error))
            errorContentMap.set(row.contact_id, errorMsg)
          }
        } catch {
          errorContentMap.set(row.contact_id, null)
        }
      }
    }

    return { contactIds, errorContentMap, occurredAtMap }
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
  }): ListSequenceStepContactsResponse {
    const {
      contactIds,
      errorContentMap,
      occurredAtMap,
      contactMap,
      conversationMap,
      total,
      page,
      perPage,
    } = input

    const pageCount = Math.ceil(total / perPage)

    const data: SequenceStepContactData[] = contactIds
      .map((contactId) => {
        const contact = contactMap.get(contactId)
        if (!contact) {
          return null
        }
        const conversationId = conversationMap.get(contact.id)
        if (!conversationId) {
          return null
        }

        return {
          contactId: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          sourceId: contact.sourceId,
          avatar: contact.avatar,
          channel: contact.channel,
          conversationId,
          errorContent: errorContentMap.get(contactId) ?? null,
          occurredAt: occurredAtMap.get(contactId) ?? null,
        }
      })
      .filter((c): c is SequenceStepContactData => c !== null)

    return {
      data,
      total,
      page,
      pageCount,
    }
  }
}

export const sequenceStatsRepository = new SequenceStatsRepository()
