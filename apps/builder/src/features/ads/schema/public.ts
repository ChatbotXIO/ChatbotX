import { startRetargetAudienceSyncShape } from "@chatbotx.io/business"
import {
  adsConversionExportSegments,
  adsConversionRuleResource,
} from "@chatbotx.io/business/ads-conversion/schema"
import {
  adsConversionCapiStatusSchema,
  adsConversionChannelSchema,
  adsConversionEventSourceSchema,
  adsConversionEventTypeSchema,
} from "@chatbotx.io/database/schema"
import {
  facebookAdAccountSchema,
  facebookCustomAudienceSchema,
} from "@chatbotx.io/integration-facebook-ads"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { adsEligibleChannelTypes } from "@chatbotx.io/utils/channel"
import { z } from "zod"
import { withPublicPaging } from "@/lib/public-api/list"
import {
  createAdsConversionRuleRequest,
  toggleAdsConversionRuleRequest,
  updateAdsConversionRuleRequest,
} from "./conversion-rule"

// ─────────────────────────────────────────────────────────────────────────
// Conversion rules — request/response schemas rebuilt for the public
// surface. `workspaceId` never comes from input on the token path; it is
// always injected from `context.workspace.id` in the handler.
// ─────────────────────────────────────────────────────────────────────────

export const createAdsConversionRulePublicRequest =
  createAdsConversionRuleRequest
export const updateAdsConversionRulePublicRequest =
  updateAdsConversionRuleRequest.omit({ id: true })
export const toggleAdsConversionRulePublicRequest =
  toggleAdsConversionRuleRequest.omit({ id: true })

// `adsConversionRuleResource` includes `workspaceId` (it's a straight
// `createSelectSchema` off the table) — stripped here so no public response
// leaks it (`public-spec-operations.test.ts`'s workspaceId leak guard).
export const adsConversionRulePublicResource = adsConversionRuleResource.omit({
  workspaceId: true,
})

export const adsConversionRuleIdParams = z.object({
  id: zodBigintAsString(),
})

export const listAdsConversionRulesPublicRequest = withPublicPaging(
  z.object({
    channel: adsConversionChannelSchema.optional(),
  }),
)

// ─────────────────────────────────────────────────────────────────────────
// Funnel / CAPI delivery / export — `getCtwaFunnelInput` and the export
// input schemas in `@chatbotx.io/business/ads-conversion/schema` are
// `ZodEffects` (wrapped in `.refine()`), not plain `ZodObject`s, so they
// cannot be `.omit()`-ed. Rebuilt here from their underlying shape, minus
// `workspaceId`, with the same `since <= until` ordering re-applied plus an
// additional public-only range cap (see `MAX_ADS_ANALYTICS_RANGE_DAYS`,
// `features/ads/schema/analytics.ts`) — an unbounded external range would
// fan out into a per-day funnel/Graph aggregation with no dashboard-side
// clamp to protect it.
// ─────────────────────────────────────────────────────────────────────────

export const MAX_ADS_PUBLIC_RANGE_DAYS = 366
const MS_PER_DAY = 24 * 60 * 60 * 1000

const dateRangeShape = z.object({
  since: z.coerce.date(),
  until: z.coerce.date(),
})

// Mirrors `withOrderedDateRange` in
// `@chatbotx.io/business/ads-conversion/schema` — constrained to a concrete
// base shape (not a fully generic `z.ZodRawShape`) so the refine callback
// below can see `since`/`until` at all; a bare generic loses those fields to
// the mapped-type projection zod v4 produces for an arbitrary shape.
const withPublicDateRange = <Schema extends typeof dateRangeShape>(
  schema: Schema,
) =>
  schema
    .refine((input) => input.since.getTime() <= input.until.getTime(), {
      message: "since must be before or equal to until",
      path: ["until"],
    })
    .refine(
      (input) =>
        (input.until.getTime() - input.since.getTime()) / MS_PER_DAY + 1 <=
        MAX_ADS_PUBLIC_RANGE_DAYS,
      {
        message: `Range cannot exceed ${MAX_ADS_PUBLIC_RANGE_DAYS} days`,
        path: ["until"],
      },
    )

const ctwaFunnelPublicShape = dateRangeShape.extend({
  integrationWhatsappId: zodBigintAsString().optional(),
  channel: adsConversionChannelSchema.optional(),
  integrationMessengerId: zodBigintAsString().optional(),
  integrationInstagramId: zodBigintAsString().optional(),
  allChannels: z.boolean().optional(),
  timezone: z.string().optional(),
})

// Shared by the funnel and export public requests so the two endpoints
// cannot silently disagree on the same input contract (see the export
// refine below): `allChannels` is exclusive with `channel` and every
// integration id, and at most one integration id may be given at once — a
// caller combining, say, `integrationWhatsappId` and
// `integrationMessengerId` would otherwise build an unsatisfiable
// conjunction downstream and silently get zero rows back instead of a 422.
const countIntegrationIds = (input: {
  integrationWhatsappId?: string
  integrationMessengerId?: string
  integrationInstagramId?: string
}): number =>
  [
    input.integrationWhatsappId,
    input.integrationMessengerId,
    input.integrationInstagramId,
  ].filter((id) => id !== undefined).length

