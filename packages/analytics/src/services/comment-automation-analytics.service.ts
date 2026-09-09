import { db } from "@chatbotx.io/database/client"
import type {
  CommentAutomationEventStatus,
  CommentAutomationReplyChannel,
  FBCommentReplyType,
} from "@chatbotx.io/database/partials"
import type { FBCommentAutomationEventInsert } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../lib/logger"
import { iterateTzDays } from "../lib/time-series"
import { commentAutomationStatsRepository } from "../repositories/postgres/comment-automation-stats.repository"
import type {
  CommentAutomationErrorRow,
  CommentAutomationListInput,
  CommentAutomationStatsInput,
  CommentAutomationTimeseriesRow,
  ListCommentAutomationErrorsResponse,
  ListCommentAutomationTextTotalsResponse,
} from "../schemas/comment-automation"

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
}

const emptyList = (page: number) => ({
  data: [],
  total: 0,
  page,
  pageCount: 0,
})

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
      }
      await commentAutomationStatsRepository.insertEvents([row])
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
      await commentAutomationStatsRepository.settleEvent({
        automationId: input.automationId,
        commentId: input.commentId,
        replyChannel: input.replyChannel,
        status: input.status,
        replyText: input.replyText ?? null,
        errorDetail:
          input.errorDetail?.slice(0, MAX_ERROR_DETAIL_LENGTH) ?? null,
      })
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
