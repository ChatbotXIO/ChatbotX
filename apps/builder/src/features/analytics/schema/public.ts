import {
  botMessageStatsSchema,
  conversationArchivedStatsSchema,
  conversationAssignedByAdminStatsSchema,
  conversationAssignedStatsSchema,
  conversationFollowUpStatsSchema,
  conversationHandoffStatsSchema,
  flowNodeContactData,
  flowNodeStatsResponse,
  flowStatsRequest,
  getBotMessagesAIProvidersResponseSchema,
  getBroadcastStatsRequest,
  getBroadcastStatsResponse,
  getContactCountsResponseSchema,
  getContactsByDimensionStatsResponseSchema,
  getContactsCountResponseSchema,
  getSequenceStepStatsRequest,
  getSequenceStepStatsResponse,
  humanAgentStatsSchema,
  messagesByAdminStatsSchema,
  messagesBySenderStatsSchema,
  refLinkTimeseriesRow,
  timeRangeQuerySchema,
  timeRangeQueryWithGranularityDMSchema,
  timeRangeQueryWithGranularityMHDSchema,
  uniqueConversationsByAdminStatsSchema,
} from "@chatbotx.io/analytics/schemas"
import { z } from "zod"
import { withPublicPaging } from "@/lib/public-api/list"

// ─────────────────────────────────────────────────────────────────────────
// Shared input schemas (workspaceId stripped — injected from the token's
// resolved workspace in the handler, never accepted from client input)
// ─────────────────────────────────────────────────────────────────────────

export const timeRangePublicRequest = timeRangeQuerySchema.omit({
  workspaceId: true,
})

export const timeRangeWithGranularityMHDPublicRequest =
  timeRangeQueryWithGranularityMHDSchema.omit({ workspaceId: true })

export const timeRangeWithGranularityDMPublicRequest =
  timeRangeQueryWithGranularityDMSchema.omit({ workspaceId: true })

export const contactsByDimensionPublicRequest = timeRangePublicRequest.extend({
  dimension: z
    .enum(["country", "channel", "source"])
    .describe("How to group contact counts."),
})

// ─────────────────────────────────────────────────────────────────────────
// Contact stats
// ─────────────────────────────────────────────────────────────────────────

// `getContactCountsResponseSchema` has no `workspaceId` field — reused directly.
export const contactCountsPublicResponse = getContactCountsResponseSchema

// `getContactsCountResponseSchema` has no `workspaceId` field — reused directly.
export const contactsCountPublicResponse = getContactsCountResponseSchema

// `getContactsByDimensionStatsResponseSchema` has no `workspaceId` field —
// reused directly.
export const contactsByDimensionPublicResponse =
  getContactsByDimensionStatsResponseSchema

// ─────────────────────────────────────────────────────────────────────────
// Message / human-agent stats (workspaceId omitted from the row)
// ─────────────────────────────────────────────────────────────────────────

export const messagesByAdminPublicResponse = z.object({
  data: z.array(messagesByAdminStatsSchema.omit({ workspaceId: true })),
})

export const humanAgentStatsPublicResponse = z.object({
  data: z.array(humanAgentStatsSchema.omit({ workspaceId: true })),
})

export const messagesBySenderPublicResponse = z.object({
  data: z.array(messagesBySenderStatsSchema.omit({ workspaceId: true })),
})

// ─────────────────────────────────────────────────────────────────────────
// Conversation event stats (workspaceId omitted from the row)
// ─────────────────────────────────────────────────────────────────────────

export const conversationHandoffsPublicResponse = z.object({
  data: z.array(conversationHandoffStatsSchema.omit({ workspaceId: true })),
})

export const conversationFollowUpsPublicResponse = z.object({
  data: z.array(conversationFollowUpStatsSchema.omit({ workspaceId: true })),
})

export const conversationArchivedPublicResponse = z.object({
  data: z.array(conversationArchivedStatsSchema.omit({ workspaceId: true })),
})

export const conversationAssignedPublicResponse = z.object({
  data: z.array(conversationAssignedStatsSchema.omit({ workspaceId: true })),
})

export const conversationAssignedByAdminPublicResponse = z.object({
  data: z.array(
    conversationAssignedByAdminStatsSchema.omit({ workspaceId: true }),
  ),
})

export const uniqueConversationsByAdminPublicResponse = z.object({
  data: z.array(
    uniqueConversationsByAdminStatsSchema.omit({ workspaceId: true }),
  ),
})

// ─────────────────────────────────────────────────────────────────────────
// Bot message stats (workspaceId omitted from the row where present)
// ─────────────────────────────────────────────────────────────────────────

export const botMessagesPublicResponse = z.object({
  data: z.array(botMessageStatsSchema.omit({ workspaceId: true })),
})

