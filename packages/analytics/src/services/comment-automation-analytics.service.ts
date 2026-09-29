import { db } from "@chatbotx.io/database/client"
import {
  type CommentAutomationEventStatus,
  type CommentAutomationMissReason,
  type CommentAutomationReplyChannel,
  type CommentAutomationType,
  type CommentReplyType,
  commentAutomationChannelSupportsPrivateReply,
  commentAutomationTypes,
} from "@chatbotx.io/database/partials"
import type {
  CommentAutomationEventInsert,
  CommentAutomationMissInsert,
} from "@chatbotx.io/database/types"
import type {
  FlowClickedPayload,
  MessageSeenPayload,
} from "@chatbotx.io/flow-config"
import { logDiagnostic } from "@chatbotx.io/logger"
import { createId } from "@chatbotx.io/utils"
import { toDate } from "../lib/date"
import { logger } from "../lib/logger"
import {
  iterateTzDays,
  iterateTzMonths,
  resolveRangeGranularity,
} from "../lib/time-series"
import { commentAutomationMissRepository } from "../repositories/postgres/comment-automation-miss.repository"
import { commentAutomationStatsRepository } from "../repositories/postgres/comment-automation-stats.repository"
import {
  COMMENT_AUTOMATION_MISSED_EVENT,
  type CommentAutomationCounterDeltas,
  type CommentAutomationCounterField,
  type CommentAutomationErrorRow,
  type CommentAutomationEventType,
  type CommentAutomationListInput,
  type CommentAutomationStatsInput,
  type CommentAutomationTimeseriesRow,
  type ListCommentAutomationErrorsResponse,
  type ListCommentAutomationTextTotalsResponse,
} from "../schemas/comment-automation"
import type { ContactEventData } from "../schemas/common"

/** Matches `MAX_DETAIL_LENGTH` in `packages/business/src/error-log/service.ts`
 * so an error message is truncated the same way wherever it is stored. */
const MAX_ERROR_DETAIL_LENGTH = 8192

/**
 * How many automations the channel-type memo holds before it is dropped and
 * rebuilt. Far above any one workspace's automation count, so the worker
 * resolves each id once in practice; the cap only exists so a process that has
 * been up for months cannot grow the map without bound.
 */
const CHANNEL_TYPE_CACHE_LIMIT = 5000

export type RecordCommentAutomationEventInput = {
  workspaceId: string
  automationId: string
  contactId?: string | null
  postId: string
  commentId: string
  commentText?: string | null
  replyChannel: CommentAutomationReplyChannel
  replyType: CommentReplyType
  replyText?: string | null
  status: CommentAutomationEventStatus
  errorDetail?: string | null
  httpCode?: string | null
  occurredAt: Date
  /**
   * The inbox the reply went to. Optional only because a dispatch that failed
   * before resolving one still deserves a row; without it the reply can never
   * be marked seen, since a read receipt names no automation.
   */
  contactInboxId?: string | null
  /**
   * Set when the send already completed before this row was written, which is
   * the case for a `text` private reply: it goes straight out through the
   * comment_id-anchored Send API and leaves no `Message` row for a webhook to
   * settle against later.
   *
   * Born delivered rather than delivered by a follow-up `markDelivered`,
   * because that UPDATE can only match a row that already exists — and the
   * dispatch runs *before* the insert. Settling afterwards silently matched
   * zero rows, so Delivered (and Seen, which requires `deliveredAt IS NOT
   * NULL`) stayed at zero forever.
   */
  deliveredAt?: Date | null
}

/**
 * Which half of a click's attribution is absent. `commentAutomationId` rides in
 * the button payload (encoded by each channel), `contactInboxId` is resolved
 * from the DB by `runFlowAction` — so the two go missing for entirely different
 * reasons and the log has to say which.
 */
function describeMissingAttribution(payload: FlowClickedPayload): string {
  if (!payload.action.commentAutomationId) {
    return payload.context.contactInboxId ? "commentAutomationId" : "both"
  }
  return "contactInboxId"
}

