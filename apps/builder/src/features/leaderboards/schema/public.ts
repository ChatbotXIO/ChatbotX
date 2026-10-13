import { leaderboardPlatforms } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import {
  leaderboardConfigRequest,
  leaderboardIdInput,
  leaderboardParticipantFilters,
  listLeaderboardsFilter,
} from "./action"
import {
  leaderboardAuditEntryResource,
  leaderboardParticipantResource,
  leaderboardResource,
  leaderboardTopEntryResource,
} from "./resource"

export const listLeaderboardsPublicRequest = publicListRequest.merge(
  listLeaderboardsFilter,
)

export const listLeaderboardsPublicResponse = publicListResponse(
  leaderboardResource,
).extend({
  total: z.number(),
  summary: z
    .object({
      total: z.number(),
      active: z.number(),
      paused: z.number(),
      finished: z.number(),
      draft: z.number(),
    })
    .describe("Counts per status across the whole workspace (header KPIs)."),
})

export const createLeaderboardPublicRequest = leaderboardConfigRequest

export const updateLeaderboardPublicRequest =
  leaderboardConfigRequest.merge(leaderboardIdInput)

export const defaultLeaderboardRulesRequest = z.object({
  platform: leaderboardPlatforms.describe("Platform to get default rules for."),
})

export const leaderboardTopRequest = leaderboardIdInput.extend({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50)
    .describe("How many top participants to return, 1-500."),
})

export const leaderboardTopResponse = z.object({
  data: z.array(leaderboardTopEntryResource),
})

export const leaderboardViewLinkRequest = leaderboardIdInput.extend({
  contactId: z
    .string()
    .optional()
    .describe(
      "Optional contact id (from `contacts.list`): returns a link already signed for that contact, so it opens with their rank and referral button.",
    ),
})

export const leaderboardViewLinkResponse = z.object({
  url: z.string().describe("Public leaderboard page URL."),
  personalized: z
    .boolean()
    .describe(
      "true when the URL carries a signed token for `contactId`; false when it still holds the `{{leaderboard_view_token}}` variable for a flow to fill.",
    ),
})

export const listLeaderboardParticipantsPublicRequest = publicListRequest
  .merge(leaderboardIdInput)
  .extend({
    keyword: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Search by name, phone number or contact id."),
    filter: leaderboardParticipantFilters
      .default("all")
      .describe('"top10", "top50", "banned" or "all".'),
  })

export const listLeaderboardParticipantsPublicResponse = publicListResponse(
  leaderboardParticipantResource,
).extend({ total: z.number() })

export const listLeaderboardAuditLogPublicRequest =
  publicListRequest.merge(leaderboardIdInput)

export const listLeaderboardAuditLogPublicResponse = publicListResponse(
  leaderboardAuditEntryResource,
).extend({ total: z.number() })

export const leaderboardHistoryResponse = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      createdAt: z.date(),
      delta: z.number(),
      source: z.string(),
      rule: z.string().nullable(),
      sourceRef: z.string().nullable(),
    }),
  ),
})

export const leaderboardExportResponse = z.object({
  fileId: z.string().describe("Pass to `leaderboards.getExport` to poll it."),
  fileName: z.string().nullable(),
  status: z.string().describe('"pending", then "uploaded" or "failed".'),
})

export const leaderboardExportStatusResponse = leaderboardExportResponse.extend(
  {
    totalRecords: z.number(),
    downloadUrl: z
      .string()
      .nullable()
      .describe("Signed download link once status is uploaded."),
  },
)

export const leaderboardRewardsResponse = z.object({
  winners: z.array(
    z.object({ rank: z.number(), contactId: z.string(), score: z.number() }),
  ),
  sent: z.number().describe("Winners the reward flow was started for."),
  skipped: z
    .array(z.string())
    .describe("Winner contact ids with no conversation on the channel."),
})
