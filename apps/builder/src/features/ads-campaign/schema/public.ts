import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  creativeMediaSchema,
  messagingAdChannelSchema,
  messagingAdsInsightsDatePresetSchema,
  messagingAdTargetingSchema,
  specialAdCategorySchema,
  welcomeMessageSchema,
} from "./wizard"

/**
 * Public-surface twin of `createMessagingAdRequest` (`./wizard.ts`), minus
 * `workspaceId` — that schema is a `.refine()`-wrapped `ZodEffects` (the
 * `imageKey` ownership check reads `req.workspaceId`), so it cannot be
 * `.omit()`-ed. The handler re-validates through the ORIGINAL
 * `createMessagingAdRequest` after merging in `context.workspace.id`, so
 * this copy only needs to match its *shape* for correct request parsing and
 * OpenAPI docs — the private schema stays the single source of truth for
 * the actual validation rules (imageKey namespace, CREDIT rejection,
 * special-ad-category country, adSet time ordering).
 */
export const createMessagingAdPublicRequest = z.object({
  channel: messagingAdChannelSchema.describe(
    "Channel to run the messaging ad on.",
  ),
  integrationId: zodBigintAsString().describe(
    "Channel integration id (numeric string).",
  ),
  whatsappPageIntegrationId: zodBigintAsString()
    .optional()
    .describe(
      "Messenger page integration id, required when channel is whatsapp.",
    ),
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/)
    .describe(
      "Meta ad account id (act_<id>). Get it from `ads.listCampaignAdAccounts`.",
    ),
  name: z.string().trim().min(1).max(120).describe("Campaign name."),
  campaign: z
    .object({
      specialAdCategories: z
        .array(specialAdCategorySchema)
        .min(1)
        .describe(
          "Meta special ad category classifications this campaign falls under.",
        ),
      specialAdCategoryCountry: z
        .array(z.string().trim().length(2))
        .optional()
        .describe(
          "ISO 3166-1 alpha-2 country codes required for some special ad categories.",
        ),
    })
    .describe("Campaign-level settings."),
  adSet: z
    .object({
      dailyBudgetMinorUnits: z.coerce
        .number()
        .int()
        .positive()
        .describe(
          "Daily budget in the ad account's currency minor units (e.g. cents).",
        ),
      targeting: messagingAdTargetingSchema.describe(
        "Audience targeting for the ad set.",
      ),
      startTime: z
        .string()
        .trim()
        .optional()
        .describe("ISO 8601 ad set start time."),
      endTime: z
        .string()
        .trim()
        .optional()
        .describe("ISO 8601 ad set end time."),
    })
    .describe("Ad set-level settings."),
  creative: z
    .object({
      media: creativeMediaSchema.describe(
        "Ad creative media (image or video).",
      ),
      welcomeMessage: welcomeMessageSchema.describe(
        "Click-to-message welcome message shown to the contact.",
      ),
    })
    .describe("Ad creative settings."),
})
export type CreateMessagingAdPublicRequest = z.infer<
  typeof createMessagingAdPublicRequest
>

export const operationIdPublicParams = z.object({
  id: zodBigintAsString().describe(
    "Messaging ad id. Get it from `ads.listCampaigns`.",
  ),
})

const messagingAdsIntegrationIdentityPublicShape = {
  channel: messagingAdChannelSchema.describe(
    "Channel the integration belongs to.",
  ),
  integrationId: zodBigintAsString().describe(
    "Channel integration id (numeric string).",
  ),
}

export const listMessagingAdsPublicRequest = z.object({
  channel: messagingAdChannelSchema.describe(
    "Channel the integration belongs to.",
  ),
  integrationId: zodBigintAsString().describe(
    "Channel integration id (numeric string).",
  ),
  refresh: z
    .boolean()
    .optional()
    .describe(
      "Force an uncached refresh from Meta instead of serving cached data.",
    ),
})

const MAX_INSIGHTS_AD_IDS = 500

export const messagingAdsInsightsPublicRequest = z.object({
  ...messagingAdsIntegrationIdentityPublicShape,
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/)
    .describe("Meta ad account id (act_<id>)."),
  adIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(MAX_INSIGHTS_AD_IDS)
    .describe(`Ad ids to fetch insights for, up to ${MAX_INSIGHTS_AD_IDS}.`),
  datePreset: messagingAdsInsightsDatePresetSchema
    .optional()
    .describe("Meta date preset for the insights window."),
  refresh: z
    .boolean()
    .optional()
    .describe(
      "Force an uncached refresh from Meta instead of serving cached data.",
    ),
})