const emptyList = (page: number) => ({
  data: [],
  total: 0,
  page,
  pageCount: 0,
})

/**
 * Folds `[{ automationId }, ...]` rows returned by a conditional write into the
 * counter deltas they earned. Every caller passes rows a `WHERE <col> IS NULL`
 * clause already filtered, so counting them is what makes the lifetime counters
 * on `CommentAutomation` immune to webhook redelivery and BullMQ retries.
 */
function tallyCounters(
  rows: { automationId: string }[],
  field: CommentAutomationCounterField,
  deltas: CommentAutomationCounterDeltas = new Map(),
): CommentAutomationCounterDeltas {
  for (const row of rows) {
    const current = deltas.get(row.automationId) ?? {}
    current[field] = (current[field] ?? 0) + 1
    deltas.set(row.automationId, current)
  }
  return deltas
}

/**
 * Whether a reply moves the lifetime counters at all.
 *
 * On a channel that HAS a comment-anchored DM the stats measure the DM, not the
 * comment reply: Meta reports no delivery receipt for a public comment reply, it
 * has no reader, and counting it dilutes every rate on the list — they are all
 * measured against `sentCount`, so one comment answered on both channels would
 * halve its own Seen percentage.
 *
 * On a channel that has NO DM (Threads) that same rule left every
 * counter — Replies included — pinned at zero for an automation that was
 * replying perfectly well, and the Misses column measuring itself against
 * nothing but its own misses. There is no DM to dilute, so the public reply IS
 * the reply and counts: sent at dispatch, delivered when the channel accepts it,
 * failed when it does not. Seen and Clicked stay structurally zero there — a
 * comment reply has no read receipt and carries no button — which is why those
 * two columns are hidden from those channels' list tables rather than shown
 * empty.
 *
 * Scoped to the channel's capability, never to the individual automation's
 * configuration: a Messenger automation that happens to reply publicly only
 * still reads zero, exactly as before. The same now applies to TikTok, which
 * gained a comment-anchored DM with Comment-to-Message — its counters moved
 * from the public reply to the DM, so a TikTok automation with no private
 * branch reads zero where it used to show its public replies.
 *
 * Public rows are WRITTEN on every channel regardless — the per-automation
 * analytics page (Bot replies, Error Logs, the replies chart) reads them.
 */
function countsTowardStats(
  replyChannel: CommentAutomationReplyChannel,
  channelType: CommentAutomationType | null,
): boolean {
  if (replyChannel === "private") {
    return true
  }
  return (
    channelType !== null &&
    !commentAutomationChannelSupportsPrivateReply(channelType)
  )
}

/**
 * Reverses what a discarded row had already been counted as. `discardEvent`
 * exists for an async job that turned out to be a deliberate skip, so the
 * attempt it opened must leave no trace in the counters either.
 */
function tallyDiscard(
  rows: {
    automationId: string
    status: string
    deliveredAt: Date | null
    seenAt: Date | null
    clickedAt: Date | null
    failedAt: Date | null
  }[],
): CommentAutomationCounterDeltas {
  const deltas: CommentAutomationCounterDeltas = new Map()
  for (const row of rows) {
    const current = deltas.get(row.automationId) ?? {}
    current.sentCount = (current.sentCount ?? 0) - 1
    if (row.deliveredAt) {
      current.deliveredCount = (current.deliveredCount ?? 0) - 1
    }
    if (row.seenAt) {
      current.seenCount = (current.seenCount ?? 0) - 1
    }
    if (row.clickedAt) {
      current.clickedCount = (current.clickedCount ?? 0) - 1
    }
    if (row.failedAt || row.status === "failed") {
      current.failedCount = (current.failedCount ?? 0) - 1
    }
    deltas.set(row.automationId, current)
  }
  return deltas
}

