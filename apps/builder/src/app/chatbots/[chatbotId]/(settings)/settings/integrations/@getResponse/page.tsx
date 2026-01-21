import { GetResponseManage } from "@/features/integration-get-response/get-response-manage"
import { getGetResponseIntegration } from "@/features/integration-get-response/queries"

export default async function SettingIntegrationGetResponsePage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([getGetResponseIntegration(params.chatbotId)])

  return <GetResponseManage chatbotId={params.chatbotId} promises={promises} />
}