export const getCtwaFunnelPublicRequest = withPublicDateRange(
  ctwaFunnelPublicShape,
)
  .refine(
    (input) =>
      !(
        input.allChannels &&
        (input.channel ||
          input.integrationWhatsappId ||
          input.integrationMessengerId ||
          input.integrationInstagramId)
      ),
    {
      message:
        "allChannels cannot be combined with channel or an integration id",
      path: ["allChannels"],
    },
  )
  .refine((input) => countIntegrationIds(input) <= 1, {
    message:
      "Only one of integrationWhatsappId, integrationMessengerId, integrationInstagramId may be provided",
    path: ["integrationWhatsappId"],
  })

const adsConversionExportPublicShape = dateRangeShape.extend({
  segment: adsConversionExportSegments,
  adId: z.string().trim().min(1).nullable().optional(),
  integrationWhatsappId: zodBigintAsString().optional(),
  channel: adsConversionChannelSchema.optional(),
  integrationMessengerId: zodBigintAsString().optional(),
  integrationInstagramId: zodBigintAsString().optional(),
  allChannels: z.boolean().optional(),
  afterId: zodBigintAsString().optional(),
  limit: z.number().int().positive().max(1000).default(500),
})

export const listAdsConversionExportRowsPublicRequest = withPublicDateRange(
  adsConversionExportPublicShape,
)
  .refine(
    (input) =>
      !(
        input.allChannels &&
        (input.channel ||
          input.integrationWhatsappId ||
          input.integrationMessengerId ||
          input.integrationInstagramId)
      ),
    {
      message:
        "allChannels cannot be combined with channel or an integration id",
      path: ["allChannels"],
    },
  )
  .refine((input) => countIntegrationIds(input) <= 1, {
    message:
      "Only one of integrationWhatsappId, integrationMessengerId, integrationInstagramId may be provided",
    path: ["integrationWhatsappId"],
  })

export const adsConversionExportRowPublicResource = z.object({
  id: z.string(),
  contactId: z.string(),
  contactName: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  email: z.string().nullable(),
  adId: z.string().nullable(),
  occurredAt: z.date(),
  channel: z.string().optional(),
})

export const listAdsConversionExportRowsPublicResponse = z.object({
  data: z.array(adsConversionExportRowPublicResource),
  nextAfterId: z.string().nullable(),
})

// ─────────────────────────────────────────────────────────────────────────
// Ad accounts
// ─────────────────────────────────────────────────────────────────────────

export const listChannelAdAccountsPublicRequestParams = z.object({
  channel: adsEligibleChannelTypes,
})

export const listChannelAdAccountsPublicRequest = z.object({
  integrationId: zodBigintAsString().optional(),
})

export const listChannelAdAccountsPublicResponse = z.object({
  data: z.array(facebookAdAccountSchema),
})

// ─────────────────────────────────────────────────────────────────────────
// Funnel / timeseries / CAPI response shapes
// ─────────────────────────────────────────────────────────────────────────

export const ctwaFunnelAdRowPublicResource = z.object({
  adId: z.string().nullable(),
  adName: z.string().nullable().optional(),
  conversations: z.number(),
  leads: z.number(),
  purchases: z.number(),
  revenue: z.number(),
  channels: z.array(z.string()).optional(),
})

export const ctwaFunnelPublicResponse = z.object({
  totals: z.object({
    conversations: z.number(),
    leads: z.number(),
    purchases: z.number(),
    revenue: z.number(),
  }),
  perAd: z.array(ctwaFunnelAdRowPublicResource),
})

export const ctwaFunnelTimeseriesRowPublicResource = z.object({
  date: z.string(),
  adId: z.string().nullable(),
  conversations: z.number(),
  leads: z.number(),
  purchases: z.number(),
})

export const ctwaFunnelTimeseriesPublicResponse = z.object({
  data: z.array(ctwaFunnelTimeseriesRowPublicResource),
})

export const capiDeliverySummaryPublicResponse = z.object({
  sent: z.number(),
  pending: z.number(),
  failed: z.number(),
  skippedNoScope: z.number(),
  skippedRegion: z.number(),
})

// ─────────────────────────────────────────────────────────────────────────
// Merged analytics (funnel + Meta spend/ROAS/CPM) — a SEPARATE cost surface
// from `/v1/ads/funnel` above: funnel is DB-only and free, these endpoints
// additionally fan out to Meta Graph for spend and require a connected ads
// account. No local day cap: `adsAnalyticsService`'s `parseAnalyticsDateRange`
// clamps to `MAX_ADS_ANALYTICS_RANGE_DAYS` (366) for both callers.
// ─────────────────────────────────────────────────────────────────────────