export class CommentAutomationAnalyticsService {
  /**
   * `CommentAutomation.id → type`, memoised for the life of the process.
   *
   * Every counter write has to know the automation's channel (see
   * `countsTowardStats`) and most of them cannot be told: `markDelivered` and
   * `settleEvent` are called from the chat worker through the message anchor,
   * which names the automation and nothing else. Resolving it here rather than
   * threading a `channelType` through four queues keeps one mechanism for all
   * of them, and keeps a legacy in-flight job — whose payload predates any new
   * field — counting correctly.
   *
   * Safe to memoise without invalidation because `type` is written once at
   * create (`commentAutomationService.create`) and is only ever read as a WHERE
   * scope afterwards: no code path moves an automation between channels, and
   * one that did would be changing which feature owns the row. The map is
   * cleared wholesale past {@link CHANNEL_TYPE_CACHE_LIMIT} rather than kept
   * exact — it is a lookup saver, not a source of truth.
   */
  private readonly channelTypeById = new Map<string, CommentAutomationType>()

  /**
   * The automation's channel, or `null` when the row is gone — a delete racing
   * an in-flight reply. A `null` counts as it did before this lookup existed
   * (a public reply: not at all), which is also why the value is parsed rather
   * than cast: an unreadable `type` must fall back to the old behaviour, never
   * to "no DM, so count the public reply".
   */
  private async resolveChannelType(
    automationId: string,
  ): Promise<CommentAutomationType | null> {
    const cached = this.channelTypeById.get(automationId)
    if (cached) {
      return cached
    }
    const row = await db.query.commentAutomationModel.findFirst({
      where: { id: automationId },
      columns: { type: true },
    })
    const parsed = commentAutomationTypes.safeParse(row?.type)
    if (!parsed.success) {
      return null
    }
    if (this.channelTypeById.size >= CHANNEL_TYPE_CACHE_LIMIT) {
      this.channelTypeById.clear()
    }
    this.channelTypeById.set(automationId, parsed.data)
    return parsed.data
  }

  /** {@link countsTowardStats}, with the channel resolved for the caller. */
  private async replyCountsTowardStats(input: {
    automationId: string
    replyChannel: CommentAutomationReplyChannel
  }): Promise<boolean> {
    if (input.replyChannel === "private") {
      return true
    }
    return countsTowardStats(
      input.replyChannel,
      await this.resolveChannelType(input.automationId),
    )
  }

  /**
   * The automation must belong to the workspace before any stat query runs —
   * same guard `listLinkContactStats` applies with `verifyLink`, so an id from
   * another workspace returns empty instead of leaking rows.
   */
  private async automationExists(input: {
    workspaceId: string
    automationId: string
  }): Promise<boolean> {
    if (!input.automationId) {
      return false
    }
    const row = await db.query.commentAutomationModel.findFirst({
      where: { id: input.automationId, workspaceId: input.workspaceId },
      columns: { id: true },
    })
    return Boolean(row)
  }