// `getBotMessagesAIProvidersResponseSchema` has no `workspaceId` — reused
// directly.
export const botMessagesAIProvidersPublicResponse =
  getBotMessagesAIProvidersResponseSchema

// ─────────────────────────────────────────────────────────────────────────
// MAC (monthly active contacts)
// ─────────────────────────────────────────────────────────────────────────

export const macActiveContactCountPublicResponse = z.object({
  data: z.object({ macCount: z.number() }),
})

// ─────────────────────────────────────────────────────────────────────────
// Broadcast / sequence stats (flat objects, no workspaceId anywhere)
// ─────────────────────────────────────────────────────────────────────────

export const broadcastStatsPublicRequest = getBroadcastStatsRequest.omit({
  workspaceId: true,
})
export const broadcastStatsPublicResponse = getBroadcastStatsResponse

export const sequenceStepStatsPublicRequest = getSequenceStepStatsRequest.omit({
  workspaceId: true,
})
export const sequenceStepStatsPublicResponse = getSequenceStepStatsResponse

// ─────────────────────────────────────────────────────────────────────────
// Flow stats
// ─────────────────────────────────────────────────────────────────────────

export const flowStatsPublicRequest = flowStatsRequest.omit({
  workspaceId: true,
})
// `flowNodeStatsResponse` (a record keyed by node id) has no workspaceId
// anywhere in its shape — reused directly.
export const flowStatsPublicResponse = flowNodeStatsResponse

// ─────────────────────────────────────────────────────────────────────────
// Magic link / ref link stats — `from`/`to`, matching every other analytics
// time-range operation (`timeRangeQuerySchema`), rather than the internal
// `startDate`/`endDate` shape the `packages/analytics` magic-link schemas
// use. Handlers map `{ from, to }` -> `{ startDate, endDate }` before
// calling the service; `packages/analytics` and its dashboard callers are
// untouched.
//
// Back-compat: these 4 operations shipped with `startDate`/`endDate` before
// being renamed to `from`/`to` for consistency. `withLegacyDateRangeAliases`
// accepts either spelling so an existing caller's request keeps working —
// `from`/`to` win if a caller (confusingly) sends both.
// ─────────────────────────────────────────────────────────────────────────

const withLegacyDateRangeAliases = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value !== "object" || value === null) {
      return value
    }
    const { startDate, endDate, ...rest } = value as Record<string, unknown>
    return {
      ...rest,
      from: (value as Record<string, unknown>).from ?? startDate,
      to: (value as Record<string, unknown>).to ?? endDate,
    }
  }, schema)

export const linkStatsPublicRequest = withLegacyDateRangeAliases(
  z.object({
    from: z
      .string()
      .describe(
        "ISO 8601 start of the time range (inclusive). Accepts the deprecated `startDate` name too.",
      ),
    to: z
      .string()
      .describe(
        "ISO 8601 end of the time range (exclusive). Accepts the deprecated `endDate` name too.",
      ),
    linkId: z.string().describe("Magic link or ref link id."),
    timezone: z
      .string()
      .describe(
        "IANA timezone used to bucket results, e.g. `America/New_York`.",
      ),
  }),
)
// `refLinkTimeseriesRow` (`{ dateReport, count }`) has no workspaceId —
// reused directly.
export const linkStatsPublicResponse = z.object({
  data: z.array(refLinkTimeseriesRow),
})

export const linkContactsPublicRequest = withLegacyDateRangeAliases(
  withPublicPaging(
    z.object({
      linkId: z.string().describe("Magic link or ref link id."),
      from: z
        .string()
        .optional()
        .describe(
          "ISO 8601 start of the time range (inclusive). Accepts the deprecated `startDate` name too.",
        ),
      to: z
        .string()
        .optional()
        .describe(
          "ISO 8601 end of the time range (exclusive). Accepts the deprecated `endDate` name too.",
        ),
      timezone: z
        .string()
        .optional()
        .describe(
          "IANA timezone used to bucket results, e.g. `America/New_York`.",
        ),
    }),
  ),
)

/**
 * PII minimization: the internal `flowNodeContactData` row includes
 * `firstName`, `lastName`, and `avatar` — full contact identity. These
 * link-attribution endpoints sit behind the `analytics` scope, not the
 * `contacts` scope that gates contact PII everywhere else in the public API,
 * so echoing name/avatar here would create an unintended PII-read path for
 * any token scoped to `analytics` alone. Attribution use cases (which
 * contact clicked this link, when, on what channel) only need identifiers —
 * a caller that also holds the `contacts` scope can already cross-reference
 * `contactId`/`conversationId` against the `contacts` public router for full
 * contact details.
 */
export const linkContactPublicResource = flowNodeContactData.omit({
  firstName: true,
  lastName: true,
  avatar: true,
})

export const linkContactsPublicResponse = z.object({
  data: z.array(linkContactPublicResource),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})