export const listAdAccountsPublicRequestParams = z.object({
  ...messagingAdsIntegrationIdentityPublicShape,
})

export const listAdAccountsPublicRequest = z.object({
  refresh: z
    .boolean()
    .optional()
    .describe(
      "Force an uncached refresh from Meta instead of serving cached data.",
    ),
})

export const adAccountDetailsPublicRequestParams = z.object({
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/)
    .describe(
      "Meta ad account id (act_<id>). Get it from `ads.listCampaignAdAccounts`.",
    ),
})

export const adAccountDetailsPublicRequest = z.object({
  ...messagingAdsIntegrationIdentityPublicShape,
  refresh: z
    .boolean()
    .optional()
    .describe(
      "Force an uncached refresh from Meta instead of serving cached data.",
    ),
})

// Deliberately LOWER than the private route's 140MB cap
// (`../schema/wizard.ts`). The private upload sits behind a session +
// `assertWorkspaceSuperAdmin`, so a handful of concurrent uploads at the cap
// is bounded by real logged-in users. The public route is reachable by any
// workspace API token holding the `ads` scope and materializes the whole
// video in builder process memory (`Buffer.from(input.base64, "base64")` in
// `../api/public.ts`) before forwarding it to Meta — a few concurrent
// requests at 140MB each would push the process toward memory exhaustion.
// 25MB comfortably covers a short-form vertical ad creative (Meta's own
// Ads Manager guidance targets well under this for feed/story placements)
// while capping worst-case concurrent memory use an order of magnitude
// lower than the private cap. Also bounded by the shared
// `workspace-token-rate-limit` (120 req/10s per token, `api-rate-limit.ts`).
const MAX_VIDEO_BASE64_LENGTH = 25_000_000
const VIDEO_MIME_RE = /^video\/(mp4|quicktime)$/

export const uploadAdVideoPublicRequest = z.object({
  ...messagingAdsIntegrationIdentityPublicShape,
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/)
    .describe("Meta ad account id (act_<id>)."),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe("File name for the uploaded video."),
  mimeType: z
    .string()
    .trim()
    .regex(VIDEO_MIME_RE)
    .describe("Video MIME type: video/mp4 or video/quicktime."),
  base64: z
    .string()
    .trim()
    .min(1)
    .max(MAX_VIDEO_BASE64_LENGTH)
    .describe("Base64-encoded video file contents, up to 25MB."),
})

export const videoStatusPublicRequestParams = z.object({
  videoId: z
    .string()
    .trim()
    .min(1)
    .describe("Video id returned by `ads.uploadCampaignVideo`."),
})

export const videoStatusPublicRequest = z.object({
  ...messagingAdsIntegrationIdentityPublicShape,
})

export const listMessengerPagesPublicRequest = z.object({
  channel: messagingAdChannelSchema.describe(
    "Channel the integration belongs to.",
  ),
  integrationId: zodBigintAsString().describe(
    "Channel integration id (numeric string).",
  ),
})

export const checkPrerequisitesPublicRequest = z.object({
  channel: messagingAdChannelSchema.describe(
    "Channel the integration belongs to.",
  ),
  integrationId: zodBigintAsString().describe(
    "Channel integration id (numeric string).",
  ),
})

// ─────────────────────────────────────────────────────────────────────────
// Connections
// ─────────────────────────────────────────────────────────────────────────

export const listConnectionsPublicRequestParams = z.object({
  channel: messagingAdChannelSchema.describe(
    "Channel to list messaging-ads connections for.",
  ),
})

// Never `auth` (an encrypted credential blob) or `workspaceId`.
export const messagingAdsConnectionPublicResource = z.object({
  id: z.string(),
  // Plain `z.string()`, not `messagingAdChannelSchema`: the DB's
  // `messagingAdChannel` pgEnum casts its options to `[string, ...string[]]`
  // (see `schema/messaging-ads-connection.ts`), so drizzle infers this
  // column as `string`, not the narrow union — matches the same widening
  // `resource-mapper.ts` already works around for `MessagingAdOperation`.
  channel: z.string(),
  integrationId: z.string(),
  status: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const listConnectionsPublicResponse = z.object({
  data: z.array(messagingAdsConnectionPublicResource),
})

export const disconnectConnectionPublicRequestParams = z.object({
  channel: messagingAdChannelSchema.describe(
    "Channel the integration belongs to.",
  ),
  integrationId: zodBigintAsString().describe(
    "Channel integration id (numeric string).",
  ),
})
