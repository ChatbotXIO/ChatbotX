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
import type {
  ContactInfoType,
  OccurrenceBucketGranularity,
} from "@chatbotx.io/database/partials"
import { zonedBucketKey } from "@chatbotx.io/database/queries/date-bucket"
import { contactInfoCaptureRepository } from "@chatbotx.io/database/repositories/contact-info-capture"
import {
  broadcastModel,
  contactInfoCaptureModel,
  contactsOnBroadcastsModel,
} from "@chatbotx.io/database/schema"
import {
  type BroadcastBulkUpdateItem,
  type BroadcastEventType,
  type BroadcastFailedBulkUpdateItem,
  type BroadcastStats,
  CONTACT_INFO_CAPTURE_EVENT_INFO_TYPE,
  type ContactInfoCaptureEventType,
  isContactInfoCaptureEvent,
} from "../../schemas/broadcast-stats"
import type { ContactEventData } from "../../schemas/common"
import { BaseRepository } from "./base.repository"

const CAPTURE_EVENT_BY_INFO_TYPE = Object.fromEntries(
  Object.entries(CONTACT_INFO_CAPTURE_EVENT_INFO_TYPE).map(
    ([eventType, infoType]) => [infoType, eventType],
  ),
) as Record<ContactInfoType, ContactInfoCaptureEventType>

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

    // One extra grouped read for the whole page, not one per broadcast.
    const [rows, captureRows] = await Promise.all([
      db
        .select({ broadcastId: t.broadcastId, ...this.recipientCounts() })
        .from(t)
        .innerJoin(b, eq(t.broadcastId, b.id))
        .where(
          and(
            inArray(t.broadcastId, input.broadcastIds),
            eq(b.workspaceId, input.workspaceId),
          ),
        )
        .groupBy(t.broadcastId),
      contactInfoCaptureRepository.countBySources({
        workspaceId: input.workspaceId,
        sourceType: "broadcast",
        sourceIds: input.broadcastIds,
      }),
    ])

    const result: Record<string, BroadcastStats> = {}
    for (const id of input.broadcastIds) {
      result[id] = this.emptyStats()
    }
    for (const row of rows) {
      result[row.broadcastId] = this.toStats(row)
    }
    this.mergeCaptureCounts(
      result,
      captureRows.map((row) => ({ ...row, key: row.sourceId })),
    )
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

    const c = contactInfoCaptureModel

    const [rows, captureRows] = await Promise.all([
      db
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
        // Ordinal: the bucket expression carries bound parameters, and
        // repeating it would render different placeholders Postgres cannot
        // match.
        .groupBy(sql`1`),
      // Captures of a run belong to the run's own broadcast row, so they are
      // bucketed by that row's `occurrenceAt` like its recipients.
      db
        .select({
          bucket,
          infoType: c.infoType,
          count: sql<number>`count(*)::int`,
        })
        .from(c)
        .innerJoin(
          b,
          and(eq(c.sourceId, b.id), eq(c.workspaceId, b.workspaceId)),
        )
        .where(
          and(
            eq(c.workspaceId, input.workspaceId),
            eq(c.sourceType, "broadcast"),
            eq(b.parentBroadcastId, input.parentBroadcastId),
            inArray(bucket, input.buckets),
          ),
        )
        .groupBy(sql`1`, c.infoType),
    ])

    for (const row of rows) {
      result[row.bucket] = this.toStats(row)
    }
    this.mergeCaptureCounts(
      result,
      captureRows.map((row) => ({ ...row, key: row.bucket })),
    )
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
      "contactInfo:phoneCaptured": 0,
      "contactInfo:emailCaptured": 0,
    }
  }

  /** Writes each grouped capture count into its entry of `result`, keyed by source or bucket. */
  private mergeCaptureCounts(
    result: Record<string, BroadcastStats>,
    rows: { key: string; infoType: ContactInfoType; count: number }[],
  ): void {
    for (const row of rows) {
      const stats = result[row.key]
      if (stats) {
        result[row.key] = {
          ...stats,
          [CAPTURE_EVENT_BY_INFO_TYPE[row.infoType]]: row.count,
        }
      }
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
    if (isContactInfoCaptureEvent(eventType)) {
      return await this.getCaptureContacts({
        workspaceId,
        broadcastId,
        eventType,
        offset,
        perPage,
      })
    }
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

  /**
   * Contacts who left a phone / an email after the broadcast, newest first,
   * from `ContactInfoCapture`. The rows carry only ids and the time; the
   * caller attaches contact display fields. Rows and total only cover contact
   * inboxes that still exist (joined before paging), so the total matches the
   * pages.
   */
  private async getCaptureContacts(input: {
    workspaceId: string
    broadcastId: string
    eventType: ContactInfoCaptureEventType
    offset: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
    total: number
  }> {
    const { workspaceId, broadcastId, eventType, offset, perPage } = input
    const infoType = CONTACT_INFO_CAPTURE_EVENT_INFO_TYPE[eventType]

    const source = {
      workspaceId,
      sourceType: "broadcast",
      sourceId: broadcastId,
      infoType,
    } as const
    const [rows, total] = await Promise.all([
      contactInfoCaptureRepository.listContacts({
        ...source,
        limit: perPage,
        offset,
      }),
      contactInfoCaptureRepository.countContacts(source),
    ])

    const contactEventMap = new Map<string, ContactEventData>()
    for (const row of rows) {
      contactEventMap.set(row.contactInboxId, {
        contactId: row.contactId,
        contactInboxId: row.contactInboxId,
        occurredAt: row.createdAt.toISOString(),
        conversationId: row.conversationId,
      })
    }

    return {
      contactInboxIds: rows.map((row) => row.contactInboxId),
      contactEventMap,
      total,
    }
  }

  async getContactIdsPage(input: {
    workspaceId: string
    broadcastId: string
    eventType: BroadcastEventType
    cursor: string | null
    limit: number
    excludeContactIds?: string[]
  }): Promise<{ id: string; contactId: string }[]> {
    if (isContactInfoCaptureEvent(input.eventType)) {
      const contactIds = await contactInfoCaptureRepository.listContactIds({
        workspaceId: input.workspaceId,
        sourceType: "broadcast",
        sourceId: input.broadcastId,
        infoType: CONTACT_INFO_CAPTURE_EVENT_INFO_TYPE[input.eventType],
        afterContactId: input.cursor ?? undefined,
        excludeContactIds: input.excludeContactIds,
        limit: input.limit,
      })
      return contactIds.map((contactId) => ({ id: contactId, contactId }))
    }

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
      "contactInfo:phoneCaptured": 0,
      "contactInfo:emailCaptured": 0,
    }
  }
}

export const broadcastStatsRepository = new BroadcastStatsRepository()
