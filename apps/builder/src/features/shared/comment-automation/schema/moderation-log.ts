import {
  channelTypes,
  commentModerationActions,
  commentModerationCategories,
  commentModerationRules,
  commentModerationSources,
  commentModerationStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest } from "@/lib/public-api/list"

export const moderationLogAutomationIdSchema = zodBigintAsString().describe(
  "Comment automation id, from any channel. Get it from `fbComments.list`, `igComments.list`, `threadsComments.list` or `tiktokComments.list`.",
)

export const moderationLogFilterSchema = z.object({
  id: moderationLogAutomationIdSchema,
  from: z.iso
    .datetime({ offset: true })
    .optional()
    .describe(
      "ISO 8601 start of the range (inclusive) on the comment's time, e.g. `2026-10-01T00:00:00+07:00`. Omit for no lower bound.",
    ),
  to: z.iso
    .datetime({ offset: true })
    .optional()
    .describe(
      "ISO 8601 end of the range (inclusive) on the comment's time. Omit for no upper bound.",
    ),
  action: commentModerationActions
    .optional()
    .describe("Only comments that were `hide`-den or `delete`-d."),
  source: commentModerationSources
    .optional()
    .describe(
      "Only comments moderated by a hide `rule` or by `ai` moderation.",
    ),
})

export const listModerationLogsRequest = moderationLogFilterSchema.extend(
  publicListRequest.shape,
)
export type ListModerationLogsRequest = z.infer<
  typeof listModerationLogsRequest
>

export const moderationLogResource = z.object({
  id: z.string(),
  commentId: z.string().describe("The comment's id on the channel."),
  postId: z.string().describe("The post the comment was made on."),
  commentText: z
    .string()
    .nullable()
    .describe(
      "What the customer wrote. Kept even after a delete removed the comment from the channel.",
    ),
  source: commentModerationSources.describe(
    "`rule`: a hide rule matched (see `rule`). `ai`: AI moderation flagged it (see `categories` and `reason`).",
  ),
  rule: commentModerationRules
    .nullable()
    .describe("The hide rule that matched. Null for `ai`."),
  matchedKeyword: z
    .string()
    .nullable()
    .describe("The configured keyword that matched a `keyword` rule."),
  categories: z
    .array(commentModerationCategories)
    .describe("The AI's categories. Empty for `rule`."),
  reason: z
    .string()
    .nullable()
    .describe("The AI's one-sentence explanation. Null for `rule`."),
  action: commentModerationActions,
  status: commentModerationStatuses.describe(
    "`pending` until the channel answered, then `done` or `failed`.",
  ),
  errorDetail: z
    .string()
    .nullable()
    .describe("Why the channel refused the hide/delete, when `failed`."),
  occurredAt: z.string().describe("When the customer commented (ISO 8601)."),
  contactId: z.string().nullable(),
  contactInboxId: z.string().nullable(),
  conversationId: z.string().nullable(),
  channel: channelTypes.nullable(),
  sourceId: z
    .string()
    .nullable()
    .describe("The commenter's id on the channel."),
})

/** The dialog also shows who commented; the public API drops it (see handler). */
export const moderationLogPrivateResource = moderationLogResource.extend({
  fullName: z.string().nullable(),
  avatar: z.string().nullable(),
})

export const listModerationLogsResponse = z.object({
  data: z.array(moderationLogResource),
  total: z.number().describe("Rows matching the filter."),
  page: z.number(),
  pageCount: z.number(),
})

export const listModerationLogsPrivateResponse =
  listModerationLogsResponse.extend({
    data: z.array(moderationLogPrivateResource),
  })
export type ListModerationLogsPrivateResponse = z.infer<
  typeof listModerationLogsPrivateResponse
>

export const moderationSummaryResponse = z.object({
  total: z.number().describe("Comments moderated in the range."),
  hidden: z.number(),
  deleted: z.number(),
  byRule: z.number().describe("Moderated by a hide rule."),
  byAI: z.number().describe("Moderated by AI moderation."),
  failed: z.number().describe("The channel refused the hide/delete."),
  pending: z.number().describe("Still waiting for the channel."),
})
export type ModerationSummaryResponse = z.infer<
  typeof moderationSummaryResponse
>
