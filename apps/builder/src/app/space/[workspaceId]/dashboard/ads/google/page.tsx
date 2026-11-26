import {
  googleAdsConversionService,
  integrationGoogleAdsService,
  workspaceService,
} from "@chatbotx.io/business"
import { notFound, redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { loadSharedFilters } from "@/features/analytics/lib/shared-filter-params"
import { GoogleAdsStatsView } from "@/features/integration-google-ads/components/stats/google-ads-stats-view"
import { resolveGoogleStatsChannel } from "@/features/integration-google-ads/lib/resolve-stats-channel"
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
  const searchParams = await props.searchParams
  const search = googleAdsStatsSearchParamsCache.parse(searchParams)
  // The channel comes from the shared Channel filter (one Google channel, else
  // all); the section has no channel control of its own.
  const sharedChannels = loadSharedFilters(searchParams).channels

  // An older link carried the channel as `channel`; it becomes the shared
  // `channels` selection (shown in the shared row) and leaves the URL.
  if (sharedChannels.length === 0 && search.channel) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (key !== "channel") {
        for (const item of [value ?? []].flat()) {
          params.append(key, item)
        }
      }
    }
    params.set("channels", search.channel)
    redirect(`/space/${workspaceId}/dashboard/ads/google?${params.toString()}`)
  }

  const channel = resolveGoogleStatsChannel(sharedChannels)

  // One round trip: the stats, the connection (for the empty / not-connected
  // states and the action filter) and the workspace birth (Lifetime preset).
  const [stats, setup, workspace] = await Promise.all([
    googleAdsConversionService.getStats({
      workspaceId,
      from: search.from,
      to: search.to,
      tz: search.tz,
      channel,
      conversionActionId: search.action ?? undefined,
    }),
    integrationGoogleAdsService.getSetup(workspaceId),
    workspaceService.findById({ id: workspaceId }),
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
    <div className="min-w-0">
      <GoogleAdsStatsView
        action={search.action}
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
  )
}
