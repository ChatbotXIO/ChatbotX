import type { BroadcastStatsType } from "@chatbotx.io/clickhouse/schemas"
import { db, isNotNull, or, sql } from "@chatbotx.io/database/client"
import { contactsOnBroadcastsModel } from "@chatbotx.io/database/schema"
import {
  flowEventTypeSchema,
  messageEventTypeSchema,
} from "@chatbotx.io/flow-config"
import type {
  BroadcastBulkUpdateItem,
  BroadcastEventType,
  BroadcastFailedBulkUpdateItem,
  BroadcastStats,
} from "../schemas/broadcast-stats"
import type { ContactEventData } from "../schemas/common"
import type { ClickHouseStatsRow } from "../schemas/flow-stats"
import { BaseRepository } from "./base.repository"

export class BroadcastStatsRepository extends BaseRepository {
  async updateFailedBulk(
    items: BroadcastFailedBulkUpdateItem[],
  ): Promise<void> {
    if (items.length === 0) {
      return
    }

    const tuples = items.map(
      (i) => sql`(${i.broadcastId}, ${i.contactInboxId})`,
    )

    const failedCases = items.map(
      (i) =>
        sql`WHEN "broadcastId" = ${i.broadcastId} AND "contactInboxId" = ${i.contactInboxId} THEN ${i.occurredAt}::timestamptz`,
    )

    const errorCases = items.map(
      (i) =>
        sql`WHEN "broadcastId" = ${i.broadcastId} AND "contactInboxId" = ${i.contactInboxId} THEN ${i.errorContent}`,
    )

    await db.execute(sql`
      UPDATE "ContactOnBroadcast"
      SET "failedAt" = COALESCE("failedAt", CASE ${sql.join(failedCases, sql` `)} END),
          "errorContent" = COALESCE("errorContent", CASE ${sql.join(errorCases, sql` `)} END)
      WHERE ("broadcastId", "contactInboxId") IN (${sql.join(tuples, sql`, `)})
    `)
  }

  async insertClickhouseNodeStats(data: BroadcastStatsType[]): Promise<void> {
    if (data.length === 0) {
      return
    }
    await this.insert("broadcast_events", data)
  }

  async updateClickedBulk(items: BroadcastBulkUpdateItem[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    const tuples = items.map(
      (i) => sql`(${i.broadcastId}, ${i.contactInboxId})`,
    )
    const cases = items.map(
      (i) =>
        sql`WHEN "broadcastId" = ${i.broadcastId} AND "contactInboxId" = ${i.contactInboxId} THEN ${i.occurredAt}::timestamptz`,
    )

    await db.execute(sql`
      UPDATE "ContactOnBroadcast"
      SET "clickedAt" = COALESCE("clickedAt", CASE ${sql.join(cases, sql` `)} END)
      WHERE ("broadcastId", "contactInboxId") IN (${sql.join(tuples, sql`, `)})
    `)
  }

  async getStats(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<BroadcastStats> {
    const result = await this.getBatchStats({
      workspaceId: input.workspaceId,
      broadcastIds: [input.broadcastId],
    })
    return result[input.broadcastId] ?? this.getEmptyStats()
  }

  async getBatchStats(input: {
    workspaceId: string
    broadcastIds: string[]
  }): Promise<Record<string, BroadcastStats>> {
    if (input.broadcastIds.length === 0) {
      return {}
    }

    const eventTypes = [
      ...messageEventTypeSchema.options,
      ...flowEventTypeSchema.options,
    ]
    const broadcastIdsStr = input.broadcastIds.map((id) => `'${id}'`).join(", ")
    const sql = `
      SELECT
        broadcast_id,
        event_type,
        uniq(contact_inbox_id) as count
      FROM broadcast_events
      WHERE workspace_id = {workspaceId:String}
        AND broadcast_id IN (${broadcastIdsStr})
        AND batch_id = 1
        AND event_type IN (${eventTypes.map((t) => `'${t}'`).join(", ")})
      GROUP BY broadcast_id, event_type
    `

    const rows = await this.query<
      ClickHouseStatsRow & { broadcast_id: string }
    >(sql, { workspaceId: input.workspaceId })

    const result: Record<string, BroadcastStats> = {}

    for (const broadcastId of input.broadcastIds) {
      result[broadcastId] = this.getEmptyStats()
    }

    for (const row of rows) {
      const broadcastId = row.broadcast_id
      if (!result[broadcastId]) {
        result[broadcastId] = this.getEmptyStats()
      }

      const count = Number.parseInt(row.count, 10)
      switch (row.event_type) {
        case messageEventTypeSchema.enum["message:sent"]:
          result[broadcastId]["message:delivered"] = count
          break
        case messageEventTypeSchema.enum["message:delivered"]:
          result[broadcastId]["message:delivered"] = count
          break
        case messageEventTypeSchema.enum["message:seen"]:
          result[broadcastId]["message:seen"] = count
          break
        case flowEventTypeSchema.enum["flow:clicked"]:
          result[broadcastId]["flow:clicked"] = count
          break
        case messageEventTypeSchema.enum["message:failed"]:
          result[broadcastId]["message:failed"] = count
          break
        default:
          break
      }
    }

    for (const broadcastId of input.broadcastIds) {
      result[broadcastId]["message:sent"] =
        result[broadcastId]["message:delivered"] +
        result[broadcastId]["message:failed"]
    }

    return result
  }

  private getEmptyStats(): BroadcastStats {
    return {
      "message:sent": 0,
      "message:delivered": 0,
      "message:seen": 0,
      "flow:clicked": 0,
      "message:failed": 0,
    }
  }

  async getContacts(input: {
    workspaceId: string
    broadcastId: string
    eventType: BroadcastEventType
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    const { broadcastId, eventType, page, perPage } = input
    const offset = (page - 1) * perPage
    const t = contactsOnBroadcastsModel

    const { eventCondition, orderColumn } =
      this.buildBroadcastEventFilter(eventType)

    const rows = await db
      .select({
        contactInboxId: t.contactInboxId,
        contactId: t.contactId,
        conversationId: t.conversationId,
        deliveredAt: t.deliveredAt,
        failedAt: t.failedAt,
        seenAt: t.seenAt,
        clickedAt: t.clickedAt,
        errorContent: t.errorContent,
      })
      .from(t)
      .where(sql`${t.broadcastId} = ${broadcastId} AND ${eventCondition}`)
      .orderBy(sql`${orderColumn} DESC NULLS LAST`)
      .limit(perPage)
      .offset(offset)

    const contactInboxIds = rows.map((r) => r.contactInboxId)
    const contactEventMap = new Map<string, ContactEventData>()

    for (const row of rows) {
      contactEventMap.set(row.contactInboxId, {
        contactId: row.contactId,
        contactInboxId: row.contactInboxId,
        occurredAt: this.getBroadcastOccurredAt(row, eventType),
        conversationId: row.conversationId ?? undefined,
        errorContent: row.errorContent ?? undefined,
      })
    }

    return { contactInboxIds, contactEventMap }
  }

  private buildBroadcastEventFilter(eventType: BroadcastEventType) {
    const t = contactsOnBroadcastsModel
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

  private getBroadcastOccurredAt(
    row: {
      deliveredAt: Date | null
      failedAt: Date | null
      seenAt: Date | null
      clickedAt: Date | null
    },
    eventType: BroadcastEventType,
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
}

export const broadcastStatsRepository = new BroadcastStatsRepository()
