import {
  and,
  countDistinct,
  db,
  eq,
  gt,
  isNotNull,
  notInArray,
  or,
  sql,
} from "@chatbotx.io/database/client"
import { resolvedTimezone } from "@chatbotx.io/database/queries/date-bucket"
import { commentAutomationEventModel } from "@chatbotx.io/database/schema"
import type { CommentAutomationEventInsert } from "@chatbotx.io/database/types"
import type { RangeGranularity } from "../../lib/time-series"
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

/**
 * Query layer over `CommentAutomationEvent`, the append-only log the
 * per-automation analytics page and the delivery-stat columns read. Mirrors
 * `LinkStatsRepository` in shape (one method per panel) but is not
 * parameterised by table — unlike RefLinkStat/MagicLinkStat there is only one
 * table here.
 *
 * **Anything returning a timestamp goes through the query builder, never
 * `db.execute(sql...)`.** Raw execute hands back the driver's own values with
 * no column mapping, so a `timestamptz` arrives as a string; a hand-written
 * `as SomeRow[]` cast then claims it is a `Date` and the first `.toISOString()`
 * downstream throws at runtime. The text/count panels below may stay raw —
 * `getErrorEvents` is the one that straddles it, which is why its caller wraps
 * `occurredAt` in `new Date(...)`.
 *
 * Every method filters on BOTH `workspaceId` and `automationId`; the service
 * verifies the automation belongs to the workspace before calling in.
 */
