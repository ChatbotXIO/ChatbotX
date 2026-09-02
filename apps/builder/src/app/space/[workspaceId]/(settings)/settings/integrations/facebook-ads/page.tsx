import { integrationFacebookAdsService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { AdAccountsSection } from "@/features/integration-facebook-ads/components/ad-accounts-section"
import { FacebookAdsManage } from "@/features/integration-facebook-ads/facebook-ads-manage"
import { needsFacebookAdsReconnect } from "@/features/integration-facebook-ads/lib/needs-reconnect"
import { integrationFacebookAdsResource } from "@/features/integration-facebook-ads/schema"

export default async function SettingIntegrationFacebookAdsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const integrationFacebookAdsRow =
    await integrationFacebookAdsService.findByWorkspaceId(workspaceId)

  const { data } = integrationFacebookAdsResource.safeParse(
    integrationFacebookAdsRow,
  )
  const facebookAds = data
    ? { connected: true, needsReconnect: needsFacebookAdsReconnect(data) }
    : { connected: false, needsReconnect: false }

  return (
    <div className="flex flex-col gap-4">
      <FacebookAdsManage
        integrationFacebookAds={data}
        workspaceId={workspaceId}
      />
      {/* Connected Meta ad accounts are listed here (moved from the
          Analytics > Ads screen). */}
      {facebookAds.connected && (
        <AdAccountsSection
          facebookAds={facebookAds}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}