  /**
   * Never throws: a failed analytics write must not take down the reply the
   * customer is waiting on. The caller runs inside the comment-automation loop.
   */
  async recordEvent(input: RecordCommentAutomationEventInput): Promise<void> {
    try {
      const row: CommentAutomationEventInsert = {
        id: createId(),
        workspaceId: input.workspaceId,
        automationId: input.automationId,
        contactId: input.contactId ?? null,
        postId: input.postId,
        commentId: input.commentId,
        commentText: input.commentText ?? null,
        replyChannel: input.replyChannel,
        replyType: input.replyType,
        replyText: input.replyText ?? null,
        status: input.status,
        errorDetail:
          input.errorDetail?.slice(0, MAX_ERROR_DETAIL_LENGTH) ?? null,
        httpCode: input.httpCode ?? null,
        occurredAt: input.occurredAt,
        contactInboxId: input.contactInboxId ?? null,
        // A dispatch that never reached the channel is failed from birth; the
        // timestamp is now, not `occurredAt` (which is when the customer
        // commented, up to an hour earlier under `replyAfter`).
        failedAt: input.status === "failed" ? new Date() : null,
        // Likewise a send that already completed is delivered from birth — see
        // `deliveredAt` on the input type for why this cannot be a later
        // UPDATE.
        deliveredAt: input.deliveredAt ?? null,
      }
      // The row is written for BOTH channels — the analytics page reads public
      // rows — but only a private reply moves the counters.
      const inserted = await commentAutomationStatsRepository.insertEvents([
        row,
      ])
      // The exact tuple a later click has to match: `markClickedForAutomationContacts`
      // looks for (automationId, contactInboxId) with `replyChannel = 'private'`
      // and `clickedAt IS NULL`. A NULL contactInboxId or a `public` channel
      // here means no tap can ever be attributed to this reply.
      logDiagnostic(
        logger,
        () => ({
          automationId: row.automationId,
          commentId: row.commentId,
          replyChannel: row.replyChannel,
          replyType: row.replyType,
          contactInboxId: row.contactInboxId,
          contactId: row.contactId,
          status: row.status,
          deliveredAt: row.deliveredAt,
          insertedCount: inserted.length,
        }),
        "[analytics:commentAutomation] event row written",
      )
      if (
        !(await this.replyCountsTowardStats({
          automationId: input.automationId,
          replyChannel: input.replyChannel,
        }))
      ) {
        return
      }
      // `sentCount` counts attempts, so every row that actually landed moves
      // it — including one born `failed`, exactly as broadcast's
      // `sent = delivered + failed` derivation does.
      const deltas = tallyCounters(inserted, "sentCount")
      tallyCounters(
        inserted.filter((event) => event.status === "failed"),
        "failedCount",
        deltas,
      )
      // A row born delivered counts its delivery here for the same reason a row
      // born failed counts its failure here: the only conditional write that
      // could have counted it — `markDelivered` — runs against a row that did
      // not exist yet when the send completed.
      tallyCounters(
        inserted.filter((event) => Boolean(event.deliveredAt)),
        "deliveredCount",
        deltas,
      )
      await commentAutomationStatsRepository.incrementCounters(deltas)
    } catch (err) {
      logger.warn(
        {
          err,
          automationId: input.automationId,
          commentId: input.commentId,
          replyChannel: input.replyChannel,
        },
        "[analytics:commentAutomation] failed to record event",
      )
    }
  }

  /**
   * Lands the outcome of an async reply on the row its dispatch already wrote.
   * Also never throws, for the same reason as `recordEvent`.
   *
   * Partial by design: an omitted `replyText`/`errorDetail` leaves that column
   * as dispatch wrote it, so flipping a row to `failed` keeps the text the send
   * was carrying. Pass `null` explicitly to clear one.
   */
  async settleEvent(input: {
    automationId: string
    commentId: string
    replyChannel: CommentAutomationReplyChannel
    status: CommentAutomationEventStatus
    replyText?: string | null
    errorDetail?: string | null
  }): Promise<void> {
    try {
      const settled = await commentAutomationStatsRepository.settleEvent({
        automationId: input.automationId,
        commentId: input.commentId,
        replyChannel: input.replyChannel,
        status: input.status,
        ...(input.replyText === undefined
          ? {}
          : { replyText: input.replyText }),
        ...(input.errorDetail === undefined
          ? {}
          : {
              errorDetail:
                input.errorDetail?.slice(0, MAX_ERROR_DETAIL_LENGTH) ?? null,
            }),
      })
      // Only a settle that actually flipped the row counts: `settleEvent`
      // refuses a second failure, so `failedCount` moves once per reply.
      // Settling back to `sent` (an AI reply landing its text) changes no
      // counter — the attempt was already counted at dispatch. A public row
      // still flips to `failed` above so Error Logs can explain it; it just
      // never reaches the counters.
      if (
        input.status === "failed" &&
        (await this.replyCountsTowardStats({
          automationId: input.automationId,
          replyChannel: input.replyChannel,
        }))
      ) {
        await commentAutomationStatsRepository.incrementCounters(
          tallyCounters(settled, "failedCount"),
        )
      }
    } catch (err) {
      logger.warn(
        {
          err,
          automationId: input.automationId,
          commentId: input.commentId,
          replyChannel: input.replyChannel,
        },
        "[analytics:commentAutomation] failed to settle event",
      )
    }
  }

