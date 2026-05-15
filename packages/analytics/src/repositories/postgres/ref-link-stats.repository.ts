import { db, sql } from "@chatbotx.io/database/client"
import { refLinkStatModel } from "@chatbotx.io/database/schema"
import { BaseRepository } from "./base.repository"

export class RefLinkStatsRepository extends BaseRepository {
  async getStatsByDateRange(input: {
    workspaceId: string
    linkId: string
    startDate: string
    endDate: string
    timezone: string
  }): Promise<{ dateReport: string; count: number }[]> {
    const { workspaceId, linkId, startDate, endDate, timezone } = input
    const t = refLinkStatModel

    const result = await db.execute(sql`
      SELECT
        TO_CHAR((${t.occurredAt} AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS "dateReport",
        COUNT(*)::int AS count
      FROM ${t}
      WHERE ${t.workspaceId} = ${workspaceId}
        AND ${t.linkId} = ${linkId}
        AND ${t.occurredAt} >= ${startDate}
        AND ${t.occurredAt} <= ${endDate}
      GROUP BY 1
      ORDER BY 1 ASC
    `)

    return result.rows as { dateReport: string; count: number }[]
  }

  async getContactStats(input: {
    workspaceId: string
    linkId: string
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    rows: { contactInboxId: string; occurredAt: Date }[]
  }> {
    const { workspaceId, linkId, page, perPage } = input
    const offset = (page - 1) * perPage
    const t = refLinkStatModel

    const result = await db.execute(sql`
      SELECT
        ${t.contactInboxId},
        MIN(${t.occurredAt}) AS "occurredAt"
      FROM ${t}
      WHERE ${t.workspaceId} = ${workspaceId}
        AND ${t.linkId} = ${linkId}
      GROUP BY ${t.contactInboxId}
      ORDER BY "occurredAt" DESC
      LIMIT ${perPage} OFFSET ${offset}
    `)

    const rows = result.rows as { contactInboxId: string; occurredAt: Date }[]
    return {
      contactInboxIds: rows.map((r) => r.contactInboxId),
      rows,
    }
  }
}

export const refLinkStatsRepository = new RefLinkStatsRepository()
