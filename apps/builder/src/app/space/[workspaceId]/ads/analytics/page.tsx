import { getIdFromParams } from "@chatbotx.io/utils"
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

export default async function AdsAnalyticsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
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
  )
}
