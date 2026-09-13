import {
  and,
  countDistinct,
  db,
  eq,
  gt,
  isNotNull,
  notInArray,
  sql,
} from "@chatbotx.io/database/client"
import type { CommentAutomationMissReason } from "@chatbotx.io/database/partials"
import { fbCommentAutomationMissModel } from "@chatbotx.io/database/schema"
import type { FBCommentAutomationMissInsert } from "@chatbotx.io/database/types"
import type { ContactEventData } from "../../schemas/common"
import { BaseRepository } from "./base.repository"

/** One drill-down row: a contact-event plus what they said and why it stalled. */
export type CommentAutomationMissRow = ContactEventData & {
  rowKey: string
  commentText: string | null
  missReason: CommentAutomationMissReason
}

/**
 * Query layer over `FBCommentAutomationMiss` — the comments an automation was
 * shown and declined to answer.
 *
 * Separate from `CommentAutomationStatsRepository` because the two tables
 * answer opposite questions: that one logs what the automation *attempted*,
 * this one logs what it passed on. The shapes it returns are deliberately
 * interchangeable with that repository's, so the service can route an
 * `eventType` to either one and the dialog above it never has to branch.
 *
 * Same house rules apply: anything returning a timestamp goes through the query
 * builder, never `db.execute(sql...)` — raw execute hands back the driver's own
 * values with no column mapping, so a `timestamptz` arrives as a string and the
 * first `.toISOString()` downstream throws.
 *
 * Every method filters on BOTH `workspaceId` and `automationId`; the service
 * verifies the automation belongs to the workspace before calling in.
 */
export class CommentAutomationMissRepository extends BaseRepository {
  /**
   * Returns the rows that were ACTUALLY written, exactly as
   * `CommentAutomationStatsRepository.insertEvents` does. `onConflictDoNothing`
   * makes a BullMQ retry or a redelivered webhook return nothing, and that is
   * what keeps `FBCommentAutomation.missedCount` honest — the caller increments
   * once per returned row, never once per call.
   *
   * Written as one multi-row insert on purpose: a single comment is shown to
   * every active automation on the channel, so a busy page would otherwise fire
   * one statement per automation per comment.
   */
  async insertMisses(
    rows: FBCommentAutomationMissInsert[],
  ): Promise<{ automationId: string }[]> {
    if (rows.length === 0) {
      return []
    }
    return await db
      .insert(fbCommentAutomationMissModel)
      .values(rows)
      .onConflictDoNothing({
        target: [
          fbCommentAutomationMissModel.automationId,
          fbCommentAutomationMissModel.commentId,
        ],
      })
      .returning({
        automationId: fbCommentAutomationMissModel.automationId,
      })
  }

  /**
   * One page of the Misses drill-down, newest comment first.
   *
   * `contactTotal` counts PEOPLE while the rows count occurrences — the same
   * split the delivery-stat dialog makes, and for the same reason: tagging acts
   * on contacts, so "select all" must promise the number it will really tag.
   */
  async getMissContacts(input: {
    workspaceId: string
    automationId: string
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    events: CommentAutomationMissRow[]
    contactTotal: number
  }> {
    const { workspaceId, automationId, page, perPage } = input
    const offset = (page - 1) * perPage
    const miss = fbCommentAutomationMissModel

    // A row with no inbox cannot be hydrated into a contact card, so it is
    // filtered here rather than dropped after paging — otherwise a page of
    // orphaned rows renders as an empty list that still claims to have more.
    const scope = and(
      eq(miss.workspaceId, workspaceId),
      eq(miss.automationId, automationId),
      isNotNull(miss.contactInboxId),
    )

    const [rows, contactTotals] = await Promise.all([
      db
        .select({
          id: miss.id,
          contactInboxId: miss.contactInboxId,
          contactId: miss.contactId,
          commentText: miss.commentText,
          reason: miss.reason,
          occurredAt: miss.occurredAt,
        })
        .from(miss)
        .where(scope)
        .orderBy(sql`${miss.occurredAt} DESC NULLS LAST`)
        .limit(perPage)
        .offset(offset),
      db
        .select({ total: countDistinct(miss.contactId) })
        .from(miss)
        .where(scope),
    ])

    const contactInboxIds: string[] = []
    const events: CommentAutomationMissRow[] = []

    for (const row of rows) {
      if (!row.contactInboxId) {
        continue
      }
      contactInboxIds.push(row.contactInboxId)
      events.push({
        rowKey: row.id,
        contactId: row.contactId ?? "",
        contactInboxId: row.contactInboxId,
        // The comment's own time, not when the row was written: `replyAfter`
        // can put an hour between the two.
        occurredAt: row.occurredAt.toISOString(),
        commentText: row.commentText,
        missReason: row.reason as CommentAutomationMissReason,
      })
    }

    return {
      contactInboxIds,
      events,
      contactTotal: contactTotals[0]?.total ?? 0,
    }
  }

  /** Keyset page of contact ids for the bulk-tag worker. */
  async getMissContactIdsPage(input: {
    workspaceId: string
    automationId: string
    cursor: string | null
    limit: number
    excludeContactIds?: string[]
  }): Promise<{ id: string; contactId: string }[]> {
    const miss = fbCommentAutomationMissModel

    const rows = await db
      .selectDistinct({ contactId: miss.contactId })
      .from(miss)
      .where(
        and(
          eq(miss.workspaceId, input.workspaceId),
          eq(miss.automationId, input.automationId),
          isNotNull(miss.contactId),
          input.cursor ? gt(miss.contactId, input.cursor) : undefined,
          input.excludeContactIds?.length
            ? notInArray(miss.contactId, input.excludeContactIds)
            : undefined,
        ),
      )
      .orderBy(miss.contactId)
      .limit(input.limit)

    return rows
      .filter((row) => row.contactId !== null)
      .map((row) => ({
        id: row.contactId as string,
        contactId: row.contactId as string,
      }))
  }
}

export const commentAutomationMissRepository =
  new CommentAutomationMissRepository()
