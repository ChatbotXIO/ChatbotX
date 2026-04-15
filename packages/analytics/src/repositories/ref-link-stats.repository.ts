import { and, db, eq, gte, lte, sql } from "@chatbotx.io/database/client"
import { fromZonedTime } from "date-fns-tz"
import { refLinkStatModel } from "../../../database/src/schema"
import type { MagicLinkStatsInput } from "../schemas"
import { BaseRepository } from "./base.repository"

export type RefLinkTimeseriesRow = {
  dateReport: string
  total: number
}

export class RefLinkStatsRepository extends BaseRepository {
  async getRefLinkStatsByDateRange(
    input: MagicLinkStatsInput,
  ): Promise<RefLinkTimeseriesRow[]> {
    const { workspaceId, startDate, endDate, linkId, timezone } = input

    const t = refLinkStatModel

    const startDateWithTz = fromZonedTime(`${startDate} 00:00:00`, timezone)
    const endDateWithTz = fromZonedTime(`${endDate} 23:59:59`, timezone)

    const result = await db
      .select({
        dateReport: sql`
          DATE(${t.occurredAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) as dateReport
        `,
        total: sql`COUNT(*)::bigint`,
      })
      .from(t)
      .where(
        and(
          eq(t.workspaceId, workspaceId),
          eq(t.linkId, linkId),
          gte(t.occurredAt, startDateWithTz),
          lte(t.occurredAt, endDateWithTz),
        ),
      )
      .groupBy(sql`dateReport`, t.contactId)

    return result.map((r) => ({
      dateReport: r.dateReport as string,
      total: Number(r.total),
    }))
  }

  async getRefLinkContactStats(input: {
    workspaceId: string
    linkId: string
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    rows: Pick<
      typeof refLinkStatModel.$inferSelect,
      "contactInboxId" | "contactId" | "occurredAt"
    >[]
  }> {
    const { workspaceId, linkId, page, perPage } = input
    const offset = (page - 1) * perPage
    const t = refLinkStatModel

    const rows = await db
      .select({
        contactInboxId: t.contactInboxId,
        contactId: t.contactId,
        occurredAt: t.occurredAt,
      })
      .from(t)
      .where(and(eq(t.workspaceId, workspaceId), eq(t.linkId, linkId)))
      .orderBy(sql`${t.occurredAt} DESC`)
      .limit(perPage)
      .offset(offset)

    const contactInboxIds = rows.map((r) => r.contactInboxId as string)

    return { contactInboxIds, rows }
  }
}

export const refLinkStatsRepository = new RefLinkStatsRepository()
