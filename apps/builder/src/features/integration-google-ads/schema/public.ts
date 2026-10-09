import { googleAdsEventStatusSchema } from "@chatbotx.io/database/partials"
import { googleAdsChannels } from "@chatbotx.io/utils/google-click"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { conversionActionIdFilter, googleAdsEventResource } from "./events"

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const channelFilter = googleAdsChannels
  .optional()
  .describe("Only conversions from this channel.")

const conversionActionFilter = conversionActionIdFilter
  .optional()
  .describe(
    "Only conversions for this Google conversion action ID. Get IDs from `googleAds.getConnection`.",
  )

export const getGoogleAdsStatsPublicRequest = z.object({
  from: z
    .string()
    .regex(DATE_KEY_PATTERN)
    .describe("First day (YYYY-MM-DD, inclusive) in `tz`."),
  to: z
    .string()
    .regex(DATE_KEY_PATTERN)
    .describe("Last day (YYYY-MM-DD, inclusive) in `tz`."),
  tz: z
    .string()
    .optional()
    .describe("IANA timezone used to bucket days. Defaults to UTC."),
  channel: channelFilter,
  conversionActionId: conversionActionFilter,
})

export const listGoogleAdsEventsPublicRequest = publicListRequest.extend({
  status: googleAdsEventStatusSchema
    .optional()
    .describe("Only events with this delivery status."),
  channel: channelFilter,
  conversionActionId: conversionActionFilter,
  since: z.coerce
    .date()
    .optional()
    .describe("Only conversions at or after this instant (ISO 8601)."),
  until: z.coerce
    .date()
    .optional()
    .describe("Only conversions at or before this instant (ISO 8601)."),
})

export const listGoogleAdsEventsPublicResponse = publicListResponse(
  googleAdsEventResource,
)
