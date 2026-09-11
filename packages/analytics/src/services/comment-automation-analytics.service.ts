import { db } from "@chatbotx.io/database/client"
import type {
  CommentAutomationEventStatus,
  CommentAutomationReplyChannel,
  FBCommentReplyType,
} from "@chatbotx.io/database/partials"
import type { FBCommentAutomationEventInsert } from "@chatbotx.io/database/types"
import type {
  FlowClickedPayload,
  MessageSeenPayload,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { toDate } from "../lib/date"
import { logger } from "../lib/logger"
import { iterateTzDays } from "../lib/time-series"
import type { MessageEventType } from "../repositories/postgres/base.repository"
import { commentAutomationStatsRepository } from "../repositories/postgres/comment-automation-stats.repository"
import type {
  CommentAutomationCounterDeltas,
  CommentAutomationCounterField,
  CommentAutomationErrorRow,
  CommentAutomationListInput,
  CommentAutomationStatsInput,
  CommentAutomationTimeseriesRow,
  ListCommentAutomationErrorsResponse,
  ListCommentAutomationTextTotalsResponse,
} from "../schemas/comment-automation"
import type { ContactEventData } from "../schemas/common"

/** Matches `MAX_DETAIL_LENGTH` in `packages/business/src/error-log/service.ts`
 * so an error message is truncated the same way wherever it is stored. */
const MAX_ERROR_DETAIL_LENGTH = 8192

export type RecordCommentAutomationEventInput = {
  workspaceId: string
  automationId: string
  contactId?: string | null
  postId: string
  commentId: string
  commentText?: string | null
  replyChannel: CommentAutomationReplyChannel
  replyType: FBCommentReplyType
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
 * on `FBCommentAutomation` immune to webhook redelivery and BullMQ retries.
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
    const row = await db.query.fbCommentAutomationModel.findFirst({
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
      const row: FBCommentAutomationEventInsert = {
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
      }
      const inserted = await commentAutomationStatsRepository.insertEvents([
        row,
      ])
      // `sentCount` counts attempts, so every row that actually landed moves
      // it — including one born `failed`, exactly as broadcast's
      // `sent = delivered + failed` derivation does.
      const deltas = tallyCounters(inserted, "sentCount")
      tallyCounters(
        inserted.filter((event) => event.status === "failed"),
        "failedCount",
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
      // counter — the attempt was already counted at dispatch.
      if (input.status === "failed") {
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
      const marked = await commentAutomationStatsRepository.markDelivered({
        automationId: input.automationId,
        commentId: input.commentId,
        replyChannel: input.replyChannel,
        occurredAt: input.occurredAt ?? new Date(),
      })
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
   * One page of the drill-down dialog behind a stat column. Workspace-scoped
   * through the same `automationExists` guard every other read uses, so an id
   * from another workspace returns empty rather than leaking rows.
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
    const exists = await this.automationExists(input)
    if (!exists) {
      return { contactInboxIds: [], contactEventMap: new Map() }
    }
    return await commentAutomationStatsRepository.getContacts(input)
  }

  /** Keyset page of contact ids, for the bulk-tag worker. */
  getContactIdsPage(input: {
    workspaceId: string
    automationId: string
    eventType: MessageEventType
    cursor: string | null
    limit: number
    excludeContactIds?: string[]
  }): Promise<{ id: string; contactId: string }[]> {
    return commentAutomationStatsRepository.getContactIdsPage(input)
  }

  /**
   * Daily reply counts with empty days filled in, so the area chart draws a
   * continuous line instead of skipping over quiet days.
   */
  async getReplyStatsByDateRange(
    input: CommentAutomationStatsInput,
  ): Promise<CommentAutomationTimeseriesRow[]> {
    const exists = await this.automationExists(input)
    if (!exists) {
      return []
    }

    const rows = await commentAutomationStatsRepository.getRepliesByDate(input)
    const byDay = new Map(rows.map((row) => [row.dateReport, row.count]))

    const filled: CommentAutomationTimeseriesRow[] = []
    for (const { key } of iterateTzDays(
      new Date(input.startDate),
      new Date(input.endDate),
      input.timezone,
    )) {
      filled.push({ dateReport: key, count: byDay.get(key) ?? 0 })
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
