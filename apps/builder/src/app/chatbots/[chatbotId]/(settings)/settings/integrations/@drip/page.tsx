import { DripManage } from "@/features/integration-drip/drip-manage"
import { getDripIntegration } from "@/features/integration-drip/queries"

export default async function SettingIntegrationDripPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([getDripIntegration(params.chatbotId)])

  return <DripManage chatbotId={params.chatbotId} promises={promises} />
}
