import { and, db, eq, gte, lte, sql } from "@chatbotx.io/database/client"
import {
  magicLinkContactStatModel,
  magicLinkStatModel,
} from "@chatbotx.io/database/schema"
import { fromZonedTime } from "date-fns-tz"
import type { MagicLinkStatsInput } from "../schemas"
import type { ContactEventData } from "../schemas/common"
import { BaseRepository } from "./base.repository"

export type MagicLinkTimeseriesRow = {
  dateReport: string
  clicks: number
}

export class MagicLinkStatsRepository extends BaseRepository {
  async getMagicLinkStatsByDateRange(
    input: MagicLinkStatsInput,
  ): Promise<MagicLinkTimeseriesRow[]> {
    const { workspaceId, startDate, endDate, linkId, timezone } = input

    const t = magicLinkStatModel

    const startDateWithTz = fromZonedTime(`${startDate} 00:00:00`, timezone)
    const endDateWithTz = fromZonedTime(`${endDate} 23:59:59`, timezone)

    const result = await db
      .select({
        dateReport: sql`
          DATE(${t.occurredAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) as dateReport
        `,
        clicks: sql`COUNT(*)::bigint`,
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
      clicks: Number(r.clicks),
    }))
  }

  async getMagicLinkContactStats(input: {
    workspaceId: string
    linkId: string
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    const { workspaceId, linkId, page, perPage } = input
    const offset = (page - 1) * perPage
    const t = magicLinkContactStatModel

    const rows = await db
      .select({
        contactInboxId: t.contactInboxId,
        contactId: t.contactId,
        occurredAt: t.occurredAt,
      })
      .from(t)
      .where(sql`${t.workspaceId} = ${workspaceId} AND ${t.linkId} = ${linkId}`)
      .orderBy(sql`${t.occurredAt} DESC NULLS LAST`)
      .limit(perPage)
      .offset(offset)

    const contactInboxIds = rows.map((r) => r.contactInboxId as string)
    const contactEventMap = new Map<string, ContactEventData>()

    for (const row of rows) {
      contactEventMap.set(row.contactInboxId, {
        contactId: row.contactId ?? "",
        contactInboxId: row.contactInboxId,
        occurredAt: (row.occurredAt ?? new Date()).toISOString(),
      })
    }

    return { contactInboxIds, contactEventMap }
  }
}

export const magicLinkStatsRepository = new MagicLinkStatsRepository()
