import { integrationFacebookAdsService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { FacebookAdsManage } from "@/features/integration-facebook-ads/facebook-ads-manage"
import { integrationFacebookAdsResource } from "@/features/integration-facebook-ads/schemas"

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

  return (
    <FacebookAdsManage
      integrationFacebookAds={data}
      workspaceId={workspaceId}
    />
  )
}
