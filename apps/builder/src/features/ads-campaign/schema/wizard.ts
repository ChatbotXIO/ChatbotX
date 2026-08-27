// Pure enum subpath — the canonical Meta `special_ad_categories` list, the
// SINGLE source of truth. Importing the `messaging-ads/constants` subpath (not
// the package root) keeps `ky`/server API code out of this schema's bundle.
import { specialAdCategories } from "@chatbotx.io/integration-facebook-ads/messaging-ads/constants"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const messagingAdChannelSchema = z.enum([
  "messenger",
  "instagram",
  "whatsapp",
])

// Derive the server-side validation enum from the canonical constant so it can
// never drift from the fb-ads integration (and the client wizard options) again
// — a mismatch here rejects a valid category BEFORE it reaches Meta with a
// confusing "Invalid option" error.
export const specialAdCategorySchema = z.enum(specialAdCategories)

export const messagingAdTargetingSchema = z
  .object({
    countries: z.array(z.string().trim().length(2)).min(1),
    ageMin: z.coerce.number().int().min(13).max(65).optional(),
    ageMax: z.coerce.number().int().min(13).max(65).optional(),
    genders: z.array(z.union([z.literal(1), z.literal(2)])).optional(),
    locales: z.array(z.coerce.number().int()).optional(),
  })
  .refine(
    (t) =>
      t.ageMin === undefined || t.ageMax === undefined || t.ageMin <= t.ageMax,
    {
      path: ["ageMax"],
      message: "ageMax must be greater than or equal to ageMin",
    },
  )

export const welcomeMessageQuickReplySchema = z.object({
  title: z.string().trim().min(1).max(20),
})

export const welcomeMessageTemplateSchema = z.object({
  heading: z.string().trim().max(80).optional(),
  message: z.string().trim().min(1).max(2000),
  quickReplies: z.array(welcomeMessageQuickReplySchema).max(3).optional(),
})

export const welcomeMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("default") }),
  z.object({
    type: z.literal("single"),
    message: z.string().trim().min(1).max(2000),
    quickReplies: z.array(welcomeMessageQuickReplySchema).max(3).optional(),
  }),
  z.object({
    type: z.literal("templates"),
    templates: z.array(welcomeMessageTemplateSchema).min(1).max(5),
  }),
])

export const creativeMediaSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    imageHash: z.string().trim().min(1),
    link: z.url(),
    message: z.string().trim().max(500).optional(),
    headline: z.string().trim().max(40).optional(),
    description: z.string().trim().max(200).optional(),
    caption: z.string().trim().max(30).optional(),
  }),
  z.object({
    kind: z.literal("video"),
    videoId: z.string().trim().min(1),
    thumbnailImageHash: z.string().trim().min(1).optional(),
    title: z.string().trim().max(40).optional(),
    message: z.string().trim().max(500).optional(),
    linkDescription: z.string().trim().max(200).optional(),
  }),
])

export const createMessagingAdRequest = z.object({
  workspaceId: zodBigintAsString(),
  channel: messagingAdChannelSchema,
  integrationId: zodBigintAsString(),
  whatsappPageIntegrationId: zodBigintAsString().optional(),
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/),
  name: z.string().trim().min(1).max(120),
  campaign: z
    .object({
      // Exactly one category — either a real one or the `["NONE"]` sentinel.
      // A campaign belongs to at most one special ad category, so more than one
      // is rejected here (defense-in-depth behind the single-select UI) rather
      // than sent to Meta as an invalid combination.
      specialAdCategories: z
        .array(specialAdCategorySchema)
        .min(1)
        .max(1, "A campaign can have only one special ad category."),
      specialAdCategoryCountry: z.array(z.string().trim().length(2)).optional(),
    })
    // Meta hard-requires `special_ad_category_country` when the social
    // issues/elections/politics category is used. Block it here (before any
    // campaign is created on Meta) instead of letting it fail server-side with
    // a confusing Graph error and leave an orphaned paused campaign.
    .refine(
      (c) =>
        !c.specialAdCategories.includes("ISSUES_ELECTIONS_POLITICS") ||
        (c.specialAdCategoryCountry?.length ?? 0) > 0,
      {
        path: ["specialAdCategoryCountry"],
        message:
          "A country is required for the social issues, elections or politics category.",
      },
    ),
  adSet: z
    .object({
      dailyBudgetMinorUnits: z.coerce.number().int().positive(),
      targeting: messagingAdTargetingSchema,
      startTime: z.string().trim().optional(),
      endTime: z.string().trim().optional(),
    })
    .refine(
      (a) =>
        !(a.startTime && a.endTime) ||
        new Date(a.startTime).getTime() < new Date(a.endTime).getTime(),
      { path: ["endTime"], message: "endTime must be after startTime" },
    ),
  creative: z.object({
    media: creativeMediaSchema,
    welcomeMessage: welcomeMessageSchema,
  }),
})
export type CreateMessagingAdRequest = z.infer<typeof createMessagingAdRequest>

