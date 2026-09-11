import { channelTypes } from "@chatbotx.io/database/partials"
import {
  flowEventTypeSchema,
  messageEventTypeSchema,
} from "@chatbotx.io/flow-config"
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

// ---------------------------------------------------------------------------
// Delivery stats — the Sent/Delivered/Seen/Clicked/Failed columns on the
// fb-comments and ig-comments list tables.
//
// Deliberately the same event-type vocabulary as broadcast and sequences, so
// `StatsContactsDialog` and the bulk-tag pipeline stay one implementation.
// ---------------------------------------------------------------------------

/**
 * Narrower than `broadcastEventType` on purpose: only the five outcomes a
 * comment automation actually records have a column behind them.
 * `message:received` and `flow:ref` are meaningless here, and accepting them
 * would mean a request the repository has no predicate for.
 */
export const commentAutomationEventType = z.enum([
  messageEventTypeSchema.enum["message:sent"],
  messageEventTypeSchema.enum["message:delivered"],
  messageEventTypeSchema.enum["message:seen"],
  messageEventTypeSchema.enum["message:failed"],
  flowEventTypeSchema.enum["flow:clicked"],
])

export type CommentAutomationEventType = z.infer<
  typeof commentAutomationEventType
>

export const listCommentAutomationContactsRequest = z.object({
  workspaceId: z.string(),
  automationId: z.string(),
  eventType: commentAutomationEventType.optional(),
  total: z.number().optional(),
  page: z.number().default(1),
  perPage: z.number().default(20),
})

export type ListCommentAutomationContactsRequest = z.infer<
  typeof listCommentAutomationContactsRequest
>

export const commentAutomationContactData = z.object({
  contactId: z.string(),
  contactInboxId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string().nullable(),
  sourceId: z.string().nullable(),
  avatar: z.string().nullable(),
  channel: z.enum(channelTypes.enum),
  errorContent: z.string().nullable(),
  conversationId: z.string(),
  occurredAt: z.string(),
})

export type CommentAutomationContactData = z.infer<
  typeof commentAutomationContactData
>

export const listCommentAutomationContactsResponse = z.object({
  data: z.array(commentAutomationContactData),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})

export type ListCommentAutomationContactsResponse = z.infer<
  typeof listCommentAutomationContactsResponse
>

/**
 * Which lifetime counter on `FBCommentAutomation` an event type moves. The
 * event row's matching timestamp column is what gates the increment.
 */
export const commentAutomationCounterFields = [
  "sentCount",
  "deliveredCount",
  "seenCount",
  "clickedCount",
  "failedCount",
] as const

export type CommentAutomationCounterField =
  (typeof commentAutomationCounterFields)[number]

/** `automationId` → how much to add to each counter. Negative for a discard. */
export type CommentAutomationCounterDeltas = Map<
  string,
  Partial<Record<CommentAutomationCounterField, number>>
>
