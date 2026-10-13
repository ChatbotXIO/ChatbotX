import {
  and,
  count,
  db,
  eq,
  gt,
  inArray,
  isNotNull,
  notInArray,
  or,
  sql,
} from "@chatbotx.io/database/client"
import type { OccurrenceBucketGranularity } from "@chatbotx.io/database/partials"
import { zonedBucketKey } from "@chatbotx.io/database/queries/date-bucket"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@chatbotx.io/database/schema"
import type {
  BroadcastBulkUpdateItem,
  BroadcastEventType,
  BroadcastFailedBulkUpdateItem,
  BroadcastStats,
} from "../../schemas/broadcast-stats"
import type { ContactEventData } from "../../schemas/common"
import { BaseRepository } from "./base.repository"

export class BroadcastStatsRepository extends BaseRepository {
  async getUnreadBroadcastsForContactInboxes(input: {
    broadcastIds: string[]
    contactInboxIds: string[]
  }): Promise<{ broadcastId: string; contactInboxId: string }[]> {
    return await db.query.contactsOnBroadcastsModel.findMany({
      where: {
        broadcastId: { in: input.broadcastIds },
        contactInboxId: { in: input.contactInboxIds },
        isRead: false,
      },
      columns: {
        broadcastId: true,
        contactInboxId: true,
      },
    })
  }

  async updateOccurredAtBulk(
    items: { broadcastId: string; contactInboxId: string; timestamp: Date }[],
    updateField: "deliveredAt" | "seenAt",
  ): Promise<void> {
    if (items.length === 0) {
      return
    }

    const cases = items.map(
      (item) =>
        sql`WHEN "broadcastId" = ${item.broadcastId} AND "contactInboxId" = ${item.contactInboxId} THEN ${item.timestamp}`,
    )

    const tuples = items.map(
      (i) => sql`(${i.broadcastId}, ${i.contactInboxId})`,
    )

    await db.execute(sql`
      UPDATE "ContactOnBroadcast"
      SET ${sql.identifier(updateField)} = CASE ${sql.join(cases, sql` `)} ELSE ${sql.identifier(updateField)} END
      WHERE ("broadcastId", "contactInboxId") IN (${sql.join(tuples, sql`, `)})
    `)
  }

  async getUnreadBroadcastsWithWorkspace(contactInboxIds: string[]): Promise<
    {
      broadcastId: string
      contactId: string
      contactInboxId: string
      broadcast: { id: string; workspaceId: string }
    }[]
  > {
    return await db.query.contactsOnBroadcastsModel.findMany({
      where: {
        contactInboxId: { in: contactInboxIds },
        isRead: false,
      },
      with: {
        broadcast: { columns: { id: true, workspaceId: true } },
      },
      columns: { broadcastId: true, contactId: true, contactInboxId: true },
    })
  }

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
    const b = broadcastModel

    const rows = await db
      .select({ broadcastId: t.broadcastId, ...this.recipientCounts() })
      .from(t)
      .innerJoin(b, eq(t.broadcastId, b.id))
      .where(
        and(
          inArray(t.broadcastId, input.broadcastIds),
          eq(b.workspaceId, input.workspaceId),
        ),
      )
      .groupBy(t.broadcastId)

    const result: Record<string, BroadcastStats> = {}
    for (const id of input.broadcastIds) {
      result[id] = this.emptyStats()
    }
    for (const row of rows) {
      result[row.broadcastId] = this.toStats(row)
    }
    return result
  }

  /**
   * Stats per day / ISO week / month of a repeating broadcast's runs, in ONE
   * pass over the recipients: the buckets are selected by `occurrenceAt` and
   * aggregated in SQL, so no run ids travel in and an oversized bucket costs
   * the same as a small one.
   */
  async getStatsByOccurrenceBucket(input: {
    workspaceId: string
    parentBroadcastId: string
    granularity: OccurrenceBucketGranularity
    timezone: string
    buckets: string[]
  }): Promise<Record<string, BroadcastStats>> {
    const result: Record<string, BroadcastStats> = {}
    for (const bucket of input.buckets) {
      result[bucket] = this.emptyStats()
    }
    if (input.buckets.length === 0) {
      return result
    }

    const t = contactsOnBroadcastsModel
    const b = broadcastModel
    const bucket = zonedBucketKey(
      b.occurrenceAt,
      input.granularity,
      input.timezone,
    )

    const rows = await db
      .select({ bucket, ...this.recipientCounts() })
      .from(t)
      .innerJoin(b, eq(t.broadcastId, b.id))
      .where(
        and(
          eq(b.workspaceId, input.workspaceId),
          eq(b.parentBroadcastId, input.parentBroadcastId),
          inArray(bucket, input.buckets),
        ),
      )
      // Ordinal: the bucket expression carries bound parameters, and repeating
      // it would render different placeholders Postgres cannot match.
      .groupBy(sql`1`)

    for (const row of rows) {
      result[row.bucket] = this.toStats(row)
    }
    return result
  }

  private recipientCounts() {
    const t = contactsOnBroadcastsModel
    return {
      delivered: sql<number>`count(*) FILTER (WHERE ${t.deliveredAt} IS NOT NULL)::int`,
      seen: sql<number>`count(*) FILTER (WHERE ${t.seenAt} IS NOT NULL)::int`,
      clicked: sql<number>`count(*) FILTER (WHERE ${t.clickedAt} IS NOT NULL)::int`,
      failed: sql<number>`count(*) FILTER (WHERE ${t.failedAt} IS NOT NULL)::int`,
    }
  }

  private toStats(row: {
    delivered: number
    seen: number
    clicked: number
    failed: number
  }): BroadcastStats {
    return {
      "message:sent": row.delivered + row.failed,
      "message:delivered": row.delivered,
      "message:seen": row.seen,
      "flow:clicked": row.clicked,
      "message:failed": row.failed,
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
    total: number
  }> {
    const { workspaceId, broadcastId, eventType, page, perPage } = input
    const offset = (page - 1) * perPage
    const t = contactsOnBroadcastsModel
    const b = broadcastModel

    const { eventCondition, orderColumn } = this.buildEventFilter(eventType)
    const whereCondition = sql`${t.broadcastId} = ${broadcastId} AND ${b.workspaceId} = ${workspaceId} AND ${eventCondition}`

    const [rows, [totalRow]] = await Promise.all([
      db
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
        .innerJoin(b, eq(t.broadcastId, b.id))
        .where(whereCondition)
        .orderBy(sql`${orderColumn} DESC NULLS LAST`)
        .limit(perPage)
        .offset(offset),
      db
        .select({ total: count() })
        .from(t)
        .innerJoin(b, eq(t.broadcastId, b.id))
        .where(whereCondition),
    ])

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

    return { contactInboxIds, contactEventMap, total: totalRow?.total ?? 0 }
  }

  async getContactIdsPage(input: {
    broadcastId: string
    eventType: BroadcastEventType
    cursor: string | null
    limit: number
    excludeContactIds?: string[]
  }): Promise<{ id: string; contactId: string }[]> {
    const t = contactsOnBroadcastsModel
    const { eventCondition } = this.buildEventFilter(input.eventType)

    return await db
      .select({
        id: t.contactId,
        contactId: t.contactId,
      })
      .from(t)
      .where(
        and(
          eq(t.broadcastId, input.broadcastId),
          eventCondition,
          input.cursor ? gt(t.contactId, input.cursor) : undefined,
          input.excludeContactIds?.length
            ? notInArray(t.contactId, input.excludeContactIds)
            : undefined,
        ),
      )
      .orderBy(t.contactId)
      .limit(input.limit)
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
