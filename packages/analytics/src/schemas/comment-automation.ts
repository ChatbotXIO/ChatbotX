import { z } from "zod"

/**
 * How long a `FBCommentAutomationEvent` row lives. Matches `ErrorLog`'s window:
 * both tables back the same Error Logs surface, and a comment event outliving
 * the error log it pairs with would show a failure the workspace page can no
 * longer explain.
 *
 * Shared rather than local to the purge cron on purpose: the date-range filter
 * on the analytics page must not offer a window the data cannot cover. Zero-fill
 * makes a purged day look exactly like a day with no replies, so an unbounded
 * `lifeTime` preset reads as "this automation never worked".
 */
export const COMMENT_AUTOMATION_RETENTION_DAYS = 30

export const commentAutomationStatsSchema = z.object({
  workspaceId: z.string(),
  automationId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  timezone: z.string(),
})
export type CommentAutomationStatsInput = z.infer<
  typeof commentAutomationStatsSchema
>

export const commentAutomationListSchema = commentAutomationStatsSchema.extend({
  page: z.number(),
  perPage: z.number(),
  keyword: z.string().optional(),
})
export type CommentAutomationListInput = z.infer<
  typeof commentAutomationListSchema
>

export const commentAutomationTimeseriesRow = z.object({
  dateReport: z.string(),
  count: z.number(),
})
export type CommentAutomationTimeseriesRow = z.infer<
  typeof commentAutomationTimeseriesRow
>

/**
 * One grouped text bucket — a distinct customer comment, or a distinct message
 * the bot replied with, plus how many times it occurred.
 */
export const commentAutomationTextTotalRow = z.object({
  text: z.string(),
  total: z.number(),
})
export type CommentAutomationTextTotalRow = z.infer<
  typeof commentAutomationTextTotalRow
>

export const commentAutomationErrorContact = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  avatar: z.string().nullable(),
})
export type CommentAutomationErrorContact = z.infer<
  typeof commentAutomationErrorContact
>

export const commentAutomationErrorRow = z.object({
  id: z.string(),
  replyChannel: z.string(),
  replyType: z.string(),
  errorDetail: z.string().nullable(),
  httpCode: z.string().nullable(),
  commentText: z.string().nullable(),
  contact: commentAutomationErrorContact.nullable(),
  occurredAt: z.string(),
})
export type CommentAutomationErrorRow = z.infer<
  typeof commentAutomationErrorRow
>

/** Same envelope as `listFlowNodeContactsResponse`, so the store's existing
 * page/pageCount wiring works unchanged. */
export const listCommentAutomationTextTotalsResponse = z.object({
  data: z.array(commentAutomationTextTotalRow),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})
export type ListCommentAutomationTextTotalsResponse = z.infer<
  typeof listCommentAutomationTextTotalsResponse
>

export const listCommentAutomationErrorsResponse = z.object({
  data: z.array(commentAutomationErrorRow),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})
export type ListCommentAutomationErrorsResponse = z.infer<
  typeof listCommentAutomationErrorsResponse
>
