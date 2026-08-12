import { getIdFromParams } from "@chatbotx.io/utils"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ConversionEventsView } from "@/features/ads/components/conversion-events-view"
import { resolveSelectedIntegration } from "@/features/ads/lib/select-account"
import { getConversionEventsData } from "@/features/ads/queries/conversion-rules"
import { getAdsSwitcherData } from "@/features/ads/queries/switcher"
import { conversionEventsSearchParamsCache } from "@/features/ads/schemas/conversion-events"

export default async function ConversionEventsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  const search = conversionEventsSearchParamsCache.parse(
    await props.searchParams,
  )
  const [data, switcherData] = await Promise.all([
    getConversionEventsData(workspaceId),
    getAdsSwitcherData(workspaceId),
  ])
  const selectedAccount = resolveSelectedIntegration(
    data.whatsappIntegrations,
    search.account,
  )
  const promises = Promise.all([data])

  return (
    <Suspense>
      <ConversionEventsView
        promises={promises}
        selectedAccount={selectedAccount}
        switcherIntegrations={switcherData.integrations}
        whatsappCredentialPublic={switcherData.whatsappCredentialPublic}
        workspaceId={workspaceId}
      />
    </Suspense>
  )
}
