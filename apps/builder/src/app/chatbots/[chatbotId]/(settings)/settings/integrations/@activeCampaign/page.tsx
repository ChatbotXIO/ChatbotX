import { ActiveCampaignManage } from "@/features/integration-active-campaign/active-campaign-manage"
import { getActiveCampaignIntegration } from "@/features/integration-active-campaign/queries"

export default async function SettingIntegrationActiveCampaignPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([getActiveCampaignIntegration(params.chatbotId)])

  return (
    <ActiveCampaignManage chatbotId={params.chatbotId} promises={promises} />
  )
}
