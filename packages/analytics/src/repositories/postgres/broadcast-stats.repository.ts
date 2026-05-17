import {
  and,
  count,
  db,
  inArray,
  isNotNull,
  or,
  sql,
} from "@chatbotx.io/database/client"
import { contactsOnBroadcastsModel } from "@chatbotx.io/database/schema"
import type {
  BroadcastBulkUpdateItem,
  BroadcastEventType,
  BroadcastFailedBulkUpdateItem,
  BroadcastStats,
} from "../../schemas/broadcast-stats"
import type { ContactEventData } from "../../schemas/common"
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
        sql`WHEN "broadcastId" = ${i.broadcastId} AND "contactInboxId" = ${i.contactInboxId} THEN ${i.occurredAt.toISOString()}::timestamptz`,
    )
    const errorCases = items.map(
      (i) =>
        sql`WHEN "broadcastId" = ${i.broadcastId} AND "contactInboxId" = ${i.contactInboxId} THEN ${i.errorContent}::text`,
    )

    await db.execute(sql`
      UPDATE "ContactOnBroadcast"
      SET "failedAt" = COALESCE("failedAt", CASE ${sql.join(failedCases, sql` `)} ELSE NULL::timestamptz END),
          "errorContent" = COALESCE("errorContent", CASE ${sql.join(errorCases, sql` `)} ELSE NULL::text END)
      WHERE ("broadcastId", "contactInboxId") IN (${sql.join(tuples, sql`, `)})
    `)
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
        sql`WHEN "broadcastId" = ${i.broadcastId} AND "contactInboxId" = ${i.contactInboxId} THEN ${i.occurredAt.toISOString()}::timestamptz`,
    )

    await db.execute(sql`
      UPDATE "ContactOnBroadcast"
      SET "clickedAt" = COALESCE("clickedAt", CASE ${sql.join(cases, sql` `)} ELSE NULL::timestamptz END)
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
    return result[input.broadcastId] ?? this.emptyStats()
  }

  async getBatchStats(input: {
    workspaceId: string
    broadcastIds: string[]
  }): Promise<Record<string, BroadcastStats>> {
    if (input.broadcastIds.length === 0) {
      return {}
    }

    const t = contactsOnBroadcastsModel

    const [deliveredRows, seenRows, clickedRows, failedRows] =
      await Promise.all([
        db
          .select({ broadcastId: t.broadcastId, count: count() })
          .from(t)
          .where(
            and(
              inArray(t.broadcastId, input.broadcastIds),
              isNotNull(t.deliveredAt),
            ),
          )
          .groupBy(t.broadcastId),
        db
          .select({ broadcastId: t.broadcastId, count: count() })
          .from(t)
          .where(
            and(
              inArray(t.broadcastId, input.broadcastIds),
              isNotNull(t.seenAt),
            ),
          )
          .groupBy(t.broadcastId),
        db
          .select({ broadcastId: t.broadcastId, count: count() })
          .from(t)
          .where(
            and(
              inArray(t.broadcastId, input.broadcastIds),
              isNotNull(t.clickedAt),
            ),
          )
          .groupBy(t.broadcastId),
        db
          .select({ broadcastId: t.broadcastId, count: count() })
          .from(t)
          .where(
            and(
              inArray(t.broadcastId, input.broadcastIds),
              isNotNull(t.failedAt),
            ),
          )
          .groupBy(t.broadcastId),
      ])

    const result: Record<string, BroadcastStats> = {}
    for (const id of input.broadcastIds) {
      result[id] = this.emptyStats()
    }

    for (const row of deliveredRows) {
      result[row.broadcastId]["message:delivered"] = row.count
    }
    for (const row of seenRows) {
      result[row.broadcastId]["message:seen"] = row.count
    }
    for (const row of clickedRows) {
      result[row.broadcastId]["flow:clicked"] = row.count
    }
    for (const row of failedRows) {
      result[row.broadcastId]["message:failed"] = row.count
    }

    for (const id of input.broadcastIds) {
      result[id]["message:sent"] =
        result[id]["message:delivered"] + result[id]["message:failed"]
    }

    return result
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

    const { eventCondition, orderColumn } = this.buildEventFilter(eventType)

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

  private buildEventFilter(eventType: BroadcastEventType) {
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
        return { eventCondition: isNotNull(t.seenAt), orderColumn: t.seenAt }
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

  private emptyStats(): BroadcastStats {
    return {
      "message:sent": 0,
      "message:delivered": 0,
      "message:seen": 0,
      "flow:clicked": 0,
      "message:failed": 0,
    }
  }
}

export const broadcastStatsRepository = new BroadcastStatsRepository()
