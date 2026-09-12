import {
  adsConversionExportSegments,
  adsConversionRuleResource,
} from "@chatbotx.io/business/ads-conversion/schema"
import { adsConversionChannelSchema } from "@chatbotx.io/database/schema"
import { facebookAdAccountSchema } from "@chatbotx.io/integration-facebook-ads"
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