  /**
   * Removes the row a dispatch opened when the async job turned out to be a
   * deliberate skip, not a failure. Same never-throws contract as the writes
   * above: losing a discard leaves a stale row, which must not take down the
   * job that decided to skip.
   */
  async discardEvent(input: {
    automationId: string
    commentId: string
    replyChannel: CommentAutomationReplyChannel
  }): Promise<void> {
    try {
      const deleted = await commentAutomationStatsRepository.deleteEvent(input)
      // A public row on a DM channel is dropped just the same — it simply has
      // nothing counted to unwind.
      if (
        !(await this.replyCountsTowardStats({
          automationId: input.automationId,
          replyChannel: input.replyChannel,
        }))
      ) {
        return
      }
      await commentAutomationStatsRepository.incrementCounters(
        tallyDiscard(deleted),
      )
    } catch (err) {
      logger.warn(
        {
          err,
          automationId: input.automationId,
          commentId: input.commentId,
          replyChannel: input.replyChannel,
        },
        "[analytics:commentAutomation] failed to discard event",
      )
    }
  }

  /**
   * The channel accepted the send. Called straight from the dispatch sites
   * rather than off an event-bus subscription, because the acknowledgement is
   * synchronous everywhere it matters: the Send API returns before the job
   * ends, and a public comment reply gets no delivery webhook from Meta at all.
   *
   * Same never-throws contract as `recordEvent`.
   */
  async markDelivered(input: {
    automationId: string
    commentId: string
    replyChannel: CommentAutomationReplyChannel
    occurredAt?: Date
  }): Promise<void> {
    try {
      // `deliveredAt` is stamped on a public row too: it is the row's honest
      // state, and it is the guard `settleEvent` reads to refuse failing a
      // reply the customer already received.
      const marked = await commentAutomationStatsRepository.markDelivered({
        automationId: input.automationId,
        commentId: input.commentId,
        replyChannel: input.replyChannel,
        occurredAt: input.occurredAt ?? new Date(),
      })
      if (
        !(await this.replyCountsTowardStats({
          automationId: input.automationId,
          replyChannel: input.replyChannel,
        }))
      ) {
        return
      }
      const deltas = tallyCounters(marked, "deliveredCount")
      // A step that failed before a later one landed had already been counted.
      // The reply arrived, so take that failure back out.
      for (const row of marked) {
        if (!row.clearedFailure) {
          continue
        }
        const current = deltas.get(row.automationId) ?? {}
        current.failedCount = (current.failedCount ?? 0) - 1
        deltas.set(row.automationId, current)
      }
      await commentAutomationStatsRepository.incrementCounters(deltas)
    } catch (err) {
      logger.warn(
        {
          err,
          automationId: input.automationId,
          commentId: input.commentId,
          replyChannel: input.replyChannel,
        },
        "[analytics:commentAutomation] failed to mark delivered",
      )
    }
  }

