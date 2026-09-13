import {
  channelTypes,
  commentAutomationMissReasons,
} from "@chatbotx.io/database/partials"
import {
  flowEventTypeSchema,
  messageEventTypeSchema,
} from "@chatbotx.io/flow-config"
import { z } from "zod"

/**
 * How long a FAILED `FBCommentAutomationEvent` row lives. Matches `ErrorLog`'s
 * window: both tables back the same Error Logs surface, and a comment failure
 * outliving the error log it pairs with would show a failure the workspace page
 * can no longer explain.
 *
 * Retention applies to `status = 'failed'` rows ONLY — a successful reply is
 * kept forever, so the replies chart, the replies-by-date table and the
 * user-comment/bot-reply panels stay complete for the whole life of the
 * automation and the date filter is deliberately unbounded.
 *
 * Shared rather than local to the purge cron on purpose: the Error Logs panel
 * spells the window out, because that panel (and only that panel) thins out
 * past it.
 */
export const COMMENT_AUTOMATION_ERROR_RETENTION_DAYS = 30

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
 * Comment automation's own event vocabulary for the Misses column. It is not a
 * message event and never will be — nothing was sent — so it has no home in
 * `messageEventTypeSchema`, which broadcast and sequences share.
 */
export const COMMENT_AUTOMATION_MISSED_EVENT = "comment:missed"

/**
 * Narrower than `broadcastEventType` on purpose: only the outcomes a comment
 * automation actually records have a column behind them. `message:received`
 * and `flow:ref` are meaningless here, and accepting them would mean a request
 * the repository has no predicate for.
 *
 * `comment:missed` is the odd one out: it is served by
 * `FBCommentAutomationMiss`, a different table, so every read that accepts this
 * enum has to route it away from `CommentAutomationStatsRepository` before it
 * reaches `buildEventFilter` (which has no predicate for it).
 */
export const commentAutomationEventType = z.enum([
  messageEventTypeSchema.enum["message:sent"],
  messageEventTypeSchema.enum["message:delivered"],
  messageEventTypeSchema.enum["message:seen"],
  messageEventTypeSchema.enum["message:failed"],
  flowEventTypeSchema.enum["flow:clicked"],
  COMMENT_AUTOMATION_MISSED_EVENT,
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
  /**
   * The event id. One contact can appear several times in this list — once per
   * occurrence — so the dialog keys and de-duplicates rows by this, never by
   * `contactId`.
   */
  rowKey: z.string(),
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
  /**
   * The customer's comment, and why the automation passed on it. Only the
   * `comment:missed` drill-down fills these in — for a delivery stat the row
   * describes the reply, and the comment text lives on the analytics page.
   */
  commentText: z.string().nullable().optional(),
  missReason: commentAutomationMissReasons.nullable().optional(),
})

export type CommentAutomationContactData = z.infer<
  typeof commentAutomationContactData
>

export const listCommentAutomationContactsResponse = z.object({
  data: z.array(commentAutomationContactData),
  total: z.number(),
  /**
   * Distinct contacts behind `total` rows. Tagging acts per contact, so this is
   * what the selection counter and its toast report — five replies to two
   * commenters is two tags.
   */
  contactTotal: z.number(),
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
  // The odd one out: gated by a row existing in `FBCommentAutomationMiss`
  // rather than by a timestamp column, since a miss has no timeline.
  "missedCount",
] as const

export type CommentAutomationCounterField =
  (typeof commentAutomationCounterFields)[number]

/** `automationId` → how much to add to each counter. Negative for a discard. */
export type CommentAutomationCounterDeltas = Map<
  string,
  Partial<Record<CommentAutomationCounterField, number>>
>
