import { db, sql } from "@chatbotx.io/database/client"
import { resolvedTimezone } from "@chatbotx.io/database/queries/date-bucket"
import { fbCommentAutomationEventModel } from "@chatbotx.io/database/schema"
import type { FBCommentAutomationEventInsert } from "@chatbotx.io/database/types"
import type { CommentAutomationCounterDeltas } from "../../schemas/comment-automation"
import type { ContactEventData } from "../../schemas/common"
import { BaseRepository, type MessageEventType } from "./base.repository"

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

/** What a discarded row was counted as, so the caller can unwind its counters. */
type DeletedEventRow = {
  automationId: string
  status: string
  deliveredAt: Date | null
  seenAt: Date | null
  clickedAt: Date | null
  failedAt: Date | null
}

/** `clearedFailure` marks a row that had been failed and is now delivered. */
type MarkDeliveredRow = {
  automationId: string
  clearedFailure: boolean
}

type ContactPageRow = {
  contactInboxId: string | null
  contactId: string | null
  deliveredAt: Date | null
  seenAt: Date | null
  clickedAt: Date | null
  failedAt: Date | null
  errorDetail: string | null
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
  /**
   * Returns the rows that were ACTUALLY written. `onConflictDoNothing` makes a
   * BullMQ retry return nothing, and that is precisely what keeps the lifetime
   * counters on `FBCommentAutomation` honest — the caller increments once per
   * returned row, never once per call.
   */
  async insertEvents(
    rows: FBCommentAutomationEventInsert[],
  ): Promise<{ automationId: string; status: string }[]> {
    if (rows.length === 0) {
      return []
    }
    return await db
      .insert(fbCommentAutomationEventModel)
      .values(rows)
      .onConflictDoNothing({
        target: [
          fbCommentAutomationEventModel.automationId,
          fbCommentAutomationEventModel.commentId,
          fbCommentAutomationEventModel.replyChannel,
        ],
      })
      .returning({
        automationId: fbCommentAutomationEventModel.automationId,
        status: fbCommentAutomationEventModel.status,
      })
  }

  /**
   * Fills in the text an async reply only produced later. `AIAgent` dispatch
   * writes its row with a null `replyText` up front (so a job that never runs
   * still shows as attempted); the AI job then lands the generated text — or
   * the reason it gave up — on that same row.
   *
   * This is a PARTIAL update: `replyText` and `errorDetail` are only touched
   * when the caller passes the key. Passing `null` explicitly clears the
   * column; omitting it keeps whatever dispatch already wrote. Flipping a row
   * to `failed` must not erase the text the customer was supposed to receive —
   * the Error Logs panel needs it to show what the failed send was carrying.
   *
   * Settling to `failed` additionally stamps `failedAt` and is gated on
   * `"failedAt" IS NULL AND "deliveredAt" IS NULL`:
   *
   * - First failure wins, so a second settle is a no-op — the same rule
   *   `updateFailedBulk` applies to broadcast, and what makes `failedCount`
   *   safe to increment from the returned row count.
   * - A reply the customer already received is never retold as a failure. A
   *   `flow` reply is many messages but ONE reply: its first message settles
   *   delivery, and a later step throwing is a flow problem — already surfaced
   *   as a `sendError` in the inbox and in Error Logs. Without this guard that
   *   one reply would count as both delivered and failed, and the column
   *   percentages (measured against attempts) would exceed 100%.
   *
   * Returns the automation ids whose rows actually changed.
   */
  async settleEvent(input: {
    automationId: string
    commentId: string
    replyChannel: string
    status: string
    replyText?: string | null
    errorDetail?: string | null
  }): Promise<{ automationId: string }[]> {
    const isFailure = input.status === "failed"
    const assignments = [
      sql`"status" = ${input.status}::"commentAutomationEventStatus"`,
      sql`"updatedAt" = NOW()`,
    ]
    if (isFailure) {
      assignments.push(sql`"failedAt" = NOW()`)
    }
    if (input.replyText !== undefined) {
      assignments.push(sql`"replyText" = ${input.replyText}`)
    }
    if (input.errorDetail !== undefined) {
      assignments.push(sql`"errorDetail" = ${input.errorDetail}`)
    }

    const result = await db.execute(sql`
      UPDATE "FBCommentAutomationEvent"
      SET ${sql.join(assignments, sql`, `)}
      WHERE "automationId" = ${input.automationId}
        AND "commentId" = ${input.commentId}
        AND "replyChannel" = ${input.replyChannel}::"commentAutomationReplyChannel"
        ${isFailure ? sql`AND "failedAt" IS NULL AND "deliveredAt" IS NULL` : sql``}
      RETURNING "automationId"::text AS "automationId"
    `)

    return result.rows as { automationId: string }[]
  }

  /**
   * Drops the row a dispatch opened, for an async job that turned out to be a
   * deliberate SKIP rather than a failure (outside business hours, nothing for
   * the agent to answer). `FBCommentAutomationEvent` only ever counts work the
   * automation actually attempted — see the partial's docblock — so a skip must
   * leave no row at all rather than a `failed` one that floods Error Logs.
   */
  async deleteEvent(input: {
    automationId: string
    commentId: string
    replyChannel: string
  }): Promise<DeletedEventRow[]> {
    const result = await db.execute(sql`
      DELETE FROM "FBCommentAutomationEvent"
      WHERE "automationId" = ${input.automationId}
        AND "commentId" = ${input.commentId}
        AND "replyChannel" = ${input.replyChannel}::"commentAutomationReplyChannel"
      RETURNING
        "automationId"::text AS "automationId",
        "status"::text AS "status",
        "deliveredAt",
        "seenAt",
        "clickedAt",
        "failedAt"
    `)

    return result.rows as DeletedEventRow[]
  }

  /**
   * Marks a reply delivered — the channel accepted the send. Meta reports no
   * delivery receipt for a public comment reply, so for `public` this is the
   * only delivery signal there is; for `private` it is the Send API's own
   * acknowledgement, which arrives long before any `message_deliveries`
   * webhook (and a private text DM writes no `Message` row for one to match).
   *
   * Gated on `"deliveredAt" IS NULL`, so the first acknowledgement wins and a
   * later step of the same flow is a no-op.
   *
   * **A delivery clears an earlier failure.** A `flow` reply is several
   * messages but ONE reply, and `sendFlowStep` swallows a step's error and
   * carries on, so the steps can settle in either order — a media step failing
   * before the text step lands is routine. The rule is "any step through means
   * the reply arrived": whichever way round they fall, the outcome is the same
   * one delivered reply and no failure. So this clears `failedAt` and puts the
   * row back to `sent`, and reports it through `clearedFailure` so the caller
   * can take `failedCount` back down. The converse guard lives in
   * `settleEvent`, which refuses to fail an already-delivered row.
   *
   * `errorDetail` deliberately survives: the step really did fail, and the
   * drill-down still has something to show even though the reply counts as
   * delivered.
   */
  async markDelivered(input: {
    automationId: string
    commentId: string
    replyChannel: string
    occurredAt: Date
  }): Promise<MarkDeliveredRow[]> {
    const result = await db.execute(sql`
      WITH previous AS (
        SELECT "id", "failedAt"
        FROM "FBCommentAutomationEvent"
        WHERE "automationId" = ${input.automationId}
          AND "commentId" = ${input.commentId}
          AND "replyChannel" = ${input.replyChannel}::"commentAutomationReplyChannel"
          AND "deliveredAt" IS NULL
      )
      UPDATE "FBCommentAutomationEvent" event
      SET "deliveredAt" = ${input.occurredAt.toISOString()}::timestamptz,
          "failedAt" = NULL,
          "status" = 'sent',
          "updatedAt" = NOW()
      FROM previous
      WHERE event."id" = previous."id"
        -- Repeated from the CTE on purpose: this is the predicate Postgres
        -- re-checks after taking the row lock, so two steps finishing at once
        -- cannot both count a delivery.
        AND event."deliveredAt" IS NULL
      RETURNING
        event."automationId"::text AS "automationId",
        (previous."failedAt" IS NOT NULL) AS "clearedFailure"
    `)

    return result.rows as MarkDeliveredRow[]
  }

  /**
   * Marks every outstanding private DM to these inboxes as seen.
   *
   * Keyed on the inbox rather than the reply, because a read receipt carries no
   * automation id — Meta's `message_reads` is a per-conversation watermark, and
   * `conversation.ts`'s `contactMarkAsRead` emits `message:seen` with no
   * metadata at all. Broadcast solves it the same way
   * (`getUnreadBroadcastsWithWorkspace`); one receipt can settle several
   * outstanding replies, which is the intended behaviour.
   *
   * `replyChannel = 'private'` because a public comment reply has no reader.
   * Served by `FBCommentAutomationEvent_private_unseen_idx` — this runs for
   * EVERY read receipt on the platform, so the predicate must match that index
   * exactly.
   */
  async markSeenForContactInboxes(
    items: { contactInboxId: string; occurredAt: Date }[],
  ): Promise<{ automationId: string }[]> {
    if (items.length === 0) {
      return []
    }

    const cases = items.map(
      (item) =>
        sql`WHEN "contactInboxId" = ${item.contactInboxId} THEN ${item.occurredAt.toISOString()}::timestamptz`,
    )
    const ids = items.map((item) => sql`${item.contactInboxId}`)

    const result = await db.execute(sql`
      UPDATE "FBCommentAutomationEvent"
      SET "seenAt" = CASE ${sql.join(cases, sql` `)} ELSE NOW() END,
          "updatedAt" = NOW()
      WHERE "replyChannel" = 'private'
        AND "deliveredAt" IS NOT NULL
        AND "seenAt" IS NULL
        AND "contactInboxId" IN (${sql.join(ids, sql`, `)})
      RETURNING "automationId"::text AS "automationId"
    `)

    return result.rows as { automationId: string }[]
  }

  /**
   * Attributes a link/button click to the most recent unclicked reply of the
   * `(automationId, contactInboxId)` pair.
   *
   * Deliberately an approximation. The click arrives through a button payload
   * (`encodeButtonPayload`), whose fields are all bigint-as-string — a Facebook
   * comment id is `{storyId}_{commentId}`, so it cannot ride along and the
   * exact reply cannot be named. In practice a contact has at most one live
   * reply per automation, so the newest unclicked row is the right one; when it
   * is not, the click still lands on the right automation.
   */
  async markClickedForAutomationContacts(
    items: { automationId: string; contactInboxId: string; occurredAt: Date }[],
  ): Promise<{ automationId: string }[]> {
    if (items.length === 0) {
      return []
    }

    const values = items.map(
      (item) =>
        sql`(${item.automationId}::bigint, ${item.contactInboxId}::bigint, ${item.occurredAt.toISOString()}::timestamptz)`,
    )

    const result = await db.execute(sql`
      WITH input("automationId", "contactInboxId", "occurredAt") AS (
        VALUES ${sql.join(values, sql`, `)}
      ),
      targets AS (
        SELECT candidate."id", input."occurredAt"
        FROM input
        CROSS JOIN LATERAL (
          SELECT event."id"
          FROM "FBCommentAutomationEvent" event
          WHERE event."automationId" = input."automationId"
            AND event."contactInboxId" = input."contactInboxId"
            AND event."clickedAt" IS NULL
          ORDER BY event."occurredAt" DESC
          LIMIT 1
        ) candidate
      )
      UPDATE "FBCommentAutomationEvent" event
      SET "clickedAt" = targets."occurredAt", "updatedAt" = NOW()
      FROM targets
      WHERE event."id" = targets."id"
      RETURNING event."automationId"::text AS "automationId"
    `)

    return result.rows as { automationId: string }[]
  }

  /**
   * Applies the lifetime counter deltas on `FBCommentAutomation` in one
   * statement. Never gates on the current value: every caller has already
   * proved the transition happened exactly once by counting rows a conditional
   * write returned.
   */
  async incrementCounters(
    deltas: CommentAutomationCounterDeltas,
  ): Promise<void> {
    const entries = [...deltas.entries()].filter(([, fields]) =>
      Object.values(fields).some((value) => value),
    )
    if (entries.length === 0) {
      return
    }

    const rows = entries.map(
      ([automationId, fields]) =>
        sql`(${automationId}::bigint, ${fields.sentCount ?? 0}::int, ${fields.deliveredCount ?? 0}::int, ${fields.seenCount ?? 0}::int, ${fields.clickedCount ?? 0}::int, ${fields.failedCount ?? 0}::int)`,
    )

    await db.execute(sql`
      UPDATE "FBCommentAutomation" automation
      SET "sentCount" = GREATEST(0, automation."sentCount" + delta."sent"),
          "deliveredCount" = GREATEST(0, automation."deliveredCount" + delta."delivered"),
          "seenCount" = GREATEST(0, automation."seenCount" + delta."seen"),
          "clickedCount" = GREATEST(0, automation."clickedCount" + delta."clicked"),
          "failedCount" = GREATEST(0, automation."failedCount" + delta."failed")
      FROM (VALUES ${sql.join(rows, sql`, `)})
        AS delta("id", "sent", "delivered", "seen", "clicked", "failed")
      WHERE automation."id" = delta."id"
    `)
  }

  /**
   * One page of the drill-down dialog. Same contract as
   * `BroadcastStatsRepository.getContacts` so the shared `StatsContactsDialog`
   * and its hydration step work unchanged.
   *
   * Rows with no `contactInboxId` are excluded: they predate this column or
   * lost it to a `ContactInbox` delete, and the dialog has nothing to render
   * without one.
   */
  async getContacts(input: {
    workspaceId: string
    automationId: string
    eventType: MessageEventType
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    contactEventMap: Map<string, ContactEventData>
  }> {
    const { workspaceId, automationId, eventType, page, perPage } = input
    const offset = (page - 1) * perPage
    const { condition, orderColumn } = this.buildEventFilter(eventType)

    const result = await db.execute(sql`
      SELECT
        "contactInboxId"::text AS "contactInboxId",
        "contactId"::text AS "contactId",
        "deliveredAt",
        "seenAt",
        "clickedAt",
        "failedAt",
        "errorDetail"
      FROM "FBCommentAutomationEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "automationId" = ${automationId}
        AND "contactInboxId" IS NOT NULL
        AND ${condition}
      ORDER BY ${orderColumn} DESC NULLS LAST
      LIMIT ${perPage} OFFSET ${offset}
    `)

    const rows = result.rows as ContactPageRow[]
    const contactInboxIds: string[] = []
    const contactEventMap = new Map<string, ContactEventData>()

    for (const row of rows) {
      if (!row.contactInboxId) {
        continue
      }
      contactInboxIds.push(row.contactInboxId)
      contactEventMap.set(row.contactInboxId, {
        contactId: row.contactId ?? "",
        contactInboxId: row.contactInboxId,
        occurredAt: this.getOccurredAt(row, eventType),
        errorContent: row.errorDetail ?? undefined,
      })
    }

    return { contactInboxIds, contactEventMap }
  }

  /** Keyset page of contact ids for the bulk-tag worker. */
  async getContactIdsPage(input: {
    workspaceId: string
    automationId: string
    eventType: MessageEventType
    cursor: string | null
    limit: number
    excludeContactIds?: string[]
  }): Promise<{ id: string; contactId: string }[]> {
    const { condition } = this.buildEventFilter(input.eventType)
    const cursorFilter = input.cursor
      ? sql` AND "contactId" > ${input.cursor}`
      : sql``
    const excludeFilter = input.excludeContactIds?.length
      ? sql` AND "contactId" NOT IN (${sql.join(
          input.excludeContactIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``

    const result = await db.execute(sql`
      SELECT DISTINCT "contactId"::text AS "contactId"
      FROM "FBCommentAutomationEvent"
      WHERE "workspaceId" = ${input.workspaceId}
        AND "automationId" = ${input.automationId}
        AND "contactId" IS NOT NULL
        AND ${condition}${cursorFilter}${excludeFilter}
      ORDER BY "contactId" ASC
      LIMIT ${input.limit}
    `)

    return (result.rows as { contactId: string }[]).map((row) => ({
      id: row.contactId,
      contactId: row.contactId,
    }))
  }

  /**
   * Event type → row predicate. `message:sent` is every attempt, which is why
   * it reads as "delivered or failed" rather than a column of its own — the
   * same derivation `BroadcastStatsRepository.buildEventFilter` uses. A row
   * that is neither yet (an AI reply still generating) is deliberately out.
   */
  private buildEventFilter(eventType: MessageEventType) {
    switch (eventType) {
      case "message:delivered":
        return {
          condition: sql`"deliveredAt" IS NOT NULL`,
          orderColumn: sql`"deliveredAt"`,
        }
      case "message:seen":
        return {
          condition: sql`"seenAt" IS NOT NULL`,
          orderColumn: sql`"seenAt"`,
        }
      case "message:failed":
        return {
          condition: sql`"failedAt" IS NOT NULL`,
          orderColumn: sql`"failedAt"`,
        }
      case "flow:clicked":
        return {
          condition: sql`"clickedAt" IS NOT NULL`,
          orderColumn: sql`"clickedAt"`,
        }
      default:
        return {
          condition: sql`("deliveredAt" IS NOT NULL OR "failedAt" IS NOT NULL)`,
          orderColumn: sql`COALESCE("deliveredAt", "failedAt")`,
        }
    }
  }

  async getRepliesByDate(
    input: RangeInput & { timezone: string },
  ): Promise<{ dateReport: string; count: number }[]> {
    const { workspaceId, automationId, startDate, endDate, timezone } = input

    // `resolvedTimezone`, never the caller's name verbatim: browsers still
    // report legacy IANA names (`Asia/Saigon`, `Asia/Calcutta`, `Europe/Kiev`)
    // and a PostgreSQL build packaged without the `backward` tzdata file
    // aborts the whole statement on one — which took this chart (and the
    // "replies by date" table that shares its data) down to an empty series
    // while the three panels that never touch `timezone` kept working.
    const result = await db.execute(sql`
      SELECT
        TO_CHAR(("occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)})::date, 'YYYY-MM-DD') AS "dateReport",
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