  /**
   * Read receipt. Unlike every other outcome this cannot be settled at the
   * dispatch site — it arrives minutes or hours later on a webhook that names
   * only the inbox, so the lookup runs the other way round. Private DMs only:
   * a public comment reply has no reader.
   */
  async onSeen(payloads: MessageSeenPayload[]): Promise<void> {
    const latestByInbox = new Map<string, Date>()
    for (const payload of payloads) {
      const contactInboxId = payload.context.contactInboxId
      if (!contactInboxId) {
        continue
      }
      const occurredAt = toDate(payload.occurredAt)
      const current = latestByInbox.get(contactInboxId)
      if (!current || occurredAt > current) {
        latestByInbox.set(contactInboxId, occurredAt)
      }
    }

    if (latestByInbox.size === 0) {
      return
    }

    try {
      const marked =
        await commentAutomationStatsRepository.markSeenForContactInboxes(
          [...latestByInbox].map(([contactInboxId, occurredAt]) => ({
            contactInboxId,
            occurredAt,
          })),
        )
      await commentAutomationStatsRepository.incrementCounters(
        tallyCounters(marked, "seenCount"),
      )
    } catch (err) {
      logger.warn(
        { err, contactInboxIds: [...latestByInbox.keys()] },
        "[analytics:commentAutomation] failed to mark seen",
      )
    }
  }

  /**
   * A link or button in a `flow` reply was tapped. Only flow replies can be
   * tracked: the attribution rides in `encodeButtonPayload`, and a plain text
   * reply carries no button and no magic link to attach it to.
   */
  async onClicked(payloads: FlowClickedPayload[]): Promise<void> {
    // Both outcomes below are silent drops, so a click that never reaches
    // `clickedCount` used to look exactly like one that did.
    const dropped = payloads.filter(
      (p) => !(p.action.commentAutomationId && p.context.contactInboxId),
    )
    if (dropped.length > 0) {
      // `warn`, not a diagnostic: a tap that cannot be attributed to anything
      // is always worth seeing, including in production.
      logger.warn(
        {
          dropped: dropped.map((p) => ({
            missing: describeMissingAttribution(p),
            flowId: p.action.flowId,
            buttonId: p.action.buttonId,
            channel: p.context.channel,
          })),
        },
        "[analytics:commentAutomation] click dropped before lookup — payload carries no attribution",
      )
    }

    const items = payloads
      .filter((p) => p.action.commentAutomationId && p.context.contactInboxId)
      .map((p) => ({
        automationId: p.action.commentAutomationId as string,
        contactInboxId: p.context.contactInboxId as string,
        occurredAt: toDate(p.occurredAt),
      }))

    if (items.length === 0) {
      return
    }

    try {
      const marked =
        await commentAutomationStatsRepository.markClickedForAutomationContacts(
          items,
        )

      if (marked.length === 0) {
        // The attribution was there but no row answered to it. Means no
        // `CommentAutomationEvent` with this (automationId, contactInboxId)
        // that is `replyChannel = 'private'` and still has `clickedAt IS NULL`.
        logger.warn(
          {
            items: items.map((item) => ({
              automationId: item.automationId,
              contactInboxId: item.contactInboxId,
            })),
          },
          "[analytics:commentAutomation] click matched no event row — nothing counted",
        )
      } else {
        logDiagnostic(
          logger,
          () => ({
            markedCount: marked.length,
            automationIds: marked.map((row) => row.automationId),
          }),
          "[analytics:commentAutomation] click marked",
        )
      }

      await commentAutomationStatsRepository.incrementCounters(
        tallyCounters(marked, "clickedCount"),
      )
    } catch (err) {
      logger.warn(
        { err, automationIds: items.map((item) => item.automationId) },
        "[analytics:commentAutomation] failed to mark clicked",
      )
    }
  }

  /**
   * Records the comments this run declined to answer, in one insert.
   *
   * Never throws, same contract as `recordEvent`: the caller is the comment
   * automation loop, and bookkeeping must not take down the reply a customer
   * is waiting on.
   *
   * `missedCount` moves per row `insertMisses` actually returned, never per row
   * passed in — `onConflictDoNothing` on `(automationId, commentId)` makes a
   * BullMQ retry or a redelivered webhook write nothing and count nothing.
   */
  async recordMisses(rows: CommentAutomationMissInsert[]): Promise<void> {
    if (rows.length === 0) {
      return
    }
    try {
      const inserted = await commentAutomationMissRepository.insertMisses(rows)
      await commentAutomationStatsRepository.incrementCounters(
        tallyCounters(inserted, "missedCount"),
      )
    } catch (err) {
      logger.warn(
        {
          err,
          automationIds: [...new Set(rows.map((row) => row.automationId))],
          commentId: rows[0]?.commentId,
        },
        "[analytics:commentAutomation] failed to record misses",
      )
    }
  }

