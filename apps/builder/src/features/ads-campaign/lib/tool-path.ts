import type { MessagingAdChannel } from "@chatbotx.io/database/partials"

/**
 * Query param name for the selected integration on the Click to Message Ads
 * tool page — a named constant so `schema/tool-search-params.ts` and
 * `components/messaging-ads-integration-filter.tsx` cannot drift from the
 * literal string this file builds URLs with.
 */
export const MESSAGING_ADS_TOOL_INTEGRATION_PARAM = "integration"

/** Route segment the standalone Click to Message Ads tool lives under
 * (`/space/{workspaceId}/messaging-ads[/...]`, see plan §2). */
export const MESSAGING_ADS_TOOL_ROUTE_BASE = "messaging-ads"

/** Route segment for the per-channel Ads dashboard this tool links out to. */
const ADS_DASHBOARD_ROUTE_BASE = "dashboard/ads"

/**
 * Single source for every link that targets the Click to Message Ads tool —
 * the tabs, the integration filter, the "moved" alert on the old channel
 * tabs, the channel-less redirect page, and the OAuth connect referer all
 * build their target through this function, so none of them can drift from
 * one another (plan Phase 2: "Single source for Tools card, moved-note
 * alert, redirect and OAuth referer").
 */
export function buildMessagingAdsToolPath(input: {
  workspaceId: string
  channel?: MessagingAdChannel
  integrationId?: string
}): string {
  const base = `/space/${input.workspaceId}/${MESSAGING_ADS_TOOL_ROUTE_BASE}`
  if (!input.channel) {
    return base
  }
  const path = `${base}/${input.channel}`
  if (!input.integrationId) {
    return path
  }
  const params = new URLSearchParams()
  params.set(MESSAGING_ADS_TOOL_INTEGRATION_PARAM, input.integrationId)
  return `${path}?${params.toString()}`
}

/**
 * Link from the tool page's dashboard hint (repurposed
 * `adsCampaign.box.emptyDashboardNote`) to the matching Ads dashboard
 * channel + integration — mirrors `channelAccount`'s role on
 * `/dashboard/ads/[channel]` (`features/ads/schema/analytics.ts`).
 */
export function buildMessagingAdsDashboardPath(input: {
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
}): string {
  const params = new URLSearchParams()
  params.set("channelAccount", input.integrationId)
  return `/space/${input.workspaceId}/${ADS_DASHBOARD_ROUTE_BASE}/${input.channel}?${params.toString()}`
}
