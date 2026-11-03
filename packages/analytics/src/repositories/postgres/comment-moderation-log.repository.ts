import { and, count, db, eq, gte, lte, sql } from "@chatbotx.io/database/client"
import type {
  CommentModerationAction,
  CommentModerationSource,
  CommentModerationStatus,
} from "@chatbotx.io/database/partials"
import { commentModerationLogModel } from "@chatbotx.io/database/schema"
import type {
  CommentModerationLogInsert,
  CommentModerationLogModel,
} from "@chatbotx.io/database/types"
import { BaseRepository } from "./base.repository"

export type CommentModerationLogFilter = {
  workspaceId: string
  automationId: string
  from?: Date
  to?: Date
  action?: CommentModerationAction
  source?: CommentModerationSource
}

export type CommentModerationLogSummaryRow = {
  source: CommentModerationSource
  action: CommentModerationAction
  status: CommentModerationStatus
  total: number
}

/**
 * Query layer over `CommentModerationLog` — the comments an automation hid or
 * deleted, and why.
 *
 * Every method filters on BOTH `workspaceId` and `automationId`; the service
 * verifies the automation belongs to the workspace before calling in. Reads go
 * through the query builder, never `db.execute(sql...)`, so `occurredAt`
 * arrives as a `Date` (see `CommentAutomationMissRepository`).
 */
export class CommentModerationLogRepository extends BaseRepository {
  /**
   * Returns the rows that were ACTUALLY written: `onConflictDoNothing` on
   * `(automationId, commentId)` makes a retry return nothing, and the caller
   * increments `moderatedCount` once per returned row.
   */
  async insertLogs(
    rows: CommentModerationLogInsert[],
  ): Promise<{ id: string; automationId: string }[]> {
    if (rows.length === 0) {
      return []
    }
    return await db
      .insert(commentModerationLogModel)
      .values(rows)
      .onConflictDoNothing({
        target: [
          commentModerationLogModel.automationId,
          commentModerationLogModel.commentId,
        ],
      })
      .returning({
        id: commentModerationLogModel.id,
        automationId: commentModerationLogModel.automationId,
      })
  }

  /** The row's status, or null when the comment was never moderated. */
  async findStatus(input: {
    workspaceId: string
    automationId: string
    commentId: string
  }): Promise<CommentModerationStatus | null> {
    const log = commentModerationLogModel
    const [row] = await db
      .select({ status: log.status })
      .from(log)
      .where(
        and(
          eq(log.workspaceId, input.workspaceId),
          eq(log.automationId, input.automationId),
          eq(log.commentId, input.commentId),
        ),
      )
      .limit(1)
    return (row?.status as CommentModerationStatus | undefined) ?? null
  }

  /** Settles the row once the channel's hide/delete job has run. */
  async settleStatus(input: {
    workspaceId: string
    automationId: string
    commentId: string
    status: Exclude<CommentModerationStatus, "pending">
    errorDetail?: string | null
  }): Promise<void> {
    const log = commentModerationLogModel
    await db
      .update(log)
      .set({
        status: input.status,
        errorDetail: input.errorDetail ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(log.workspaceId, input.workspaceId),
          eq(log.automationId, input.automationId),
          eq(log.commentId, input.commentId),
        ),
      )
  }

  private buildScope(filter: CommentModerationLogFilter) {
    const log = commentModerationLogModel
    return and(
      eq(log.workspaceId, filter.workspaceId),
      eq(log.automationId, filter.automationId),
      filter.from ? gte(log.occurredAt, filter.from) : undefined,
      filter.to ? lte(log.occurredAt, filter.to) : undefined,
      filter.action ? eq(log.action, filter.action) : undefined,
      filter.source ? eq(log.source, filter.source) : undefined,
    )
  }

  /** One page of the log, newest comment first. */
  async listLogs(
    input: CommentModerationLogFilter & { page: number; perPage: number },
  ): Promise<{ rows: CommentModerationLogModel[]; total: number }> {
    const log = commentModerationLogModel
    const scope = this.buildScope(input)

    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(log)
        .where(scope)
        .orderBy(sql`${log.occurredAt} DESC`, sql`${log.id} DESC`)
        .limit(input.perPage)
        .offset((input.page - 1) * input.perPage),
      db.select({ total: count() }).from(log).where(scope),
    ])

    return { rows, total: totals[0]?.total ?? 0 }
  }

  /** Row counts per source × action × status, for the summary tiles. */
  async summarize(
    filter: CommentModerationLogFilter,
  ): Promise<CommentModerationLogSummaryRow[]> {
    const log = commentModerationLogModel
    const rows = await db
      .select({
        source: log.source,
        action: log.action,
        status: log.status,
        total: count(),
      })
      .from(log)
      .where(this.buildScope(filter))
      .groupBy(log.source, log.action, log.status)

    return rows.map((row) => ({
      source: row.source as CommentModerationSource,
      action: row.action as CommentModerationAction,
      status: row.status as CommentModerationStatus,
      total: row.total,
    }))
  }
}

export const commentModerationLogRepository =
  new CommentModerationLogRepository()