  /**
   * One page of the drill-down dialog behind a stat column. Workspace-scoped
   * through the same `automationExists` guard every other read uses, so an id
   * from another workspace returns empty rather than leaking rows.
   *
   * `comment:missed` is served by a different table — see
   * `CommentAutomationMissRepository` — so it is routed out here rather than
   * reaching `buildEventFilter`, which has no predicate for it.
   */
  async getContacts(input: {
    workspaceId: string
    automationId: string
    eventType: CommentAutomationEventType
    page: number
    perPage: number
  }): Promise<{
    contactInboxIds: string[]
    /**
     * `commentText`/`missReason` are present only on `comment:missed` rows —
     * declared optional here so the one API handler can map both shapes without
     * narrowing on the event type a second time.
     */
    events: (ContactEventData & {
      rowKey: string
      commentText?: string | null
      missReason?: CommentAutomationMissReason | null
    })[]
    /**
     * Distinct CONTACTS behind those rows. Tagging is per contact, so this —
     * not the row count — is what "select all" is allowed to promise.
     */
    contactTotal: number
  }> {
    const exists = await this.automationExists(input)
    if (!exists) {
      return { contactInboxIds: [], events: [], contactTotal: 0 }
    }
    if (input.eventType === COMMENT_AUTOMATION_MISSED_EVENT) {
      return await commentAutomationMissRepository.getMissContacts(input)
    }
    return await commentAutomationStatsRepository.getContacts({
      ...input,
      eventType: input.eventType,
      replyChannel: await this.resolveCountedReplyChannel(input.automationId),
    })
  }

  /**
   * Which half of the comment the counters behind the drill-down were taken
   * from, so the dialog lists exactly the rows its column counted — the DM on a
   * channel that has one, the public comment reply on a channel that does not.
   * Exactly one of the two per automation, because `countsTowardStats` counts
   * exactly one of them.
   */
  private async resolveCountedReplyChannel(
    automationId: string,
  ): Promise<CommentAutomationReplyChannel> {
    const channelType = await this.resolveChannelType(automationId)
    return channelType &&
      !commentAutomationChannelSupportsPrivateReply(channelType)
      ? "public"
      : "private"
  }

  /**
   * Keyset page of contact ids, for the bulk-tag worker. Routes
   * `comment:missed` to its own table for the same reason `getContacts` does,
   * so "select all" in the Misses dialog tags the people it listed.
   */
  async getContactIdsPage(input: {
    workspaceId: string
    automationId: string
    eventType: CommentAutomationEventType
    cursor: string | null
    limit: number
    excludeContactIds?: string[]
  }): Promise<{ id: string; contactId: string }[]> {
    if (input.eventType === COMMENT_AUTOMATION_MISSED_EVENT) {
      return await commentAutomationMissRepository.getMissContactIdsPage(input)
    }
    return await commentAutomationStatsRepository.getContactIdsPage({
      ...input,
      eventType: input.eventType,
      // The same half the dialog listed — "select all" must tag the people it
      // showed, so this cannot be decided differently from `getContacts`.
      replyChannel: await this.resolveCountedReplyChannel(input.automationId),
    })
  }

