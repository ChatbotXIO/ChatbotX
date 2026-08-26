import { perChannelIntegrationIds } from "@chatbotx.io/business"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AdsAnalyticsView } from "@/features/ads/components/ads-analytics-view"
import {
  getAdsAnalyticsData,
  getAdsAnalyticsTimeseries,
  getCapiDeliveryData,
} from "@/features/ads/queries/analytics"
import {
  type AdsSwitcherChannelIntegration,
  type AdsSwitcherData,
  getAdsSwitcherData,
} from "@/features/ads/queries/switcher"
import {
  type AdsAnalyticsChannel,
  adsAnalyticsSearchParamsCache,
  resolveAdsAnalyticsChannel,
} from "@/features/ads/schemas/analytics"
import { AnalyticsNav } from "@/features/analytics/components/analytics-nav"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

/** Integrations for the currently selected channel — populates the channel
 * filter's integration select. WhatsApp rows are labeled "name — phone"
 * (matching the old account switcher's display) since a workspace commonly
 * connects several numbers under similar names. "all" always resolves to an
 * empty list: no single integration spans every channel, so the channel
 * filter hides the integration select entirely under "All channels" — see
 * `ChannelFilter`. */
function resolveChannelIntegrations(
  channel: AdsAnalyticsChannel,
  switcherData: AdsSwitcherData,
): AdsSwitcherChannelIntegration[] {
  const byChannel: Record<
    AdsAnalyticsChannel,
    () => AdsSwitcherChannelIntegration[]
  > = {
    whatsapp: () =>
      switcherData.integrations.map((integration) => ({
        id: integration.id,
        name: integration.displayPhoneNumber
          ? `${integration.name} — ${integration.displayPhoneNumber}`
          : integration.name,
      })),
    messenger: () => switcherData.messengerIntegrations,
    instagram: () => switcherData.instagramIntegrations,
    all: () => [],
  }
  return byChannel[channel]()
}

export default async function AdsAnalyticsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(
    props.params,
    "superAdmin",
  )
  const search = adsAnalyticsSearchParamsCache.parse(await props.searchParams)
  const switcherData = await getAdsSwitcherData(workspaceId)

  // Preserve legacy WhatsApp deep links / the CAPI-connect redirect
  // (`?account=<id>`) against the channel filter's "all" default — see
  // `resolveAdsAnalyticsChannel`.
  const resolvedChannel = resolveAdsAnalyticsChannel(search)
  const resolvedSearch = { ...search, channel: resolvedChannel }

  // One unified integration select for every channel (channel filter's second
  // select): an empty `channelAccount` means "All accounts" — aggregate
  // across every connected integration of the selected channel (the business
  // layer treats each per-channel FK as optional narrowing, not a forced
  // single account). WhatsApp joins that contract too; the legacy `account`
  // URL param (still written by the CAPI-connect redirect flow and old
  // bookmarks) is honored as a fallback selection when `channelAccount` is
  // absent.
  const channelIntegrations = resolveChannelIntegrations(
    resolvedChannel,
    switcherData,
  )
  const requestedIntegrationId =
    search.channelAccount ||
    (resolvedChannel === "whatsapp" ? search.account : "")
  const selectedChannelIntegration =
    channelIntegrations.find(
      (integration) => integration.id === requestedIntegrationId,
    ) ?? null

  // "all" is UI-only (decision 1) and must be resolved into a separate
  // `allChannels` flag BEFORE it can reach `perChannelIntegrationIds` —
  // that helper types `channel` as `AdsConversionChannel`, which "all" is
  // never a member of. `selectedChannelIntegration` is always null here too
  // (`resolveChannelIntegrations` returns `[]` for "all"), so there is no
  // integration id to thread through either way.
  //
  // Otherwise: `selectedChannelIntegration` already IS `selectedAccount`
  // when `search.channel === "whatsapp"` (see its definition above), so a
  // single `perChannelIntegrationIds` call covers both — whichever FK
  // matches `search.channel` gets `selectedChannelIntegration?.id`, the
  // other two (and a "no integration selected yet" `undefined` id) resolve
  // to `undefined`, same as the ternary triplet this replaces.
  const analyticsRange =
    resolvedChannel === "all"
      ? { ...resolvedSearch, channel: undefined, allChannels: true as const }
      : {
          ...resolvedSearch,
          channel: resolvedChannel,
          ...perChannelIntegrationIds(
            resolvedChannel,
            selectedChannelIntegration?.id,
          ),
        }

  const promises = Promise.all([
    getAdsAnalyticsData(workspaceId, analyticsRange),
    getCapiDeliveryData(workspaceId, analyticsRange),
    getAdsAnalyticsTimeseries(workspaceId, analyticsRange),
  ])

  return (
    <div className="flex gap-6">
      {/* This page is superAdmin-guarded, so the Ads link is always shown. */}
      <AnalyticsNav showAds />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Suspense>
          <AdsAnalyticsView
            channel={resolvedChannel}
            channelIntegrations={channelIntegrations}
            promises={promises}
            range={resolvedSearch}
            selectedChannelIntegrationId={
              selectedChannelIntegration?.id ?? null
            }
            workspaceId={workspaceId}
          />
        </Suspense>
      </div>
    </div>
  )
}
