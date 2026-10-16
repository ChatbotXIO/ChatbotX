import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { analyticsFilterFields, timeRangeQuerySchema } from "./common"
import { contactEventTypes, contactSenderTypes } from "./contact-event"

export const contactStatsSchema = z.object({
  workspaceId: z.string(),
  count: z.number(),
  eventType: contactEventTypes,
  timestamp: z.date(),
  uniqueContacts: z.number(),
})
export type ContactStats = z.infer<typeof contactStatsSchema>

export const contactsByDimensionSchema = z.object({
  count: z.number(),
  dimension: z.string(),
  uniqueContacts: z.number(),
})
export type ContactsByDimension = z.infer<typeof contactsByDimensionSchema>

export const contactDimensionSchema = z.enum([
  "country",
  "channel",
  "source",
  "language",
])
export type ContactDimension = z.infer<typeof contactDimensionSchema>

export const contactDimensionMetricSchema = z.enum(["new", "total"])
export type ContactDimensionMetric = z.infer<
  typeof contactDimensionMetricSchema
>

// `contact_deleted` events never carry a country, so a net total cannot be
// derived for it.
const TOTAL_METRIC_DIMENSIONS: readonly ContactDimension[] = [
  "channel",
  "source",
]

export const contactsByDimensionFields = {
  dimension: contactDimensionSchema.describe("How to group contact counts."),
  metric: contactDimensionMetricSchema
    .default("new")
    .describe(
      "`new` counts contacts created between `from` and `to`. `total` counts the contacts that exist as of `to` (created minus deleted); `from` is ignored and only `channel` and `source` are supported (only `channel` together with `inboxIds`). `language` groups by the contact language recorded when the contact was created. An empty `dimension` means unknown.",
    ),
}

// Under an inbox filter the total is anchored on per-inbox contact counts,
// which only exist per channel.
export const isSupportedDimensionMetric = ({
  dimension,
  metric,
  inboxIds,
}: {
  dimension: ContactDimension
  metric: ContactDimensionMetric
  inboxIds?: readonly string[]
}): boolean =>
  metric !== "total" ||
  (inboxIds?.length
    ? dimension === "channel"
    : TOTAL_METRIC_DIMENSIONS.includes(dimension))

export const unsupportedDimensionMetricIssue = {
  message:
    "`metric: total` is only supported for the channel and source dimensions, and only for channel with `inboxIds`",
  path: ["metric"],
}

export const contactsByDimensionQuerySchema = timeRangeQuerySchema
  .extend(contactsByDimensionFields)
  .extend(analyticsFilterFields)
  .refine(isSupportedDimensionMetric, unsupportedDimensionMetricIssue)
export type ContactsByDimensionQuery = z.infer<
  typeof contactsByDimensionQuerySchema
>

export const getContactsByDimensionStatsResponseSchema = z.object({
  data: z.array(contactsByDimensionSchema),
})
export type GetContactsByDimensionStatsResponseSchema = z.infer<
  typeof getContactsByDimensionStatsResponseSchema
>

export const messagesBySenderStatsSchema = z.object({
  channel: z.string().nullable(),
  workspaceId: z.string(),
  count: z.coerce.number(),
  senderType: contactSenderTypes,
  timestamp: z.coerce.date(),
})
export type MessagesBySenderStats = z.infer<typeof messagesBySenderStatsSchema>

export const getMessagesBySenderStatsResponseSchema = z.object({
  data: z.array(messagesBySenderStatsSchema),
})
export type GetMessagesBySenderStatsResponseSchema = z.infer<
  typeof getMessagesBySenderStatsResponseSchema
>

export const messagesByAdminStatsSchema = z.object({
  adminId: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
  count: z.number(),
  userEmail: z.string().optional(),
  userName: z.string().optional(),
})
export type MessagesByAdminStats = z.infer<typeof messagesByAdminStatsSchema>

export const getMessagesByAdminStatsResponseSchema = z.object({
  data: z.array(messagesByAdminStatsSchema),
})
export type GetMessagesByAdminStatsResponseSchema = z.infer<
  typeof getMessagesByAdminStatsResponseSchema
>

export const uniqueContactsByAdminStatsSchema = z.object({
  workspaceId: zodBigintAsString(),
  toAssignee: zodBigintAsString(),
  count: z.number(),
  userName: z.string().optional(),
  userEmail: z.string().optional(),
})
export type UniqueContactsByAdminStats = z.infer<
  typeof uniqueContactsByAdminStatsSchema
>

export const humanAgentStatsSchema = z.object({
  adminId: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
  assignedConversations: z.number(),
  messagesSent: z.number(),
  uniqueContacts: z.number(),
  userEmail: z.string().optional(),
  userName: z.string().optional(),
})
export type HumanAgentStats = z.infer<typeof humanAgentStatsSchema>

export const getHumanAgentStatsResponseSchema = z.object({
  data: z.array(humanAgentStatsSchema),
})
export type GetHumanAgentStatsResponseSchema = z.infer<
  typeof getHumanAgentStatsResponseSchema
>
