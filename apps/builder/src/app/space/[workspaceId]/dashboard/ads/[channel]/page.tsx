import { perChannelIntegrationIds } from "@chatbotx.io/business"
import {
  type AdsEligibleChannelType,
  adsEligibleChannelTypes,
} from "@chatbotx.io/utils/channel"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AdsAnalyticsView } from "@/features/ads/components/ads-analytics-view"
import { resolveChannelIntegrations } from "@/features/ads/lib/resolve-channel-integrations"
import {
  getAdsAnalyticsData,
  getAdsAnalyticsTimeseries,
  getCapiDeliveryData,
} from "@/features/ads/queries/analytics"
import { getAdsSwitcherData } from "@/features/ads/queries/switcher"
import { adsAnalyticsSearchParamsCache } from "@/features/ads/schemas/analytics"
import { AnalyticsNav } from "@/features/analytics/components/analytics-nav"
import { resolveAdsDashboardChannels } from "@/features/analytics/lib/ads-dashboard-channels"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

/** Validates the `[channel]` route segment against the canonical ads-eligible
 * channel list — any other value (typo, stale bookmark, crawler) 404s rather
 * than silently falling back to a default channel. */
function parseChannelParam(channel: string): AdsEligibleChannelType {
  const parsed = adsEligibleChannelTypes.safeParse(channel)
  if (!parsed.success) {
    notFound()
  }
  return parsed.data
}

export default async function AdsChannelAnalyticsPage(props: {
  params: Promise<{ workspaceId: string; channel: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(
    props.params,
    "superAdmin",
  )
  const { channel: channelParam } = await props.params
  const channel = parseChannelParam(channelParam)

  const search = adsAnalyticsSearchParamsCache.parse(await props.searchParams)
  const range = { ...search, channel }
  // Guarded by `resolveGuardedWorkspaceId(..., "superAdmin")` above, so
  // isSuperAdmin is always true here.
  const [switcherData, adsChannels] = await Promise.all([
    getAdsSwitcherData(workspaceId),
    resolveAdsDashboardChannels({ workspaceId, isSuperAdmin: true }),
  ])

  // One unified integration select for this channel: an empty
  // `channelAccount` means "All accounts" — aggregate across every
  // connected integration of the selected channel (the business layer
  // treats each per-channel FK as optional narrowing, not a forced single
  // account). The legacy `account` URL param (still written by the
  // CAPI-connect redirect flow and old bookmarks) is honored as a fallback
  // selection when `channelAccount` is absent — WhatsApp only, mirroring
  // the pre-split page's contract.
  const channelIntegrations = resolveChannelIntegrations(channel, switcherData)
  const requestedIntegrationId =
    search.channelAccount || (channel === "whatsapp" ? search.account : "")
  const selectedChannelIntegration =
    channelIntegrations.find(
      (integration) => integration.id === requestedIntegrationId,
    ) ?? null

  const analyticsRange = {
    ...range,
    channel,
    ...perChannelIntegrationIds(channel, selectedChannelIntegration?.id),
  }

  const promises = Promise.all([
    getAdsAnalyticsData(workspaceId, analyticsRange),
    getCapiDeliveryData(workspaceId, analyticsRange),
    getAdsAnalyticsTimeseries(workspaceId, analyticsRange),
  ])

  return (
    <div className="flex gap-6">
      {/* Nav filtering only — a deep link to a channel not in `adsChannels`
          (e.g. historical data for a since-disconnected channel) still
          renders below; it just won't have its own nav entry. */}
      <AnalyticsNav adsChannels={adsChannels} />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Suspense>
          <AdsAnalyticsView
            channel={channel}
            channelIntegrations={channelIntegrations}
            promises={promises}
            range={range}
            selectedChannelIntegrationId={
              selectedChannelIntegration?.id ?? null
            }
            workspaceCreatedAt={switcherData.workspaceCreatedAt}
            workspaceId={workspaceId}
          />
        </Suspense>
      </div>
    </div>
  )
}
