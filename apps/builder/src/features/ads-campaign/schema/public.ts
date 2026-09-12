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
  channel: messagingAdChannelSchema,
  integrationId: zodBigintAsString(),
  whatsappPageIntegrationId: zodBigintAsString().optional(),
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/),
  name: z.string().trim().min(1).max(120),
  campaign: z.object({
    specialAdCategories: z.array(specialAdCategorySchema).min(1),
    specialAdCategoryCountry: z.array(z.string().trim().length(2)).optional(),
  }),
  adSet: z.object({
    dailyBudgetMinorUnits: z.coerce.number().int().positive(),
    targeting: messagingAdTargetingSchema,
    startTime: z.string().trim().optional(),
    endTime: z.string().trim().optional(),
  }),
  creative: z.object({
    media: creativeMediaSchema,
    welcomeMessage: welcomeMessageSchema,
  }),
})
export type CreateMessagingAdPublicRequest = z.infer<
  typeof createMessagingAdPublicRequest
>

export const operationIdPublicParams = z.object({
  operationId: zodBigintAsString(),
})

const messagingAdsIntegrationIdentityPublicShape = {
  channel: messagingAdChannelSchema,
  integrationId: zodBigintAsString(),
}

export const listMessagingAdsPublicRequest = z.object({
  channel: messagingAdChannelSchema,
  integrationId: zodBigintAsString(),
  refresh: z.boolean().optional(),
})

const MAX_INSIGHTS_AD_IDS = 500

export const messagingAdsInsightsPublicRequest = z.object({
  ...messagingAdsIntegrationIdentityPublicShape,
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/),
  adIds: z.array(z.string().trim().min(1)).min(1).max(MAX_INSIGHTS_AD_IDS),
  datePreset: messagingAdsInsightsDatePresetSchema.optional(),
  refresh: z.boolean().optional(),
})

export const listAdAccountsPublicRequestParams = z.object({
  ...messagingAdsIntegrationIdentityPublicShape,
})

export const listAdAccountsPublicRequest = z.object({
  refresh: z.boolean().optional(),
})

export const adAccountDetailsPublicRequestParams = z.object({
  adAccountId: z
    .string()
    .trim()
    .regex(/^act_\d+$/),
})

export const adAccountDetailsPublicRequest = z.object({
  ...messagingAdsIntegrationIdentityPublicShape,
  refresh: z.boolean().optional(),
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
    .regex(/^act_\d+$/),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().regex(VIDEO_MIME_RE),
  base64: z.string().trim().min(1).max(MAX_VIDEO_BASE64_LENGTH),
})

export const videoStatusPublicRequestParams = z.object({
  videoId: z.string().trim().min(1),
})

export const videoStatusPublicRequest = z.object({
  ...messagingAdsIntegrationIdentityPublicShape,
})

export const listMessengerPagesPublicRequest = z.object({
  channel: messagingAdChannelSchema,
  integrationId: zodBigintAsString(),
})

export const checkPrerequisitesPublicRequest = z.object({
  channel: messagingAdChannelSchema,
  integrationId: zodBigintAsString(),
})
