import { MoosendManage } from "@/features/integration-moosend/moosend-manage"
import { getMoosendIntegration } from "@/features/integration-moosend/queries"

export default async function MoosendIntegrationPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params
  const promises = Promise.all([getMoosendIntegration(chatbotId)])

  return <MoosendManage chatbotId={chatbotId} promises={promises} />
}