  /**
   * Reply counts with empty buckets filled in, so the area chart draws a
   * continuous line instead of skipping over quiet stretches.
   *
   * The date filter on this dashboard is unbounded — only failed rows are ever
   * purged — so a `lifeTime` range can span years. Past 60 days the series
   * switches to monthly buckets rather than drawing a point per day; both the
   * query and this fill take the width from `resolveRangeGranularity`, so they
   * cannot disagree. A monthly bucket keeps a full `YYYY-MM-01` key, which the
   * client parses exactly like a daily one.
   */
  async getReplyStatsByDateRange(
    input: CommentAutomationStatsInput,
  ): Promise<CommentAutomationTimeseriesRow[]> {
    const exists = await this.automationExists(input)
    if (!exists) {
      return []
    }

    const from = new Date(input.startDate)
    const to = new Date(input.endDate)
    const granularity = resolveRangeGranularity(from, to)

    const rows = await commentAutomationStatsRepository.getRepliesByDate({
      ...input,
      granularity,
    })
    const byBucket = new Map(rows.map((row) => [row.dateReport, row.count]))

    const filled: CommentAutomationTimeseriesRow[] = []
    const buckets =
      granularity === "month"
        ? iterateTzMonths(from, to, input.timezone)
        : iterateTzDays(from, to, input.timezone)
    for (const { key } of buckets) {
      // `iterateTzMonths` yields `YYYY-MM`; the query groups to `YYYY-MM-01`.
      const dateReport = granularity === "month" ? `${key}-01` : key
      filled.push({ dateReport, count: byBucket.get(dateReport) ?? 0 })
    }
    return filled
  }

  async listUserComments(
    input: CommentAutomationListInput,
  ): Promise<ListCommentAutomationTextTotalsResponse> {
    const exists = await this.automationExists(input)
    if (!exists) {
      return emptyList(input.page)
    }

    const { rows, total } =
      await commentAutomationStatsRepository.getUserCommentTotals(input)
    return {
      data: rows,
      total,
      page: input.page,
      pageCount: Math.ceil(total / input.perPage),
    }
  }

  async listBotReplies(
    input: CommentAutomationListInput,
  ): Promise<ListCommentAutomationTextTotalsResponse> {
    const exists = await this.automationExists(input)
    if (!exists) {
      return emptyList(input.page)
    }

    const { rows, total } =
      await commentAutomationStatsRepository.getBotReplyTotals(input)
    return {
      data: rows,
      total,
      page: input.page,
      pageCount: Math.ceil(total / input.perPage),
    }
  }

  async listErrors(
    input: CommentAutomationListInput,
  ): Promise<ListCommentAutomationErrorsResponse> {
    const exists = await this.automationExists(input)
    if (!exists) {
      return emptyList(input.page)
    }

    const { rows, total } =
      await commentAutomationStatsRepository.getErrorEvents(input)

    // Contact names are hydrated in a second query rather than joined in the
    // raw SQL — same shape as `listLinkContactStats`.
    const contactIds = [
      ...new Set(rows.map((row) => row.contactId).filter((id) => id !== null)),
    ]
    const contacts = contactIds.length
      ? await db.query.contactModel.findMany({
          where: { id: { in: contactIds } },
          columns: { id: true, firstName: true, lastName: true, avatar: true },
        })
      : []
    const contactsById = new Map(contacts.map((c) => [c.id, c]))

    const data: CommentAutomationErrorRow[] = rows.map((row) => {
      const contact = row.contactId ? contactsById.get(row.contactId) : null
      return {
        id: row.id,
        replyChannel: row.replyChannel,
        replyType: row.replyType,
        errorDetail: row.errorDetail,
        httpCode: row.httpCode,
        commentText: row.commentText,
        contact: contact
          ? {
              firstName: contact.firstName,
              lastName: contact.lastName,
              avatar: contact.avatar,
            }
          : null,
        occurredAt: new Date(row.occurredAt).toISOString(),
      }
    })

    return {
      data,
      total,
      page: input.page,
      pageCount: Math.ceil(total / input.perPage),
    }
  }
}

export const commentAutomationAnalyticsService =
  new CommentAutomationAnalyticsService()
