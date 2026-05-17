import type { SequenceScheduleEventType } from "@chatbotx.io/clickhouse/schemas"
import { db, isNotNull, or, sql } from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"
import {
  flowEventTypeSchema,
  messageEventTypeSchema,
} from "@chatbotx.io/flow-config"
import type { ContactEventData } from "../../schemas/common"
import type { ClickHouseStatsRow } from "../../schemas/flow-stats"
import type {
  SequenceStepEventType,
  SequenceStepStats,
} from "../../schemas/sequence-stats"
import { BaseRepository } from "./base.repository"

export class SequenceStatsRepository extends BaseRepository {
  async getStepStats(input: {
    workspaceId: string
    sequenceId: string
    stepId: string
  }): Promise<SequenceStepStats> {
    const eventTypes = [
      ...messageEventTypeSchema.options,
      ...flowEventTypeSchema.options,
    ]
    const sql = `
      SELECT
        event_type,
        uniq(contact_inbox_id) as count
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
        case messageEventTypeSchema.enum["message:sent"]:
          stats["message:delivered"] = count
          break
        case messageEventTypeSchema.enum["message:delivered"]:
          stats["message:delivered"] = count
          break
        case messageEventTypeSchema.enum["message:seen"]:
          stats["message:seen"] = count
          break
        case flowEventTypeSchema.enum["flow:clicked"]:
          stats["flow:clicked"] = count
          break
        case messageEventTypeSchema.enum["message:failed"]:
          stats["message:failed"] = count
          break
        default:
          break
      }
    }

    stats["message:sent"] = stats["message:delivered"] + stats["message:failed"]

    return stats
  }

  async getContacts(input: {
    workspaceId: string
    sequenceId: string
    stepId: string
    eventType: SequenceStepEventType
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    const { workspaceId, sequenceId, stepId, eventType, page, perPage } = input
    const offset = (page - 1) * perPage
    const t = sequenceDispatchModel

    const { eventCondition, orderColumn } =
      this.buildSequenceEventFilter(eventType)

    const rows = await db
      .select({
        contactInboxId: t.contactInboxId,
        contactId: t.contactId,
        deliveredAt: t.deliveredAt,
        seenAt: t.seenAt,
        failedAt: t.failedAt,
        clickedAt: t.clickedAt,
        errorContent: t.errorContent,
      })
      .from(t)
      .where(
        sql`${t.workspaceId} = ${workspaceId} AND ${t.sequenceId} = ${sequenceId} AND ${t.stepId} = ${stepId} AND ${eventCondition}`,
      )
      .orderBy(sql`${orderColumn} DESC NULLS LAST`)
      .limit(perPage)
      .offset(offset)

    const contactInboxIds = rows.map((r) => r.contactInboxId)
    const contactEventMap = new Map<string, ContactEventData>()

    for (const row of rows) {
      contactEventMap.set(row.contactInboxId, {
        contactId: row.contactId,
        contactInboxId: row.contactInboxId,
        occurredAt: this.getSequenceOccurredAt(row, eventType),
        errorContent: row.errorContent ?? undefined,
      })
    }

    return { contactInboxIds, contactEventMap }
  }

  private buildSequenceEventFilter(eventType: SequenceStepEventType) {
    const t = sequenceDispatchModel
    switch (eventType) {
      case "message:sent":
        return {
          eventCondition: or(isNotNull(t.deliveredAt), isNotNull(t.failedAt)),
          orderColumn: t.deliveredAt,
        }
      case "message:delivered":
        return {
          eventCondition: isNotNull(t.deliveredAt),
          orderColumn: t.deliveredAt,
        }
      case "message:seen":
        return {
          eventCondition: isNotNull(t.seenAt),
          orderColumn: t.seenAt,
        }
      case "message:failed":
        return {
          eventCondition: isNotNull(t.failedAt),
          orderColumn: t.failedAt,
        }
      case "flow:clicked":
        return {
          eventCondition: isNotNull(t.clickedAt),
          orderColumn: t.clickedAt,
        }
      default:
        return {
          eventCondition: isNotNull(t.deliveredAt),
          orderColumn: t.deliveredAt,
        }
    }
  }

  private getSequenceOccurredAt(
    row: {
      deliveredAt: Date | null
      seenAt: Date | null
      failedAt: Date | null
      clickedAt: Date | null
    },
    eventType: SequenceStepEventType,
  ): string {
    switch (eventType) {
      case "message:sent":
        return (row.deliveredAt ?? row.failedAt ?? new Date()).toISOString()
      case "message:delivered":
        return (row.deliveredAt ?? new Date()).toISOString()
      case "message:seen":
        return (row.seenAt ?? new Date()).toISOString()
      case "message:failed":
        return (row.failedAt ?? new Date()).toISOString()
      case "flow:clicked":
        return (row.clickedAt ?? new Date()).toISOString()
      default:
        return new Date().toISOString()
    }
  }

  async insertEvents(data: SequenceScheduleEventType[]): Promise<void> {
    if (data.length === 0) {
      return
    }
    await this.insert("sequence_schedule_events", data)
  }
}

export const sequenceStatsRepository = new SequenceStatsRepository()
