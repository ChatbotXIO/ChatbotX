// Pure enum subpath — the canonical Meta `special_ad_categories` list, the
// SINGLE source of truth. Importing the `messaging-ads/constants` subpath (not
// the package root) keeps `ky`/server API code out of this schema's bundle.
import {
  buildMessagingAdCreativeStoragePrefix,
  requiresSpecialAdCategoryCountry,
  specialAdCategories,
} from "@chatbotx.io/integration-facebook-ads/messaging-ads/constants"
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
    countries: z
      .array(z.string().trim().length(2))
      .min(1)
      .describe(
        'ISO 3166-1 alpha-2 country codes to target, e.g. `["US", "VN"]`. At least one.',
      ),
    ageMin: z.coerce
      .number()
      .int()
      .min(13)
      .max(65)
      .optional()
      .describe(
        "Minimum audience age, 13-65. Must be <= `ageMax`. Setting any of ageMin/ageMax/genders/locales turns off Advantage+ audience.",
      ),
    ageMax: z.coerce
      .number()
      .int()
      .min(13)
      .max(65)
      .optional()
      .describe("Maximum audience age, 13-65. Must be >= `ageMin`."),
    genders: z
      .array(z.union([z.literal(1), z.literal(2)]))
      .optional()
      .describe(
        "Meta gender codes to target: 1 = male, 2 = female. Omit to target all genders.",
      ),
    locales: z
      .array(z.coerce.number().int())
      .optional()
      .describe(
        "Meta locale codes (numeric, e.g. 1033 = en_US) to target by language. Omit for all languages.",
      ),
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
  title: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .describe("Quick-reply button label, 1-20 characters."),
})

export const welcomeMessageTemplateSchema = z.object({
  heading: z
    .string()
    .trim()
    .max(80)
    .optional()
    .describe("Optional heading above the message, up to 80 characters."),
  message: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe("Welcome message text, 1-2000 characters."),
  quickReplies: z
    .array(welcomeMessageQuickReplySchema)
    .max(3)
    .optional()
    .describe("Up to 3 quick-reply buttons shown under the message."),
})

export const welcomeMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z
      .literal("default")
      .describe("Use Meta's default welcome text (no custom message sent)."),
  }),
  z.object({
    type: z
      .literal("single")
      .describe("One custom welcome message, with optional quick replies."),
    message: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe("Welcome message text, 1-2000 characters."),
    quickReplies: z
      .array(welcomeMessageQuickReplySchema)
      .max(3)
      .optional()
      .describe("Up to 3 quick-reply buttons shown under the message."),
  }),
  z.object({
    type: z
      .literal("templates")
      .describe(
        "Several welcome message variants (1-5), each with its own text.",
      ),
    templates: z
      .array(welcomeMessageTemplateSchema)
      .min(1)
      .max(5)
      .describe("1-5 welcome message variants."),
  }),
])

/**
 * New-shape only — a legacy `{ imageHash }` row only ever exists already
 * persisted (from before the presigned-S3 upload switch) and is never
 * re-submitted through this oRPC boundary. `imageKey`'s workspace-namespace
 * prefix is checked below, on `createMessagingAdRequest` (this schema alone
 * has no `workspaceId` in scope). `imageMimeType`/`imageFileName` are
 * client-declared and informational only — the create-time preflight derives
 * the authoritative MIME + a server-generated filename from the bytes.
 */
