import {
  commentAutomationContactData,
  commentAutomationErrorRow,
  commentAutomationEventType,
  commentAutomationTextTotalRow,
  commentAutomationTimeseriesRow,
} from "@chatbotx.io/analytics/schemas"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { withPublicPaging } from "@/lib/public-api/list"

// ─────────────────────────────────────────────────────────────────────────
// Comment automation stats — one surface for every channel (Facebook,
// Instagram, Threads, TikTok): `CommentAutomation` is a single table and
// `commentAutomationAnalyticsService` scopes the automation to the workspace
// itself. `from`/`to` like every other analytics time range; handlers map
// them to the service's `startDate`/`endDate`.
// ─────────────────────────────────────────────────────────────────────────

const automationIdSchema = zodBigintAsString().describe(
  "Comment automation id, from any channel. Get it from `fbComments.list`, `igComments.list`, `threadsComments.list` or `tiktokComments.list`.",
)

export const commentAutomationStatsPublicRequest = z.object({
  automationId: automationIdSchema,
  from: z.string().describe("ISO 8601 start of the time range (inclusive)."),
  to: z.string().describe("ISO 8601 end of the time range (exclusive)."),
  timezone: z
    .string()
    .default("UTC")
    .describe("IANA timezone used to bucket results, e.g. `America/New_York`."),
})

export const commentAutomationRepliesPublicResponse = z.object({
  data: z
    .array(commentAutomationTimeseriesRow)
    .describe(
      "Replies sent per bucket. Buckets are days, or months when the range is longer than 60 days.",
    ),
})

export const commentAutomationTextTotalsPublicRequest = withPublicPaging(
  commentAutomationStatsPublicRequest.extend({
    keyword: z
      .string()
      .optional()
      .describe("Case-insensitive substring match against the text."),
  }),
)

export const commentAutomationTextTotalsPublicResponse = z.object({
  data: z.array(commentAutomationTextTotalRow),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})

export const commentAutomationErrorsPublicRequest = withPublicPaging(
  commentAutomationStatsPublicRequest,
)

/**
 * PII minimization, same as `linkContactPublicResource`: this sits behind the
 * `analytics` scope, not `contacts`, so the commenter's name and avatar are
 * dropped.
 */
export const commentAutomationErrorPublicResource =
  commentAutomationErrorRow.omit({ contact: true })

export const commentAutomationErrorsPublicResponse = z.object({
  data: z.array(commentAutomationErrorPublicResource),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})

export const commentAutomationContactsPublicRequest = withPublicPaging(
  z.object({
    automationId: automationIdSchema,
    eventType: commentAutomationEventType.describe(
      "Which counter to list the contacts behind: `message:sent`, `message:delivered`, `message:seen`, `message:failed`, `flow:clicked`, or `comment:missed`.",
    ),
  }),
)

/** PII minimization — see `commentAutomationErrorPublicResource`. */
export const commentAutomationContactPublicResource =
  commentAutomationContactData.omit({
    firstName: true,
    lastName: true,
    fullName: true,
    avatar: true,
  })

export const commentAutomationContactsPublicResponse = z.object({
  data: z.array(commentAutomationContactPublicResource),
  total: z
    .number()
    .describe("Events behind the counter — the automation's lifetime count."),
  contactTotal: z.number().describe("Distinct contacts behind those events."),
  page: z.number(),
  pageCount: z.number(),
})
