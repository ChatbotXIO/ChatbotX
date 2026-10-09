import {
  googleAdsConversionService,
  integrationGoogleAdsService,
  workspaceService,
} from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { AnalyticsNav } from "@/features/analytics/components/analytics-nav"
import { resolveAdsDashboardChannels } from "@/features/analytics/lib/ads-dashboard-channels"
import { resolveGoogleAdsDashboardEntry } from "@/features/analytics/lib/google-ads-dashboard-entry"
import { GoogleAdsStatsView } from "@/features/integration-google-ads/components/stats/google-ads-stats-view"
import { googleAdsStatsSearchParamsCache } from "@/features/integration-google-ads/schema/stats-search-params"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function GoogleAdsStatsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(
    props.params,
    "superAdmin",
  )
  // One instant per request: the view classifies the date preset against it on the
  // server and again on hydration, so a midnight in between cannot change the label.
  const referenceNow = new Date().toISOString()
  const search = googleAdsStatsSearchParamsCache.parse(await props.searchParams)

  // One round trip: the stats, the connection (for the empty / not-connected
  // states and the action filter) and the workspace birth (Lifetime preset).
  const [stats, setup, workspace, adsChannels, showGoogleAds] =
    await Promise.all([
      googleAdsConversionService.getStats({
        workspaceId,
        from: search.from,
        to: search.to,
        tz: search.tz,
        channel: search.channel ?? undefined,
        conversionActionId: search.action ?? undefined,
      }),
      integrationGoogleAdsService.getSetup(workspaceId),
      workspaceService.findById({ id: workspaceId }),
      // Guarded by `resolveGuardedWorkspaceId(..., "superAdmin")` above.
      resolveAdsDashboardChannels({ workspaceId, isSuperAdmin: true }),
      // Same rule as the other dashboard pages: the entry only lists itself once
      // an account is connected or conversions exist.
      resolveGoogleAdsDashboardEntry({ workspaceId, isSuperAdmin: true }),
    ])
  if (!workspace) {
    notFound()
  }
  // Google's own numbers for the same days; best effort, `unavailable` on any failure.
  const googleReport = setup
    ? await integrationGoogleAdsService.getConversionReport(workspaceId, {
        from: stats.range.from,
        to: stats.range.to,
      })
    : undefined

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <AnalyticsNav adsChannels={adsChannels} showGoogleAds={showGoogleAds} />
      <div className="min-w-0 flex-1">
        <GoogleAdsStatsView
          action={search.action}
          channel={search.channel}
          connected={setup !== null}
          googleReport={googleReport}
          referenceNow={referenceNow}
          stats={stats}
          syncedActions={(setup?.integration.conversionActions ?? []).map(
            (action) => ({ id: action.id, name: action.name }),
          )}
          workspaceCreatedAt={workspace.createdAt}
        />
      </div>
    </div>
  )
}