export const operationIdParamsSchema = z.object({
  workspaceId: zodBigintAsString(),
  operationId: zodBigintAsString(),
})

// Uploads are materialized in builder memory, so bound the payload and pin the
// MIME allowlist to prevent memory exhaustion / arbitrary content type.
// base64 length ≈ bytes * 4/3, so these caps are ~10MB image / ~100MB video.
const MAX_IMAGE_BASE64_LENGTH = 14_000_000
const MAX_VIDEO_BASE64_LENGTH = 140_000_000
const IMAGE_MIME_RE = /^image\/(jpeg|png|gif|webp)$/
const VIDEO_MIME_RE = /^video\/(mp4|quicktime)$/

const messagingAdsIntegrationIdentity = {
  workspaceId: zodBigintAsString(),
  channel: messagingAdChannelSchema,
  integrationId: zodBigintAsString(),
}

export const uploadAdImageRequest = z.object({
  ...messagingAdsIntegrationIdentity,
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().regex(IMAGE_MIME_RE),
  base64: z.string().trim().min(1).max(MAX_IMAGE_BASE64_LENGTH),
})

export const uploadAdVideoRequest = z.object({
  ...messagingAdsIntegrationIdentity,
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().regex(VIDEO_MIME_RE),
  base64: z.string().trim().min(1).max(MAX_VIDEO_BASE64_LENGTH),
})

export const videoStatusRequest = z.object({
  ...messagingAdsIntegrationIdentity,
  videoId: z.string().trim().min(1),
})

export const adAccountDetailsRequest = z.object({
  ...messagingAdsIntegrationIdentity,
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/),
  refresh: z.boolean().optional(),
})

export const listAdAccountsRequest = z.object({
  ...messagingAdsIntegrationIdentity,
  refresh: z.boolean().optional(),
})

export const listMessengerPagesRequest = z.object({
  workspaceId: zodBigintAsString(),
  // CTWA-only: WhatsApp has no Page of its own, so its wizard still asks for
  // one to supply `page_id` (see `resolve-channel-assets.ts`). `channel` is
  // validated (not just accepted) at the handler so a CTM/CTID box can never
  // probe this endpoint.
  channel: messagingAdChannelSchema,
  integrationId: zodBigintAsString(),
})

export const checkPrerequisitesRequest = z.object({
  workspaceId: zodBigintAsString(),
  channel: messagingAdChannelSchema,
  integrationId: zodBigintAsString(),
})

/**
 * Meta `date_preset` values the box's Ads Insights panel selector offers —
 * mirrors `MESSAGING_ADS_INSIGHTS_DATE_PRESETS`
 * (`@chatbotx.io/integration-facebook-ads`); duplicated as a literal tuple
 * here (rather than imported) so this request schema stays a pure Zod
 * definition with no cross-package runtime import, matching every other
 * schema in this file.
 */
export const messagingAdsInsightsDatePresetSchema = z.enum([
  "maximum",
  "last_30d",
  "last_7d",
])
export type MessagingAdsInsightsDatePreset = z.infer<
  typeof messagingAdsInsightsDatePresetSchema
>

// Bounds the `ad.id IN [...]` Graph filter to a sane batch size — mirrors the
// spirit of `ADS_PAGE_LIMIT`; a box legitimately listing more ads than this
// would need pagination on `listMessagingAds` first, which is out of scope
// here (insights never drives pagination).
const MAX_INSIGHTS_AD_IDS = 500

/**
 * Insights are ALWAYS scoped to one ad account (Meta's `/insights` endpoint
 * requires `act_{adAccountId}`) — see the doc comment on
 * `listCachedMessagingAdsInsights` (`@chatbotx.io/business`) for why this
 * cannot be inferred server-side from `(channel, integrationId)` alone. A
 * box whose ads span more than one ad account calls this endpoint once per
 * distinct ad account.
 */
export const messagingAdsInsightsRequest = z.object({
  ...messagingAdsIntegrationIdentity,
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/),
  adIds: z.array(z.string().trim().min(1)).min(1).max(MAX_INSIGHTS_AD_IDS),
  datePreset: messagingAdsInsightsDatePresetSchema.optional(),
  /** Box "Refresh" → bypass the SWR cache and re-read Meta's live insights now. */
  refresh: z.boolean().optional(),
})
