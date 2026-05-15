import {
  and,
  count,
  db,
  eq,
  isNotNull,
  or,
  sql,
} from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"
import type { ContactEventData } from "../../schemas/common"
import type {
  SequenceFailedBulkUpdateItem,
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
    const { workspaceId, sequenceId, stepId } = input
    const t = sequenceDispatchModel

    const [deliveredResult, seenResult, clickedResult, failedResult] =
      await Promise.all([
        db
          .select({ count: count() })
          .from(t)
          .where(
            and(
              eq(t.workspaceId, workspaceId),
              eq(t.sequenceId, sequenceId),
              eq(t.stepId, stepId),
              isNotNull(t.deliveredAt),
            ),
          ),
        db
          .select({ count: count() })
          .from(t)
          .where(
            and(
              eq(t.workspaceId, workspaceId),
              eq(t.sequenceId, sequenceId),
              eq(t.stepId, stepId),
              isNotNull(t.seenAt),
            ),
          ),
        db
          .select({ count: count() })
          .from(t)
          .where(
            and(
              eq(t.workspaceId, workspaceId),
              eq(t.sequenceId, sequenceId),
              eq(t.stepId, stepId),
              isNotNull(t.clickedAt),
            ),
          ),
        db
          .select({ count: count() })
          .from(t)
          .where(
            and(
              eq(t.workspaceId, workspaceId),
              eq(t.sequenceId, sequenceId),
              eq(t.stepId, stepId),
              isNotNull(t.failedAt),
            ),
          ),
      ])

    const delivered = deliveredResult[0]?.count ?? 0
    const seen = seenResult[0]?.count ?? 0
    const clicked = clickedResult[0]?.count ?? 0
    const failed = failedResult[0]?.count ?? 0

    return {
      "message:sent": delivered + failed,
      "message:delivered": delivered,
      "message:seen": seen,
      "flow:clicked": clicked,
      "message:failed": failed,
    }
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

    const { eventCondition, orderColumn } = this.buildEventFilter(eventType)

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

  private buildEventFilter(eventType: SequenceStepEventType) {
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

  async updateFailedBulk(items: SequenceFailedBulkUpdateItem[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    const tuples = items.map(
      (i) => sql`(${i.sequenceId}, ${i.stepId}, ${i.contactInboxId})`,
    )
    const failedCases = items.map(
      (i) =>
        sql`WHEN "sequenceId" = ${i.sequenceId} AND "stepId" = ${i.stepId} AND "contactInboxId" = ${i.contactInboxId} THEN ${i.occurredAt}`,
    )
    const errorCases = items.map(
      (i) =>
        sql`WHEN "sequenceId" = ${i.sequenceId} AND "stepId" = ${i.stepId} AND "contactInboxId" = ${i.contactInboxId} THEN ${i.errorContent}`,
    )

    await db.execute(sql`
      UPDATE "SequenceDispatch"
      SET "failedAt" = COALESCE("failedAt", CASE ${sql.join(failedCases, sql` `)} END),
          "errorContent" = COALESCE("errorContent", CASE ${sql.join(errorCases, sql` `)} END)
      WHERE ("sequenceId", "stepId", "contactInboxId") IN (${sql.join(tuples, sql`, `)})
    `)
  }
}

export const sequenceStatsRepository = new SequenceStatsRepository()