export const creativeMediaSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image").describe("Image creative."),
    imageKey: z
      .string()
      .trim()
      .min(1)
      .max(1024)
      .describe(
        "Storage key of the uploaded image; must belong to this workspace. Returned as `imageKey` by `ads.createCampaignImageUpload`.",
      ),
    fileId: z
      .string()
      .trim()
      .min(1)
      .describe(
        "File id of the uploaded image. Returned as `fileId` by `ads.createCampaignImageUpload`.",
      ),
    imageMimeType: z
      .string()
      .trim()
      .max(255)
      .optional()
      .describe(
        "Informational only: image MIME type you uploaded. The server detects the real type from the bytes.",
      ),
    imageFileName: z
      .string()
      .trim()
      .max(255)
      .optional()
      .describe(
        "Informational only: original file name. The server generates its own file name.",
      ),
    link: z
      .url()
      .describe("Destination URL the ad's link points to (absolute URL)."),
    message: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe("Primary text shown above the image, up to 500 characters."),
    headline: z
      .string()
      .trim()
      .max(40)
      .optional()
      .describe("Headline shown below the image, up to 40 characters."),
    description: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Link description text, up to 200 characters."),
    caption: z
      .string()
      .trim()
      .max(30)
      .optional()
      .describe("Display-link caption (e.g. a domain), up to 30 characters."),
  }),
  z.object({
    kind: z.literal("video").describe("Video creative."),
    videoId: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Meta video id returned by `ads.uploadCampaignVideo`; wait until `ads.getCampaignVideoStatus` reports it ready.",
      ),
    thumbnailImageHash: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional Meta ad image hash to use as the video thumbnail."),
    title: z
      .string()
      .trim()
      .max(40)
      .optional()
      .describe("Video title shown with the ad, up to 40 characters."),
    message: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe("Primary text shown above the video, up to 500 characters."),
    linkDescription: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Link description text, up to 200 characters."),
  }),
])

export const createMessagingAdRequest = z
  .object({
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
        // Meta's `special_ad_categories` array — one or more categories, or the
        // `["NONE"]` sentinel for no category. `CREDIT` is a valid enum value for
        // reading legacy campaigns, but the create UI no longer offers it (Meta
        // deprecated it) — see `specialAdCategoryOptions`.
        specialAdCategories: z
          .array(specialAdCategorySchema)
          .min(1)
          // `CREDIT` stays in the enum so legacy campaigns still READ, but
          // Meta deprecated it for creation (it folded into
          // FINANCIAL_PRODUCTS_SERVICES) — reject it here so a direct API
          // caller cannot submit what the UI already forbids.
          .refine((categories) => !categories.includes("CREDIT"), {
            message:
              "CREDIT is deprecated — use FINANCIAL_PRODUCTS_SERVICES instead.",
          }),
        specialAdCategoryCountry: z
          .array(z.string().trim().length(2))
          .optional(),
      })
      // Meta hard-requires `special_ad_category_country` ONLY for
      // ISSUES_ELECTIONS_POLITICS. For HOUSING/EMPLOYMENT/CREDIT/FINANCIAL it
      // is optional (Meta defaults it to the ad account's tax country), so
      // never force it there. Block the genuinely-required case here — before a
      // campaign is created on Meta — instead of failing with a confusing Graph
      // error and leaving an orphaned paused campaign.
      .refine(
        (c) =>
          !requiresSpecialAdCategoryCountry(c.specialAdCategories) ||
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
  // A stored-image `imageKey` must live inside THIS request's own workspace
  // namespace — reject a forged/foreign/cross-workspace key BEFORE any Meta
  // call (the business-layer preflight re-checks this again at create time,
  // this is the earliest, cheapest rejection point).
  .refine(
    (req) =>
      req.creative.media.kind !== "image" ||
      req.creative.media.imageKey.startsWith(
        `${buildMessagingAdCreativeStoragePrefix(req.workspaceId)}/`,
      ),
    {
      path: ["creative", "media", "imageKey"],
      message: "Image is not owned by this workspace.",
    },
  )
export type CreateMessagingAdRequest = z.infer<typeof createMessagingAdRequest>

export const operationIdParamsSchema = z.object({
  workspaceId: zodBigintAsString(),
  operationId: zodBigintAsString(),
})

// Video uploads are still materialized in builder memory (base64-in-JSON, at
// wizard time), so bound the payload and pin the MIME allowlist to prevent
// memory exhaustion / arbitrary content type. base64 length ≈ bytes * 4/3, so
// this cap is ~100MB. Images no longer go through this path — the browser
// uploads straight to presigned S3 (see `creativeMediaSchema` above and
// `MAX_MESSAGING_AD_IMAGE_BYTES`/`MESSAGING_AD_IMAGE_MIME_ALLOWLIST` for the
// real byte cap enforced there and at create-time preflight).
const MAX_VIDEO_BASE64_LENGTH = 140_000_000
const VIDEO_MIME_RE = /^video\/(mp4|quicktime)$/

const messagingAdsIntegrationIdentity = {
  workspaceId: zodBigintAsString(),
  channel: messagingAdChannelSchema,
  integrationId: zodBigintAsString(),
}

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
