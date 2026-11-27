import {
  adsAnalyticsService,
  type CapiDeliverySummary,
} from "@chatbotx.io/business"
import {
  type AdsEligibleChannelType,
  adsEligibleChannelTypes,
} from "@chatbotx.io/utils/channel"
import { notFound, redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AdsAnalyticsView } from "@/features/ads/components/ads-analytics-view"
import { AdsReferralStats } from "@/features/ads/components/ads-referral-stats"
import { resolveChannelIntegrations } from "@/features/ads/lib/resolve-channel-integrations"
import {
  resolveIntegrationScope,
  resolveLegacyInboxId,
  singleIntegrationId,
} from "@/features/ads/lib/resolve-selected-integration-ids"
import { getAdsSwitcherData } from "@/features/ads/queries/switcher"
import {
  adsAnalyticsSearchParamsCache,
  parseAnalyticsDateRange,
} from "@/features/ads/schema/analytics"
import { loadSharedFilters } from "@/features/analytics/lib/shared-filter-params"
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

/** The section URL with the legacy account params swapped for `inboxIds`. */
function withLegacyAdsParamsReplaced(input: {
  path: string
  searchParams: SearchParams
  inboxId: string
}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input.searchParams)) {
    if (key === "channelAccount" || key === "account") {
      continue
    }
    for (const item of [value ?? []].flat()) {
      params.append(key, item)
    }
  }
  params.set("inboxIds", input.inboxId)
  return `${input.path}?${params.toString()}`
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

  const searchParams = await props.searchParams
  const search = adsAnalyticsSearchParamsCache.parse(searchParams)
  const shared = loadSharedFilters(searchParams)
  const range = { ...search, channel }
  // The same validated, capped days the rest of the dashboard falls back to
  // when the URL carries a malformed or oversized range.
  const resolvedRange = parseAnalyticsDateRange(search)
  // Guarded by `resolveGuardedWorkspaceId(..., "superAdmin")` above, so
  // isSuperAdmin is always true here.
  const switcherData = await getAdsSwitcherData(workspaceId)

  // The integration scope is the shared Inbox filter's selection (`inboxIds`)
  // mapped onto this channel's integrations; the channel itself is the route
  // segment, so the shared Channel picker does not change this data.
  // `all` = no inbox selected; `none` = an explicit selection that matches no
  // integration of this channel, which shows empty results (never "all").
  const channelIntegrations = resolveChannelIntegrations(channel, switcherData)

  // A legacy `channelAccount` / `account` link (CAPI-connect redirect, old
  // bookmarks; `account` is WhatsApp-only) is converted to the shared
  // `inboxIds` form while no inbox is selected, so the effective scope shows in
  // the shared row and the legacy params leave the URL.
  if (shared.inboxIds.length === 0) {
    const legacyInboxId = resolveLegacyInboxId({
      integrations: channelIntegrations,
      legacyIntegrationId:
        search.channelAccount || (channel === "whatsapp" ? search.account : ""),
    })
    if (legacyInboxId) {
      redirect(
        withLegacyAdsParamsReplaced({
          path: `/space/${workspaceId}/dashboard/ads/${channel}`,
          searchParams,
          inboxId: legacyInboxId,
        }),
      )
    }
  }

  const scope = resolveIntegrationScope({
    integrations: channelIntegrations,
    inboxIds: shared.inboxIds,
  })
  const selectedIntegrationIds = scope.kind === "selected" ? scope.ids : []
  const hasIntegrationScope = scope.kind !== "all"
  // Surfaces that only take one integration (CSV export, retarget, broadcast)
  // follow it only when exactly one is selected; they are disabled otherwise.
  const singleId = singleIntegrationId(scope)

  const analyticsScope = {
    workspaceId,
    from: range.from,
    to: range.to,
    tz: range.tz,
    channel,
    integrationIds:
      selectedIntegrationIds.length > 0 ? selectedIntegrationIds : undefined,
    matchesNoIntegration: scope.kind === "none",
    adAccountId: range.adAccount,
  }

  const promises = Promise.all([
    adsAnalyticsService.getOverview(analyticsScope),
    // TEMPORARILY HIDDEN (conversion tracking unfinished): the delivery card
    // that consumes this is commented out in `AdsAnalyticsView`, so running
    // the query would cost every dashboard load a round trip nothing renders.
    // A resolved zero summary keeps the tuple shape — and therefore the
    // component's `promises` prop type — unchanged, so restoring the card is
    // swapping this one line back for:
    //   adsAnalyticsService.getCapiDelivery(analyticsScope),
    Promise.resolve<CapiDeliverySummary>({
      sent: 0,
      pending: 0,
      failed: 0,
      skippedNoScope: 0,
      skippedRegion: 0,
    }),
    adsAnalyticsService.getTimeseries(analyticsScope),
  ])

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Suspense>
        <AdsAnalyticsView
          channel={channel}
          matchesNoIntegration={scope.kind === "none"}
          promises={promises}
          range={range}
          selectedChannelIntegrationId={singleId}
          selectedChannelIntegrationIds={selectedIntegrationIds}
          workspaceCreatedAt={switcherData.workspaceCreatedAt}
          workspaceId={workspaceId}
        />
      </Suspense>
      {/* Counts every account of the channel, so it would contradict a
          narrowed view; shown only for "All accounts". */}
      {hasIntegrationScope ? null : (
        <AdsReferralStats
          channel={channel}
          range={{
            from: resolvedRange.from,
            to: resolvedRange.to,
            tz: resolvedRange.timezone,
          }}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}