export const adsAnalyticsPublicRequest = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tz: z.string().optional(),
    adAccountId: z
      .string()
      .regex(/^act_\d+$/)
      .optional(),
    // `adsEligibleChannelTypes` here (not `adsConversionChannelSchema`): the
    // spend fan-out resolves messaging-ads connections, which `facebook` has
    // none of.
    channel: adsEligibleChannelTypes.optional(),
    integrationWhatsappId: zodBigintAsString().optional(),
    integrationMessengerId: zodBigintAsString().optional(),
    integrationInstagramId: zodBigintAsString().optional(),
    allChannels: z.boolean().optional(),
  })
  .refine(
    (input) =>
      !(
        input.allChannels &&
        (input.channel ||
          input.integrationWhatsappId ||
          input.integrationMessengerId ||
          input.integrationInstagramId)
      ),
    {
      message:
        "allChannels cannot be combined with channel or an integration id",
      path: ["allChannels"],
    },
  )
  .refine((input) => countIntegrationIds(input) <= 1, {
    message:
      "Only one of integrationWhatsappId, integrationMessengerId, integrationInstagramId may be provided",
    path: ["integrationWhatsappId"],
  })

export const adsAnalyticsRowPublicResource = z.object({
  adId: z.string().nullable(),
  adName: z.string().nullable().optional(),
  conversations: z.number(),
  leads: z.number(),
  purchases: z.number(),
  revenue: z.number(),
  channels: z.array(z.string()).optional(),
  spend: z.number().nullable(),
  costPerLead: z.number().nullable(),
  costPerPurchase: z.number().nullable(),
  roas: z.number().nullable(),
  impressions: z.number().nullable(),
  clicks: z.number().nullable(),
  cpc: z.number().nullable(),
  ctr: z.number().nullable(),
  cpm: z.number().nullable(),
  costPerConversation: z.number().nullable(),
})

export const adsAnalyticsOverviewPublicResponse = z.object({
  totals: z.object({
    conversations: z.number(),
    leads: z.number(),
    purchases: z.number(),
    revenue: z.number(),
    spend: z.number(),
    costPerLead: z.number().nullable(),
    costPerPurchase: z.number().nullable(),
    roas: z.number().nullable(),
    impressions: z.number(),
    clicks: z.number(),
    cpc: z.number().nullable(),
    ctr: z.number().nullable(),
    cpm: z.number().nullable(),
    costPerConversation: z.number().nullable(),
  }),
  perAd: z.array(adsAnalyticsRowPublicResource),
  spendCurrency: z.string().nullable(),
})

export const adsAnalyticsTimeseriesRowPublicResource = z.object({
  date: z.string(),
  conversations: z.number(),
  leads: z.number(),
  purchases: z.number(),
  spend: z.number().nullable(),
})

export const adsAnalyticsTimeseriesPublicResponse = z.object({
  data: z.array(adsAnalyticsTimeseriesRowPublicResource),
})

// ─────────────────────────────────────────────────────────────────────────
// Single conversion-event read
// ─────────────────────────────────────────────────────────────────────────

export const adsConversionEventIdParams = z.object({
  id: zodBigintAsString(),
})

// `workspaceId` omitted — the leak sweep in public-spec-operations.test.ts
// has no exception list entry for `ads.*`. `updateCapiStatus` is
// deliberately NOT exposed here: CAPI delivery state is worker-owned
// bookkeeping and a token write would corrupt retry accounting.
export const adsConversionEventPublicResource = z.object({
  id: z.string(),
  channel: adsConversionChannelSchema,
  integrationWhatsappId: z.string().nullable(),
  integrationMessengerId: z.string().nullable(),
  integrationInstagramId: z.string().nullable(),
  wabaId: z.string().nullable(),
  source: adsConversionEventSourceSchema,
  eventType: adsConversionEventTypeSchema,
  ctwaClid: z.string().nullable(),
  adId: z.string().nullable(),
  contactInboxId: z.string().nullable(),
  currency: z.string().nullable(),
  value: z.string().nullable(),
  orderId: z.string().nullable(),
  contents: z
    .array(
      z.object({
        id: z.string(),
        quantity: z.number(),
        itemPrice: z.number(),
      }),
    )
    .nullable(),
  occurredAt: z.date(),
  sourceEventId: z.string(),
  capiStatus: adsConversionCapiStatusSchema,
  capiSentAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// ─────────────────────────────────────────────────────────────────────────
// Custom audiences — makes `startRetargetAudienceSync`'s `customAudienceId`
// discoverable instead of forcing a new audience on every call.
// ─────────────────────────────────────────────────────────────────────────

export const listCustomAudiencesPublicRequest = z.object({
  adAccountId: z.string().trim().min(1),
})

export const listCustomAudiencesPublicResponse = z.object({
  data: z.array(facebookCustomAudienceSchema),
})

// ─────────────────────────────────────────────────────────────────────────
// Retarget-audience sync
// ─────────────────────────────────────────────────────────────────────────

export const startRetargetAudienceSyncPublicRequest =
  startRetargetAudienceSyncShape
    .omit({ workspaceId: true })
    .refine((input) => input.audienceName || input.customAudienceId, {
      message: "Either audienceName or customAudienceId is required",
      path: ["audienceName"],
    })

export const startRetargetAudienceSyncPublicResponse = z.object({
  customAudienceId: z.string(),
  enqueued: z.literal(true),
})
