import { createSearchParamsCache, parseAsString } from "nuqs/server"
import { MESSAGING_ADS_TOOL_INTEGRATION_PARAM } from "../lib/tool-path"

/**
 * URL-driven state for the tool's `[channel]` page — only the selected
 * integration; the channel itself is the route segment, never a search
 * param. Mirrors `adsAnalyticsSearchParamsCache`'s `channelAccount` field
 * (`features/ads/schema/analytics.ts`), minus that filter's "empty = all
 * accounts" semantics — this tool's box needs exactly one integration, so
 * an absent/unknown param falls back to `selectMessagingAdsToolIntegration`
 * instead of an aggregate view.
 */
export const messagingAdsToolSearchParamsCache = createSearchParamsCache({
  [MESSAGING_ADS_TOOL_INTEGRATION_PARAM]: parseAsString.withDefault(""),
})

export type MessagingAdsToolSearchParams = Awaited<
  ReturnType<typeof messagingAdsToolSearchParamsCache.parse>
>
