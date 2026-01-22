import { getSendFoxIntegration } from "@/features/integration-send-fox/queries"
import { SendFoxManage } from "@/features/integration-send-fox/send-fox-manage"

export default async function SendFoxIntegrationPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params
  const promises = Promise.all([getSendFoxIntegration(chatbotId)])

  return <SendFoxManage chatbotId={chatbotId} promises={promises} />
}
