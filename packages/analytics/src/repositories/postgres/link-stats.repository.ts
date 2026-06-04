import { type Column, db, sql, type Table } from "@chatbotx.io/database/client"
import { BaseRepository } from "./base.repository"

type LinkStatColumns = {
  workspaceId: Column
  linkId: Column
  contactInboxId: Column
  occurredAt: Column
}

/**
 * Shared query layer for the append-only link-stat tables
 * (RefLinkStat, MagicLinkStat). Both tables have identical shapes and access
 * patterns, so the SQL lives here once and is parameterized by the table.
 */
export class LinkStatsRepository extends BaseRepository {
  private readonly table: Table
  private readonly columns: LinkStatColumns

  constructor(table: Table, columns: LinkStatColumns) {
    super()
    this.table = table
    this.columns = columns
  }

  async getStatsByDateRange(input: {
    workspaceId: string
    linkId: string
    startDate: string
    endDate: string
    timezone: string
  }): Promise<{ dateReport: string; count: number }[]> {
    const { workspaceId, linkId, startDate, endDate, timezone } = input
    const { occurredAt, workspaceId: wsCol, linkId: linkCol } = this.columns

    const result = await db.execute(sql`
      SELECT
        TO_CHAR((${occurredAt} AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS "dateReport",
        COUNT(*)::int AS count
      FROM ${this.table}
      WHERE ${wsCol} = ${workspaceId}
        AND ${linkCol} = ${linkId}
        AND ${occurredAt} >= ${startDate}
        AND ${occurredAt} <= ${endDate}
      GROUP BY 1
      ORDER BY 1 ASC
    `)

    return result.rows as { dateReport: string; count: number }[]
  }

  /** Distinct contacts that interacted with the link — the paginated total. */
  async getContactCount(input: {
    workspaceId: string
    linkId: string
    startDate?: string
    endDate?: string
  }): Promise<number> {
    const { workspaceId, linkId, startDate, endDate } = input
    const {
      workspaceId: wsCol,
      linkId: linkCol,
      contactInboxId,
      occurredAt,
    } = this.columns
    const dateFilter =
      startDate && endDate
        ? sql` AND ${occurredAt} >= ${startDate} AND ${occurredAt} <= ${endDate}`
        : sql``

    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT ${contactInboxId})::int AS total
      FROM ${this.table}
      WHERE ${wsCol} = ${workspaceId}
        AND ${linkCol} = ${linkId}${dateFilter}
    `)

    return (result.rows[0] as { total: number } | undefined)?.total ?? 0
  }

  async getContactStats(input: {
    workspaceId: string
    linkId: string
    page: number
    perPage: number
    startDate?: string
    endDate?: string
  }): Promise<{
    contactInboxIds: string[]
    rows: { contactInboxId: string; occurredAt: Date }[]
  }> {
    const { workspaceId, linkId, page, perPage, startDate, endDate } = input
    const offset = (page - 1) * perPage
    const {
      workspaceId: wsCol,
      linkId: linkCol,
      contactInboxId,
      occurredAt,
    } = this.columns
    const dateFilter =
      startDate && endDate
        ? sql` AND ${occurredAt} >= ${startDate} AND ${occurredAt} <= ${endDate}`
        : sql``

    const result = await db.execute(sql`
      SELECT
        ${contactInboxId},
        MIN(${occurredAt}) AS "occurredAt"
      FROM ${this.table}
      WHERE ${wsCol} = ${workspaceId}
        AND ${linkCol} = ${linkId}${dateFilter}
      GROUP BY ${contactInboxId}
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