export class CommentAutomationStatsRepository extends BaseRepository {
  /**
   * Returns the rows that were ACTUALLY written. `onConflictDoNothing` makes a
   * BullMQ retry return nothing, and that is precisely what keeps the lifetime
   * counters on `CommentAutomation` honest — the caller increments once per
   * returned row, never once per call.
   */
  async insertEvents(
    rows: CommentAutomationEventInsert[],
  ): Promise<
    { automationId: string; status: string; deliveredAt: Date | null }[]
  > {
    if (rows.length === 0) {
      return []
    }
    return await db
      .insert(commentAutomationEventModel)
      .values(rows)
      .onConflictDoNothing({
        target: [
          commentAutomationEventModel.automationId,
          commentAutomationEventModel.commentId,
          commentAutomationEventModel.replyChannel,
        ],
      })
      .returning({
        automationId: commentAutomationEventModel.automationId,
        status: commentAutomationEventModel.status,
        // Returned so the caller can count a row that was born delivered — a
        // synchronous send has no later `markDelivered` to do it.
        deliveredAt: commentAutomationEventModel.deliveredAt,
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
    } else {
      // Cleared, not merely left behind. An AI reply that records a failure and
      // later settles to `sent` would otherwise keep a non-null `failedAt`, and
      // `buildEventFilter("message:failed")` selects on exactly that — so a
      // reply that succeeded would still be listed under Failed, and a later
      // discard would decrement `failedCount` for a failure no longer counted.
      // Mirrors what markDelivered already does.
      assignments.push(sql`"failedAt" = NULL`)
    }
    if (input.replyText !== undefined) {
      assignments.push(sql`"replyText" = ${input.replyText}`)
    }
    if (input.errorDetail !== undefined) {
      assignments.push(sql`"errorDetail" = ${input.errorDetail}`)
    }

    const result = await db.execute(sql`
      UPDATE "CommentAutomationEvent"
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
   * the agent to answer). `CommentAutomationEvent` only ever counts work the
   * automation actually attempted — see the partial's docblock — so a skip must
   * leave no row at all rather than a `failed` one that floods Error Logs.
   */
  async deleteEvent(input: {
    automationId: string
    commentId: string
    replyChannel: string
  }): Promise<DeletedEventRow[]> {
    const event = commentAutomationEventModel

    // Query builder, like `getContacts`: this returns timestamps, and a raw
    // `db.execute` would hand them back unmapped for a hand-written cast to
    // misdescribe as `Date`.
    return await db
      .delete(event)
      .where(
        and(
          eq(event.automationId, input.automationId),
          eq(event.commentId, input.commentId),
          sql`${event.replyChannel} = ${input.replyChannel}::"commentAutomationReplyChannel"`,
        ),
      )
      .returning({
        automationId: event.automationId,
        status: event.status,
        deliveredAt: event.deliveredAt,
        seenAt: event.seenAt,
        clickedAt: event.clickedAt,
        failedAt: event.failedAt,
      })
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
        FROM "CommentAutomationEvent"
        WHERE "automationId" = ${input.automationId}
          AND "commentId" = ${input.commentId}
          AND "replyChannel" = ${input.replyChannel}::"commentAutomationReplyChannel"
          AND "deliveredAt" IS NULL
      )
      UPDATE "CommentAutomationEvent" event
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
   * Served by `CommentAutomationEvent_private_unseen_idx` — this runs for
   * EVERY read receipt on the platform, so the predicate must match that index
   * exactly.
   *
   * `"deliveredAt" <= input."occurredAt"` is what keeps the watermark honest. A
   * receipt says "everything up to T has been read", so a reply delivered AFTER
   * T cannot be one of them — a receipt for an older DM would otherwise mark a
   * reply the contact has not opened, inflating `seenCount` and showing the
   * drill-down a read time earlier than the send time.
   */
  async markSeenForContactInboxes(
    items: { contactInboxId: string; occurredAt: Date }[],
  ): Promise<{ automationId: string }[]> {
    if (items.length === 0) {
      return []
    }

    const values = items.map(
      (item) =>
        sql`(${item.contactInboxId}::bigint, ${item.occurredAt.toISOString()}::timestamptz)`,
    )

    const result = await db.execute(sql`
      WITH input("contactInboxId", "occurredAt") AS (
        VALUES ${sql.join(values, sql`, `)}
      )
      UPDATE "CommentAutomationEvent" event
      SET "seenAt" = input."occurredAt",
          "updatedAt" = NOW()
      FROM input
      WHERE event."contactInboxId" = input."contactInboxId"
        AND event."replyChannel" = 'private'
        AND event."deliveredAt" IS NOT NULL
        AND event."seenAt" IS NULL
        AND event."deliveredAt" <= input."occurredAt"
      RETURNING event."automationId"::text AS "automationId"
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
   *
   * `replyChannel = 'private'` for the same reason `markSeenForContactInboxes`
   * carries it — the counters measure the DM only. Easy to miss here:
   * `executePublicReply` deliberately stamps `metadata.commentAutomationId` on
   * a PUBLIC flow reply's buttons too, so without this predicate a tap under
   * the post would still move `clickedCount`.
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
          FROM "CommentAutomationEvent" event
          WHERE event."automationId" = input."automationId"
            AND event."contactInboxId" = input."contactInboxId"
            AND event."replyChannel" = 'private'
            AND event."clickedAt" IS NULL
          ORDER BY event."occurredAt" DESC
          LIMIT 1
        ) candidate
      )
      UPDATE "CommentAutomationEvent" event
      SET "clickedAt" = targets."occurredAt", "updatedAt" = NOW()
      FROM targets
      WHERE event."id" = targets."id"
        -- Repeated from the LATERAL on purpose, exactly as markDelivered
        -- does: this is the predicate Postgres re-checks after taking the row
        -- lock. Without it two clicks arriving at once both snapshot the same
        -- unclicked row, both UPDATEs succeed, and one click is counted twice.
        AND event."clickedAt" IS NULL
      RETURNING event."automationId"::text AS "automationId"
    `)

    return result.rows as { automationId: string }[]
  }

  /**
   * Applies the lifetime counter deltas on `CommentAutomation` in one
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
        sql`(${automationId}::bigint, ${fields.sentCount ?? 0}::int, ${fields.deliveredCount ?? 0}::int, ${fields.seenCount ?? 0}::int, ${fields.clickedCount ?? 0}::int, ${fields.failedCount ?? 0}::int, ${fields.missedCount ?? 0}::int)`,
    )

    await db.execute(sql`
      UPDATE "CommentAutomation" automation
      SET "sentCount" = GREATEST(0, automation."sentCount" + delta."sent"),
          "deliveredCount" = GREATEST(0, automation."deliveredCount" + delta."delivered"),
          "seenCount" = GREATEST(0, automation."seenCount" + delta."seen"),
          "clickedCount" = GREATEST(0, automation."clickedCount" + delta."clicked"),
          "failedCount" = GREATEST(0, automation."failedCount" + delta."failed"),
          "missedCount" = GREATEST(0, automation."missedCount" + delta."missed")
      FROM (VALUES ${sql.join(rows, sql`, `)})
        AS delta("id", "sent", "delivered", "seen", "clicked", "failed", "missed")
      WHERE automation."id" = delta."id"
    `)
  }

  /**
   * One page of the drill-down dialog: ONE ROW PER EVENT, newest first. The
   * same contact appears as many times as it has events for this column — a
   * contact who commented on Monday and Thursday is two rows with two times.
   *
   * That is why each row carries the event id as `rowKey`: `StatsContactsDialog`
   * de-duplicates and keys its list by it, and keying by `contactId` (as the
   * broadcast list can, being unique per contact) would silently drop every
   * repeat occurrence on the second page onward.
   *
   * Rows with no `contactInboxId` are excluded: they predate this column or
   * lost it to a `ContactInbox` delete, and the dialog has nothing to render
   * without one.
   *
   * One `replyChannel`, chosen by the caller to match the counters this dialog
   * drills into — the DM on a channel that has one, the public comment reply on
   * a channel that does not (see `countsTowardStats`). Not cosmetic, and never
   * "both": leave the filter out and the dialog lists more rows than the column
   * it opened from claims, and "select all" tags people the column never
   * counted.
   */
  async getContacts(input: {
    workspaceId: string
    automationId: string
    eventType: MessageEventType
    replyChannel: string
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    events: (ContactEventData & { rowKey: string })[]
    contactTotal: number
  }> {
    const { workspaceId, automationId, eventType, page, perPage } = input
    const offset = (page - 1) * perPage
    const { condition, orderColumn } = this.buildEventFilter(eventType)
    const event = commentAutomationEventModel

    const scope = and(
      eq(event.workspaceId, workspaceId),
      eq(event.automationId, automationId),
      eq(event.replyChannel, input.replyChannel),
      isNotNull(event.contactInboxId),
      // Matches `contactTotal` below, which counts DISTINCT contactId and so
      // ignores NULLs, and `getContactIdsPage`, which filters the same way.
      // `contactId` is ON DELETE SET NULL, so without this a deleted contact's
      // events are still listed while being counted by neither — the dialog
      // shows more rows than "select all" promises to tag.
      isNotNull(event.contactId),
      condition,
    )

    // The query builder, not `db.execute(sql...)` like the panels above: those
    // return text/counts, this returns timestamps. Raw execute hands back the
    // driver's own values with no column mapping, so the timestamps arrive as
    // strings — and `getOccurredAt` calls `.toISOString()` on them. A
    // hand-written `as` cast is what let that lie compile; selecting through
    // the model makes the row type real.
    // `contactTotal` counts PEOPLE while the rows count occurrences. Tagging
    // acts on contacts, so "select all" must promise the number it will really
    // tag — 5 rows from 2 commenters is 2 tags, not 5.
    const [rows, contactTotals] = await Promise.all([
      db
        .select({
          id: event.id,
          contactInboxId: event.contactInboxId,
          contactId: event.contactId,
          deliveredAt: event.deliveredAt,
          seenAt: event.seenAt,
          clickedAt: event.clickedAt,
          failedAt: event.failedAt,
          errorDetail: event.errorDetail,
        })
        .from(event)
        .where(scope)
        // `event.id` breaks ties. The order column is a timestamp, and a burst
        // of replies to one post routinely shares one to the millisecond —
        // LIMIT/OFFSET over an unstable order then re-returns a row on the next
        // page and drops another. `appendContacts` in the dialog discards the
        // repeat as a duplicate rowKey, so the dropped row is simply never
        // rendered and the list silently comes up short.
        .orderBy(sql`${orderColumn} DESC NULLS LAST, ${event.id} DESC`)
        .limit(perPage)
        .offset(offset),
      db
        .select({ total: countDistinct(event.contactId) })
        .from(event)
        .where(scope),
    ])

    const contactInboxIds: string[] = []
    const events: (ContactEventData & { rowKey: string })[] = []

    for (const row of rows) {
      if (!row.contactInboxId) {
        continue
      }
      contactInboxIds.push(row.contactInboxId)
      events.push({
        rowKey: row.id,
        contactId: row.contactId ?? "",
        contactInboxId: row.contactInboxId,
        occurredAt: this.getOccurredAt(row, eventType),
        errorContent: row.errorDetail ?? undefined,
      })
    }

    return {
      contactInboxIds,
      events,
      contactTotal: contactTotals[0]?.total ?? 0,
    }
  }

  /** Keyset page of contact ids for the bulk-tag worker. One `replyChannel`,
   * the same one `getContacts` listed — this is what "select all" acts on. */
  async getContactIdsPage(input: {
    workspaceId: string
    automationId: string
    eventType: MessageEventType
    replyChannel: string
    cursor: string | null
    limit: number
    excludeContactIds?: string[]
  }): Promise<{ id: string; contactId: string }[]> {
    const { condition } = this.buildEventFilter(input.eventType)
    const event = commentAutomationEventModel

    const rows = await db
      .selectDistinct({ contactId: event.contactId })
      .from(event)
      .where(
        and(
          eq(event.workspaceId, input.workspaceId),
          eq(event.automationId, input.automationId),
          eq(event.replyChannel, input.replyChannel),
          isNotNull(event.contactId),
          condition,
          input.cursor ? gt(event.contactId, input.cursor) : undefined,
          input.excludeContactIds?.length
            ? notInArray(event.contactId, input.excludeContactIds)
            : undefined,
        ),
      )
      .orderBy(event.contactId)
      .limit(input.limit)

    return rows
      .filter((row) => row.contactId !== null)
      .map((row) => ({
        id: row.contactId as string,
        contactId: row.contactId as string,
      }))
  }

  /**
   * Event type → row predicate. `message:sent` is every attempt, which is why
   * it reads as "delivered or failed" rather than a column of its own — the
   * same derivation `BroadcastStatsRepository.buildEventFilter` uses. A row
   * that is neither yet (an AI reply still generating) is deliberately out.
   *
   * Says nothing about the channel: both callers add `private` to their own
   * scope, so this stays purely about the outcome.
   */
  private buildEventFilter(eventType: MessageEventType) {
    const event = commentAutomationEventModel
    switch (eventType) {
      case "message:delivered":
        return {
          condition: isNotNull(event.deliveredAt),
          orderColumn: event.deliveredAt,
        }
      case "message:seen":
        return { condition: isNotNull(event.seenAt), orderColumn: event.seenAt }
      case "message:failed":
        return {
          condition: isNotNull(event.failedAt),
          orderColumn: event.failedAt,
        }
      case "flow:clicked":
        return {
          condition: isNotNull(event.clickedAt),
          orderColumn: event.clickedAt,
        }
      default:
        return {
          condition: or(
            isNotNull(event.deliveredAt),
            isNotNull(event.failedAt),
          ),
          orderColumn: sql`COALESCE(${event.deliveredAt}, ${event.failedAt})`,
        }
    }
  }

  /**
   * Monthly buckets, for a range too wide to draw a point per day. The key
   * stays a full `YYYY-MM-01` date rather than `YYYY-MM` so the client can
   * parse it with the same call it uses for a daily key.
   */
  private async getRepliesByMonth(
    input: RangeInput & { timezone: string },
  ): Promise<{ dateReport: string; count: number }[]> {
    const { workspaceId, automationId, startDate, endDate, timezone } = input

    const result = await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', ("occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)})::date), 'YYYY-MM-01') AS "dateReport",
        COUNT(*)::int AS count
      FROM "CommentAutomationEvent"
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
   * Replies per bucket. `granularity` is passed in rather than derived here so
   * the service's zero-fill and this query cannot disagree about the bucket
   * width — see `resolveRangeGranularity`.
   */
  async getRepliesByDate(
    input: RangeInput & { timezone: string; granularity?: RangeGranularity },
  ): Promise<{ dateReport: string; count: number }[]> {
    const { workspaceId, automationId, startDate, endDate, timezone } = input

    if (input.granularity === "month") {
      return await this.getRepliesByMonth(input)
    }

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
      FROM "CommentAutomationEvent"
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
      FROM "CommentAutomationEvent"
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
      FROM "CommentAutomationEvent"
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
      FROM "CommentAutomationEvent"
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
