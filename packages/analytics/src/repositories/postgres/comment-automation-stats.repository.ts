import { db, sql } from "@chatbotx.io/database/client"
import { fbCommentAutomationEventModel } from "@chatbotx.io/database/schema"
import type { FBCommentAutomationEventInsert } from "@chatbotx.io/database/types"
import { BaseRepository } from "./base.repository"

type RangeInput = {
  workspaceId: string
  automationId: string
  startDate: string
  endDate: string
}

type PagedInput = RangeInput & {
  page: number
  perPage: number
  keyword?: string
}

type TextTotalRow = { text: string; total: number }

type ErrorEventRow = {
  id: string
  contactId: string | null
  replyChannel: string
  replyType: string
  errorDetail: string | null
  httpCode: string | null
  commentText: string | null
  occurredAt: Date
}

/**
 * Raw query layer over `FBCommentAutomationEvent`, the append-only log the
 * per-automation analytics page reads. Mirrors `LinkStatsRepository` in shape
 * (raw `db.execute(sql...)`, one method per panel) but is not parameterised by
 * table — unlike RefLinkStat/MagicLinkStat there is only one table here.
 *
 * Every method filters on BOTH `workspaceId` and `automationId`; the service
 * verifies the automation belongs to the workspace before calling in.
 */
export class CommentAutomationStatsRepository extends BaseRepository {
  insertEvents(rows: FBCommentAutomationEventInsert[]) {
    if (rows.length === 0) {
      return Promise.resolve()
    }
    return db
      .insert(fbCommentAutomationEventModel)
      .values(rows)
      .onConflictDoNothing({
        target: [
          fbCommentAutomationEventModel.automationId,
          fbCommentAutomationEventModel.commentId,
          fbCommentAutomationEventModel.replyChannel,
        ],
      })
      .then(() => undefined)
  }

  /**
   * Fills in the text an async reply only produced later. `AIAgent` dispatch
   * writes its row with a null `replyText` up front (so a job that never runs
   * still shows as attempted); the AI job then lands the generated text — or
   * the reason it gave up — on that same row.
   */
  async settleEvent(input: {
    automationId: string
    commentId: string
    replyChannel: string
    status: string
    replyText?: string | null
    errorDetail?: string | null
  }): Promise<void> {
    await db.execute(sql`
      UPDATE "FBCommentAutomationEvent"
      SET "status" = ${input.status}::"commentAutomationEventStatus",
          "replyText" = ${input.replyText ?? null},
          "errorDetail" = ${input.errorDetail ?? null},
          "updatedAt" = NOW()
      WHERE "automationId" = ${input.automationId}
        AND "commentId" = ${input.commentId}
        AND "replyChannel" = ${input.replyChannel}::"commentAutomationReplyChannel"
    `)
  }

  async getRepliesByDate(
    input: RangeInput & { timezone: string },
  ): Promise<{ dateReport: string; count: number }[]> {
    const { workspaceId, automationId, startDate, endDate, timezone } = input

    const result = await db.execute(sql`
      SELECT
        TO_CHAR(("occurredAt" AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS "dateReport",
        COUNT(*)::int AS count
      FROM "FBCommentAutomationEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "automationId" = ${automationId}
        AND "status" = 'sent'
        AND "occurredAt" >= ${startDate}
        AND "occurredAt" <= ${endDate}
      GROUP BY 1
      ORDER BY 1 ASC
    `)

    return result.rows as { dateReport: string; count: number }[]
  }

  /**
   * Distinct customer comments, most frequent first. Counts DISTINCT
   * `commentId`, not rows: one comment that drew both a public reply and a
   * private DM has two rows but was still commented once.
   */
  async getUserCommentTotals(
    input: PagedInput,
  ): Promise<{ rows: TextTotalRow[]; total: number }> {
    const { workspaceId, automationId, startDate, endDate, page, perPage } =
      input
    const offset = (page - 1) * perPage
    const keywordFilter = input.keyword
      ? sql` AND "commentText" ILIKE ${`%${input.keyword}%`}`
      : sql``

    const scope = sql`
      FROM "FBCommentAutomationEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "automationId" = ${automationId}
        AND "commentText" IS NOT NULL
        AND "occurredAt" >= ${startDate}
        AND "occurredAt" <= ${endDate}${keywordFilter}
    `

    const [rows, totals] = await Promise.all([
      db.execute(sql`
        SELECT "commentText" AS text, COUNT(DISTINCT "commentId")::int AS total
        ${scope}
        GROUP BY 1
        ORDER BY total DESC, 1 ASC
        LIMIT ${perPage} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(DISTINCT "commentText")::int AS total ${scope}
      `),
    ])

    return {
      rows: rows.rows as TextTotalRow[],
      total: (totals.rows[0] as { total: number } | undefined)?.total ?? 0,
    }
  }

  /** Distinct messages the bot sent, most frequent first. */
  async getBotReplyTotals(
    input: PagedInput,
  ): Promise<{ rows: TextTotalRow[]; total: number }> {
    const { workspaceId, automationId, startDate, endDate, page, perPage } =
      input
    const offset = (page - 1) * perPage
    const keywordFilter = input.keyword
      ? sql` AND "replyText" ILIKE ${`%${input.keyword}%`}`
      : sql``

    const scope = sql`
      FROM "FBCommentAutomationEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "automationId" = ${automationId}
        AND "status" = 'sent'
        AND "replyText" IS NOT NULL
        AND "occurredAt" >= ${startDate}
        AND "occurredAt" <= ${endDate}${keywordFilter}
    `

    const [rows, totals] = await Promise.all([
      db.execute(sql`
        SELECT "replyText" AS text, COUNT(*)::int AS total
        ${scope}
        GROUP BY 1
        ORDER BY total DESC, 1 ASC
        LIMIT ${perPage} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(DISTINCT "replyText")::int AS total ${scope}
      `),
    ])

    return {
      rows: rows.rows as TextTotalRow[],
      total: (totals.rows[0] as { total: number } | undefined)?.total ?? 0,
    }
  }

  async getErrorEvents(
    input: PagedInput,
  ): Promise<{ rows: ErrorEventRow[]; total: number }> {
    const { workspaceId, automationId, startDate, endDate, page, perPage } =
      input
    const offset = (page - 1) * perPage
    const keywordFilter = input.keyword
      ? sql` AND ("errorDetail" ILIKE ${`%${input.keyword}%`} OR "commentText" ILIKE ${`%${input.keyword}%`})`
      : sql``

    const scope = sql`
      FROM "FBCommentAutomationEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "automationId" = ${automationId}
        AND "status" = 'failed'
        AND "occurredAt" >= ${startDate}
        AND "occurredAt" <= ${endDate}${keywordFilter}
    `

    const [rows, totals] = await Promise.all([
      db.execute(sql`
        SELECT
          "id"::text AS id,
          "contactId"::text AS "contactId",
          "replyChannel"::text AS "replyChannel",
          "replyType"::text AS "replyType",
          "errorDetail",
          "httpCode",
          "commentText",
          "occurredAt"
        ${scope}
        ORDER BY "occurredAt" DESC
        LIMIT ${perPage} OFFSET ${offset}
      `),
      db.execute(sql`SELECT COUNT(*)::int AS total ${scope}`),
    ])

    return {
      rows: rows.rows as ErrorEventRow[],
      total: (totals.rows[0] as { total: number } | undefined)?.total ?? 0,
    }
  }
}

export const commentAutomationStatsRepository =
  new CommentAutomationStatsRepository()
