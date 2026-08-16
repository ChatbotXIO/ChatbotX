import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AdsAnalyticsView } from "@/features/ads/components/ads-analytics-view"
import { resolveSelectedIntegration } from "@/features/ads/lib/select-account"
import {
  getAdsAnalyticsData,
  getAdsAnalyticsTimeseries,
  getCapiDeliveryData,
} from "@/features/ads/queries/analytics"
import { getAdsSwitcherData } from "@/features/ads/queries/switcher"
import { adsAnalyticsSearchParamsCache } from "@/features/ads/schemas/analytics"
import { AnalyticsNav } from "@/features/analytics/components/analytics-nav"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

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
  const selectedAccount = resolveSelectedIntegration(
    switcherData.integrations,
    search.account,
  )
  const promises = Promise.all([
    getAdsAnalyticsData(workspaceId, {
      ...search,
      integrationWhatsappId: selectedAccount?.id,
    }),
    getCapiDeliveryData(workspaceId, {
      ...search,
      integrationWhatsappId: selectedAccount?.id,
    }),
    getAdsAnalyticsTimeseries(workspaceId, {
      ...search,
      integrationWhatsappId: selectedAccount?.id,
    }),
  ])

  return (
    <div className="flex gap-6">
      {/* This page is superAdmin-guarded, so the Ads link is always shown. */}
      <AnalyticsNav showAds />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Suspense>
          <AdsAnalyticsView
            promises={promises}
            range={search}
            selectedIntegrationWhatsappId={selectedAccount?.id ?? null}
            switcherIntegrations={switcherData.integrations}
            whatsappCredentialPublic={switcherData.whatsappCredentialPublic}
            workspaceId={workspaceId}
          />
        </Suspense>
      </div>
    </div>
  )
}
